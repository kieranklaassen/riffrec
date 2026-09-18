// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCapture } from "../../capture/voice";
import { MemoryFrameStore } from "../buffer";
import { SILENCE_CHECKPOINT_MS } from "../checkpoints";
import {
  LIVE_SESSION_HEADER,
  type LiveAnchor,
  type LiveFrame,
  type LiveMintError,
  type LiveMintResponse,
  type LiveTranscript
} from "../contract";
import { LiveSession } from "../session";
import { createFakeEndpoint, type FakeEndpoint } from "../testing/fakeEndpoint";
import { createFakeRealtime, type FakeRealtime } from "../testing/fakeRealtime";
import { SharedMicrophone, type AudioTrackLike } from "./audioRouting";
import {
  CLICK_ANNOUNCE_DEDUPE_MS,
  FRAMES_DISABLED_DETAIL,
  Interviewer,
  NO_FRAME_DETAIL,
  PROACTIVE_FRAME_MIN_INTERVAL_MS,
  QUESTION_SILENCE_MS,
  RESEED_MAX_CHARS,
  RESPONSE_CONFIRM_TIMEOUT_MS,
  RESPONSE_GATE_RESET_MS,
  buildReseedText,
  createInterviewer,
  isNoiseTranscript,
  isVisualReference,
  type InterviewerOptions,
  type ScreenLook
} from "./interviewer";
import { DEFAULT_INTERVIEWER_INSTRUCTIONS, SCREEN_CONTEXT_MARKER, SCREEN_CONTEXT_SECTION } from "./persona";

// --- Harness ---------------------------------------------------------------

interface Harness {
  endpoint: FakeEndpoint;
  session: LiveSession;
  realtime: FakeRealtime;
  interviewer: Interviewer;
  mintRequests: Array<{ init: RequestInit | undefined }>;
  connects: number;
  errors: unknown[];
  clock(): number;
  /** Runs `start()` and waits until the session is live. */
  goLive(): Promise<void>;
  /** Records one unit through the tool path and waits for the endpoint to hold it. */
  recordUnit(statement?: string, anchors?: string[]): Promise<string>;
  /** Asks a question from the endpoint side and waits for the interviewer to queue it. */
  ask(unitId: string, question: string): Promise<void>;
  questionTexts(): string[];
}

const MINT_OK: LiveMintResponse = { client_secret: "ek_test_0123456789abcdef", expires_at: 1789686600, model: "gpt-realtime" };

const sessions: LiveSession[] = [];
const interviewers: Interviewer[] = [];

function harness(options: { onMint?: (count: number) => void; interviewer?: Partial<InterviewerOptions> } = {}): Harness {
  const endpoint = createFakeEndpoint();
  const realtime = createFakeRealtime();
  const mintRequests: Harness["mintRequests"] = [];
  const errors: unknown[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const isMint = String(input).endsWith("/mint");
    const response = await endpoint.fetch(input, init);
    if (isMint) {
      mintRequests.push({ init });
      options.onMint?.(mintRequests.length);
    }
    return response;
  };
  const session = LiveSession.create({
    bootstrap: { token: endpoint.pageToken, endpoint: endpoint.baseUrl },
    storage: sessionStorage,
    frameStore: new MemoryFrameStore(),
    fetch: fetchImpl,
    schedule: (callback) => queueMicrotask(callback),
    route: () => "/settings",
    pageHideTarget: null,
    sessionId: "sess_voice_0001",
    backoffMs: [5, 5, 5]
  });
  sessions.push(session);
  const state = { connects: 0 };
  const interviewer = createInterviewer({
    session,
    connect: () => {
      state.connects += 1;
      return realtime;
    },
    fetch: fetchImpl,
    onError: (error) => errors.push(error),
    ...options.interviewer
  });
  interviewers.push(interviewer);

  const h: Harness = {
    endpoint,
    session,
    realtime,
    interviewer,
    mintRequests,
    errors,
    get connects() {
      return state.connects;
    },
    clock: () => Date.now(),
    goLive: async () => {
      session.start();
      await interviewer.start();
      expect(session.status).toBe("live");
    },
    recordUnit: async (statement = "Make the save button red.", anchors = []) => {
      const before = session.allUnits().length;
      await realtime.emit(
        realtime.toolCall({
          name: "record_unit",
          arguments: { statement, anchors, transcript_excerpt: statement.toLowerCase() }
        })
      );
      const unit = session.allUnits()[before];
      expect(unit).toBeDefined();
      await vi.waitFor(() => expect(endpoint.status().units.some((entry) => entry.id === unit.id)).toBe(true));
      return unit.id;
    },
    ask: async (unitId, question) => {
      const before = interviewer.status.queuedQuestions.length + (interviewer.status.voicing ? 1 : 0);
      await endpoint.ask(unitId, question);
      await vi.waitFor(() =>
        expect(interviewer.status.queuedQuestions.length + (interviewer.status.voicing ? 1 : 0)).toBe(before + 1)
      );
    },
    questionTexts: () => realtime.sentTexts.filter((text) => text.startsWith("[ENDPOINT QUESTION]"))
  };
  return h;
}

function anchor(t = 100): LiveAnchor {
  return { route: "/settings", selector: "button.save", component: "Save", rect: { x: 1, y: 2, width: 3, height: 4 }, t };
}

function transcript(id: string, text: string, t: number): LiveTranscript {
  return { id, role: "riffer", text, t_start: t - 500, t_end: t, final: true };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(async () => {
  for (const interviewer of interviewers.splice(0)) interviewer.stop();
  for (const session of sessions.splice(0)) await session.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Connection and mint ---------------------------------------------------

describe("Interviewer connection", () => {
  it("mints through the endpoint with the page credentials and moves the session to live", async () => {
    const h = harness();
    h.session.start();
    expect(h.session.status).toBe("connecting");
    await h.interviewer.start();

    expect(h.session.status).toBe("live");
    expect(h.mintRequests).toHaveLength(1);
    expect(h.mintRequests[0].init?.headers).toMatchObject({
      Authorization: `Bearer ${h.endpoint.pageToken}`,
      [LIVE_SESSION_HEADER]: h.session.id
    });
    expect(JSON.parse(String(h.mintRequests[0].init?.body))).toEqual({ session_id: h.session.id });
    expect(h.connects).toBe(1);
    expect(h.realtime.connected).toBe(true);
    expect(h.realtime.actions).toEqual([]);
  });

  it.each([
    [{ status: 503, reason: "no_key" } satisfies LiveMintError, { kind: "refused", reason: "no_key", status: 503 }],
    [{ status: 503, reason: "brief_contains_secret" } satisfies LiveMintError, { kind: "refused", reason: "brief_contains_secret" }],
    [
      { status: 502, reason: "openai_error", upstream_status: 500 } satisfies LiveMintError,
      { kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 500 }
    ],
    [{ status: 401 } satisfies LiveMintError, { kind: "refused", reason: "unauthorized", status: 401 }],
    [{ status: 403, reason: "tls_required" } satisfies LiveMintError, { kind: "refused", reason: "tls_required" }]
  ])("mint %j settles the session in live_novoice with the reason", async (mint, unavailable) => {
    const h = harness();
    h.endpoint.mint = mint;
    h.session.start();
    await h.interviewer.start();

    expect(h.session.status).toBe("live_novoice");
    expect(h.interviewer.status.unavailable).toMatchObject(unavailable);
    expect(h.session.snapshot().voiceUnavailable).toMatchObject(unavailable);
    expect(h.mintRequests).toHaveLength(1);
    expect(h.connects).toBe(0);
  });

  it("keeps the session in connecting on a single 429, re-mints after retry_after, and reaches live", async () => {
    const h = harness({
      onMint: (count) => {
        if (count === 1) h.endpoint.mint = MINT_OK;
      }
    });
    h.endpoint.mint = { status: 429, retry_after: 2 };
    h.session.start();
    const started = h.interviewer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(h.mintRequests).toHaveLength(1);
    expect(h.session.status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.mintRequests).toHaveLength(1);
    expect(h.session.status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1);
    await started;

    expect(h.mintRequests).toHaveLength(2);
    expect(h.session.status).toBe("live");
    expect(h.interviewer.status.unavailable).toBeNull();
  });

  it("settles in live_novoice after three consecutive 429s, and an explicit retry can still bring voice back", async () => {
    const h = harness();
    h.endpoint.mint = { status: 429, retry_after: 1 };
    h.session.start();
    const started = h.interviewer.start();
    await vi.advanceTimersByTimeAsync(5000);
    await started;

    expect(h.mintRequests).toHaveLength(3);
    expect(h.session.status).toBe("live_novoice");
    expect(h.interviewer.status.unavailable).toEqual({ kind: "exhausted", reason: "throttled" });

    h.endpoint.mint = MINT_OK;
    await h.interviewer.retryVoice();
    expect(h.mintRequests).toHaveLength(4);
    expect(h.session.status).toBe("live");
  });

  it("re-mints on a dropped connection and re-seeds the replacement with a bounded window", async () => {
    const h = harness();
    await h.goLive();
    const kept = await h.recordUnit("Make the save button red.");
    const gone = await h.recordUnit("Hide the footer.");
    await h.realtime.emit(h.realtime.toolCall({ name: "withdraw_unit", arguments: { unit_id: gone } }));
    for (let i = 0; i < 120; i += 1) {
      await h.realtime.emit({
        type: "transcript",
        transcript: transcript(`old_${i}`, `old line ${i} ${"x".repeat(80)}`, 1000 + i)
      });
    }
    await vi.advanceTimersByTimeAsync(200_000);
    for (let i = 0; i < 120; i += 1) {
      await h.realtime.emit({
        type: "transcript",
        transcript: transcript(`recent_${i}`, `recent line ${i} ${"y".repeat(80)}`, h.clock() - h.session.startedAt)
      });
    }
    const actionsBefore = h.realtime.actions.length;

    await h.realtime.emit({ type: "closed", reason: "peer_failed" });
    expect(h.session.status).toBe("reconnecting");
    expect(h.realtime.actions[actionsBefore]).toEqual({ type: "close" });
    await vi.waitFor(() => expect(h.session.status).toBe("live"));

    expect(h.mintRequests).toHaveLength(2);
    expect(h.connects).toBe(2);
    const first = h.realtime.actions[actionsBefore + 1];
    expect(first.type).toBe("send_text");
    const reseed = first.type === "send_text" ? first.text : "";
    expect(reseed.startsWith("[RECONNECT]")).toBe(true);
    expect(reseed.length).toBeLessThanOrEqual(RESEED_MAX_CHARS);
    expect(reseed.length).toBeGreaterThan(RESEED_MAX_CHARS - 200);
    expect(reseed).toContain(`${kept} (initial): Make the save button red.`);
    expect(reseed).not.toContain("Hide the footer.");
    expect(reseed).not.toContain("old line");
    expect(reseed).toContain("recent line 119");
    expect(h.realtime.actionsNamed("update_session")).toEqual([]);
  });

  it("closes the lost call even when the re-mint is refused", async () => {
    const h = harness();
    await h.goLive();
    h.endpoint.mint = { status: 503, reason: "no_key" };
    await h.realtime.emit({ type: "closed", reason: "peer_failed" });
    await vi.waitFor(() => expect(h.session.status).toBe("live_novoice"));
    expect(h.realtime.actionsNamed("close")).toHaveLength(1);
    expect(h.realtime.closed).toBe(true);
    expect(h.interviewer.status.connected).toBe(false);
    expect(h.connects).toBe(1);
  });

  it("stop closes the transport, and a session end stops the interviewer", async () => {
    const h = harness();
    await h.goLive();
    await h.session.stop();
    expect(h.realtime.closed).toBe(true);
    expect(h.interviewer.status.connected).toBe(false);
    await h.realtime.emit({ type: "closed" });
    expect(h.mintRequests).toHaveLength(1);
  });
});

// --- Tools ----------------------------------------------------------------

describe("Interviewer tools", () => {
  it("record_unit creates an initial unit with announced anchors copied verbatim and answers in the same tick without a response", async () => {
    const h = harness();
    await h.goLive();
    const drawn = h.interviewer.announceDrawing({ anchor: anchor(400), description: "the save button" });
    expect(h.realtime.sentTexts).toEqual([`[PAGE] The riffer drew on the save button (anchor id: ${drawn.id}).`]);
    await h.realtime.emit({ type: "transcript", transcript: transcript("t1", "make this red", 900) });

    const pending = h.realtime.emit(
      h.realtime.toolCall({
        name: "record_unit",
        arguments: { statement: "Make the save button red.", anchors: [drawn.id], transcript_excerpt: "make this red" }
      })
    );
    expect(h.realtime.toolResults).toHaveLength(1);
    await pending;

    const [unit] = h.session.allUnits();
    expect(unit).toMatchObject({
      status: "initial",
      statement: "Make the save button red.",
      transcript_excerpt: "make this red",
      anchors: [anchor(400)],
      evidence: { transcript_span: { t_start: 400, t_end: 900 } }
    });
    expect(h.realtime.toolResults[0]).toEqual({ call_id: "call_0001", output: { ok: true, unit_id: unit.id, anchors_resolved: 1 } });
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);
  });

  it("an empty riffer transcript neither reaches the session nor overwrites the span the next unit copies", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({ type: "transcript", transcript: transcript("t_words", "make this red", 900) });
    await h.realtime.emit({ type: "transcript", transcript: transcript("t_empty", "   ", 3000) });
    await h.realtime.emit(
      h.realtime.toolCall({ name: "record_unit", arguments: { statement: "Make it red.", anchors: [], transcript_excerpt: "make this red" } })
    );
    expect(h.session.fullTranscript().map((entry) => entry.id)).toEqual(["t_words"]);
    expect(h.session.allUnits()[0].evidence.transcript_span).toEqual({ t_start: 400, t_end: 900 });
  });

  it("resolves anchors by description and by recency, and reports what it could not resolve", async () => {
    const h = harness();
    await h.goLive();
    h.interviewer.noteAnchor(anchor(100), "the sidebar toggle", "anchor_toggle");
    await h.realtime.emit(
      h.realtime.toolCall({
        name: "record_unit",
        arguments: { statement: "Move the sidebar toggle right.", anchors: ["The Sidebar Toggle", "the mystery"], transcript_excerpt: "move the toggle right" }
      })
    );
    expect(h.session.allUnits()[0].anchors).toEqual([anchor(100)]);
    expect(h.realtime.toolResults[0].output).toMatchObject({ ok: true, anchors_resolved: 1 });

    await vi.advanceTimersByTimeAsync(20_000);
    await h.realtime.emit(
      h.realtime.toolCall({
        name: "record_unit",
        arguments: { statement: "Make that bigger.", anchors: ["that"], transcript_excerpt: "make that bigger" }
      })
    );
    expect(h.session.allUnits()[1].anchors).toEqual([]);
    expect(h.realtime.toolResults[1].output).toMatchObject({ ok: true, anchors_resolved: 0, anchors_unresolved: ["that"] });
  });

  it("gates noise: 'uh' and 'hmm okay' create no unit, 'make this red' does", async () => {
    const h = harness();
    await h.goLive();
    for (const noise of ["uh", "hmm okay"]) {
      await h.realtime.emit({ type: "transcript", transcript: transcript(`n_${noise}`, noise, 500) });
      await h.realtime.emit(
        h.realtime.toolCall({ name: "record_unit", arguments: { statement: `Do ${noise}`, anchors: [], transcript_excerpt: noise } })
      );
    }
    expect(h.session.allUnits()).toEqual([]);
    expect(h.realtime.toolResults.map((result) => result.output.reason)).toEqual(["noise", "noise"]);

    await h.realtime.emit({ type: "transcript", transcript: transcript("t_red", "make this red", 900) });
    await h.realtime.emit(
      h.realtime.toolCall({ name: "record_unit", arguments: { statement: "Make it red.", anchors: [], transcript_excerpt: "make this red" } })
    );
    expect(h.session.allUnits()).toHaveLength(1);
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);
  });

  it("update_unit and withdraw_unit map onto the session and report rejections", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit("Make the save button red.");
    await h.realtime.emit(h.realtime.toolCall({ name: "update_unit", arguments: { unit_id: id, statement: "Make the save button crimson." } }));
    expect(h.session.unit(id)?.statement).toBe("Make the save button crimson.");

    await h.endpoint.setUnitStatus(id, "triaging");
    await vi.waitFor(() => expect(h.session.isReleased(id)).toBe(true));
    await h.realtime.emit(h.realtime.toolCall({ name: "update_unit", arguments: { unit_id: id, statement: "Something else." } }));
    expect(h.realtime.toolResults[2].output).toMatchObject({ ok: false, reason: "released" });
    expect(h.session.unit(id)?.statement).toBe("Make the save button crimson.");

    await h.realtime.emit(h.realtime.toolCall({ name: "withdraw_unit", arguments: { unit_id: id, reason: "never mind" } }));
    expect(h.session.unit(id)?.status).toBe("withdrawn");
    expect(h.realtime.toolResults[3].output).toEqual({ ok: true, unit_id: id, after_release: true });
    await h.realtime.emit(h.realtime.toolCall({ name: "withdraw_unit", arguments: { unit_id: "unit_9999" } }));
    expect(h.realtime.toolResults[4].output).toEqual({ ok: false, reason: "unknown_unit" });
  });

  it("relay_answer moves the answer into the session and the next batch carries it", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.session.send();
    const first = await h.endpoint.wait();
    await h.endpoint.ack((first.body as { checkpoint_id: string }).checkpoint_id);
    await h.ask(id, "Which shade of red?");
    expect(h.session.unit(id)?.status).toBe("needs_info");

    await h.realtime.emit(h.realtime.toolCall({ name: "relay_answer", arguments: { unit_id: id, answer_text: "The brand red" } }));
    expect(h.realtime.toolResults.at(-1)?.output).toEqual({ ok: true, unit_id: id });
    expect(h.session.openQuestions()).toEqual([]);
    expect(h.interviewer.status.queuedQuestions).toEqual([]);
    const batch = (await h.endpoint.wait()).body as { kind: string; answers: Array<{ unit_id: string; text: string }> };
    expect(batch.kind).toBe("answer");
    expect(batch.answers).toEqual([{ unit_id: id, text: "The brand red" }]);
  });

  it("forwards speech events to the checkpoint timer so a silence checkpoint follows a unit", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({ type: "speech_started", t: 100 });
    expect(h.session.isSpeaking).toBe(true);
    await h.recordUnit();
    await h.realtime.emit({ type: "speech_stopped", t: 2000 });
    await vi.advanceTimersByTimeAsync(SILENCE_CHECKPOINT_MS - 1);
    expect(h.session.allCheckpoints()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.session.allCheckpoints()).toHaveLength(1);
    expect(h.session.allCheckpoints()[0].trigger).toBe("silence");
  });
});

// --- Conversation rules (KTD6) ---------------------------------------------

describe("Interviewer conversation rules", () => {
  it("covers AE6: a question arriving during an active response is voiced only after response_done plus 1.5 s of silence", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.realtime.emit({ type: "response_started", response_id: "resp_1" });
    await h.ask(id, "Which shade of red?");
    expect(h.questionTexts()).toEqual([]);
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);

    await vi.advanceTimersByTimeAsync(5000);
    expect(h.questionTexts()).toEqual([]);

    await h.realtime.emit({ type: "response_done", response_id: "resp_1" });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS - 1);
    expect(h.questionTexts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(h.questionTexts()).toHaveLength(1);
    expect(h.questionTexts()[0]).toContain(`unit ${id}`);
    expect(h.questionTexts()[0]).toContain("Which shade of red?");
    expect(h.realtime.actionsNamed("create_response")).toHaveLength(1);
    const texts = h.realtime.actions.map((action) => action.type);
    expect(texts.indexOf("send_text")).toBeLessThan(texts.indexOf("create_response"));
  });

  it("waits for the riffer to pause before voicing a question", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.realtime.emit({ type: "speech_started", t: 100 });
    await h.ask(id, "Which shade of red?");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.questionTexts()).toEqual([]);

    await h.realtime.emit({ type: "speech_stopped", t: 10_100 });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS - 1);
    expect(h.questionTexts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.questionTexts()).toHaveLength(1);
  });

  it("re-queues a question the riffer interrupted and asks it again at the next pause", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.ask(id, "Which shade of red?");
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(1);
    await h.realtime.emit({ type: "response_started", response_id: "resp_q" });

    await h.realtime.emit({ type: "speech_started", t: 5000 });
    await h.realtime.emit({ type: "response_done", response_id: "resp_q" });
    expect(h.interviewer.status.queuedQuestions.map((question) => question.unit_id)).toEqual([id]);
    expect(h.questionTexts()).toHaveLength(1);

    await h.realtime.emit({ type: "speech_stopped", t: 8000 });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(2);
    expect(h.realtime.actionsNamed("create_response")).toHaveLength(2);
  });

  it("does not create a response after a tool result unless a question is pending, and then only once the response settles", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.ask(id, "Which shade of red?");
    await h.realtime.emit({ type: "response_started", response_id: "resp_2" });
    await h.realtime.emit(
      h.realtime.toolCall({ name: "record_unit", arguments: { statement: "Hide the footer.", anchors: [], transcript_excerpt: "hide the footer" } })
    );
    expect(h.realtime.toolResults).toHaveLength(2);
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);

    await h.realtime.emit({ type: "response_done", response_id: "resp_2" });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.realtime.actionsNamed("create_response")).toHaveLength(1);
  });

  it("skips a queued question that was answered on the board before it could be voiced", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.realtime.emit({ type: "response_started", response_id: "resp_3" });
    await h.ask(id, "Which shade of red?");
    h.session.answer(id, "typed: brand red");
    await h.realtime.emit({ type: "response_done", response_id: "resp_3" });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS * 2);
    expect(h.questionTexts()).toEqual([]);
    expect(h.interviewer.status.queuedQuestions).toEqual([]);
  });

  it("holds page-side facts while a response is active and sends them once it settles", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({ type: "response_started", response_id: "resp_4" });
    h.interviewer.announceBuffering("buffering");
    h.interviewer.announceDrawing({ anchor: anchor(), description: "the footer", kind: "pin" });
    expect(h.realtime.sentTexts).toEqual([]);
    await h.realtime.emit({ type: "response_done", response_id: "resp_4" });
    expect(h.realtime.sentTexts).toEqual([
      "[PAGE] The page lost its connection to the coding agent and is buffering; units still land on the board.",
      "[PAGE] The riffer pinned the footer (anchor id: anchor_0001)."
    ]);
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);
  });

  it("does not stall after a busy error when the other response's done never arrives: the gate resets on a timer", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.ask(id, "Which shade of red?");
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(1);
    await h.realtime.emit({ type: "error", message: "conversation_already_has_active_response: busy" });

    await vi.advanceTimersByTimeAsync(RESPONSE_CONFIRM_TIMEOUT_MS - 1);
    expect(h.questionTexts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 + QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(2);
    expect(h.interviewer.status.responseActive).toBe(true);
  });

  it("re-queues an unconfirmed response.create and resets a confirmed response whose done never arrives", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.ask(id, "Which shade of red?");
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RESPONSE_CONFIRM_TIMEOUT_MS + QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(2);

    await h.realtime.emit({ type: "response_started", response_id: "resp_lost" });
    await vi.advanceTimersByTimeAsync(RESPONSE_GATE_RESET_MS - 1);
    expect(h.questionTexts()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1 + QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(3);
    expect(h.errors.some((error) => String(error).includes("response gate reset"))).toBe(true);
  });

  it("re-queues a question whose response.create lost the race with an active response", async () => {
    const h = harness();
    await h.goLive();
    const id = await h.recordUnit();
    await h.ask(id, "Which shade of red?");
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(1);
    await h.realtime.emit({ type: "error", message: "conversation_already_has_active_response: busy" });
    expect(h.interviewer.status.queuedQuestions.map((question) => question.unit_id)).toEqual([id]);
    await h.realtime.emit({ type: "response_done", response_id: "resp_other" });
    await vi.advanceTimersByTimeAsync(QUESTION_SILENCE_MS);
    expect(h.questionTexts()).toHaveLength(2);
  });
});

// --- Shared microphone (KTD21) ---------------------------------------------

class FakeTrack implements AudioTrackLike {
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  readonly clones: FakeTrack[] = [];

  constructor(readonly label: string) {}

  clone(): FakeTrack {
    const clone = new FakeTrack(`${this.label}#${this.clones.length + 1}`);
    this.clones.push(clone);
    return clone;
  }

  stop(): void {
    this.readyState = "ended";
  }
}

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true;
  }
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly stream: MediaStream) {}

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.(new Event("stop"));
  }
}

describe("Interviewer mute (KTD21)", () => {
  it("muting disables the Realtime clone and the VoiceCapture clone together, and tells the interviewer", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const source = new FakeTrack("mic");
    const microphone = new SharedMicrophone(
      { getAudioTracks: () => [source] },
      { createStream: (tracks) => ({ getAudioTracks: () => tracks, getTracks: () => tracks }) as unknown as MediaStream }
    );
    const h = harness({ interviewer: { microphone } });
    await h.goLive();
    const realtimeClone = microphone.clone("realtime");
    const voice = new VoiceCapture();
    expect(await voice.start(microphone.clone("voice_capture"))).toBe(true);
    const voiceClone = voice.activeStream!;

    h.interviewer.setMuted(true);

    expect(realtimeClone.getAudioTracks().every((track) => !track.enabled)).toBe(true);
    expect(voiceClone.getAudioTracks().every((track) => !track.enabled)).toBe(true);
    expect(source.enabled).toBe(false);
    expect(h.realtime.muted).toBe(true);
    expect(h.session.isMuted).toBe(true);
    expect(h.session.snapshot().mic).toBe("muted");
    expect(h.realtime.sentTexts.at(-1)).toBe("[PAGE] The riffer muted their microphone; expect silence.");

    h.interviewer.setMuted(false);
    expect(realtimeClone.getAudioTracks().every((track) => track.enabled)).toBe(true);
    expect(voiceClone.getAudioTracks().every((track) => track.enabled)).toBe(true);
    expect(h.realtime.muted).toBe(false);

    await voice.stop();
    expect(voiceClone.getAudioTracks().every((track) => track.readyState === "live")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("delivers a drawing announced while the link was down once the replacement connects, after the re-seed", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({ type: "closed" });
    h.interviewer.announceDrawing({ anchor: anchor(), description: "the footer" });
    await vi.waitFor(() => expect(h.session.status).toBe("live"));
    const texts = h.realtime.sentTexts;
    expect(texts[0].startsWith("[RECONNECT]")).toBe(true);
    expect(texts[1]).toBe("[PAGE] The riffer drew on the footer (anchor id: anchor_0001).");
  });

  it("a reconnect while muted starts the replacement transport muted", async () => {
    const h = harness();
    await h.goLive();
    h.interviewer.setMuted(true);
    await h.realtime.emit({ type: "closed" });
    await vi.waitFor(() => expect(h.session.status).toBe("live"));
    expect(h.realtime.actionsNamed("set_muted").map((action) => action.muted)).toEqual([true, true]);
  });
});

// --- Screen context: clicks, look_at_screen, proactive frames -------------

interface ScreenHarness extends Harness {
  frames: LiveFrame[];
  lookAtScreen: ReturnType<typeof vi.fn<() => Promise<ScreenLook | null>>>;
  frameShown: ReturnType<typeof vi.fn<(frameId: string) => void>>;
}

function screenHarness(options: { look?: ScreenLook | null; interviewer?: Partial<InterviewerOptions> } = {}): ScreenHarness {
  const frames: LiveFrame[] = [];
  let next = 1;
  const lookAtScreen = vi.fn<() => Promise<ScreenLook | null>>(async () => {
    if (options.look === null) return null;
    if (options.look) return options.look;
    const frame: LiveFrame = { id: `frame_${String(next++).padStart(4, "0")}`, t: Date.now() - 1_000_000, route: "/settings", kind: "gesture", jpeg_base64: "/9j/AAAA" };
    frames.push(frame);
    return { frame, fresh: true };
  });
  const frameShown = vi.fn<(frameId: string) => void>();
  const h = harness({ interviewer: { evidence: { lookAtScreen, frameShown }, ...options.interviewer } });
  return Object.assign(h, { frames, lookAtScreen, frameShown });
}

function clickAnchor(selector: string, t: number): LiveAnchor {
  return { route: "/settings", selector, component: "Card", rect: { x: 10, y: 20, width: 100, height: 40 }, t };
}

describe("Interviewer click announcements", () => {
  it("announces a click as a [PAGE] note with the element description and an anchor id, and attaches a frame", async () => {
    const h = screenHarness();
    await h.goLive();

    const entry = h.interviewer.announceClick(clickAnchor("div.stat__value", 100), 'div with text "$48,210" in component DashboardPage (selector div.stat__value, route /)');
    await vi.advanceTimersByTimeAsync(0);

    expect(entry.id).toBe("anchor_0001");
    expect(h.realtime.sentTexts).toEqual([
      '[PAGE] The riffer clicked div with text "$48,210" in component DashboardPage (selector div.stat__value, route /) (anchor id: anchor_0001).'
    ]);
    expect(h.realtime.sentImages).toHaveLength(1);
    expect(h.realtime.sentImages[0].jpegBase64).toBe("/9j/AAAA");
    expect(h.realtime.sentImages[0].text).toBe(
      "[PAGE] Screenshot of the riffer's current view on /settings, attached because they just clicked there (frame id: frame_0001). The riffrec panel docked at the top right is not part of the app."
    );
    expect(h.frameShown).toHaveBeenCalledWith("frame_0001");
    expect(h.interviewer.status.framesShown).toBe(1);
  });

  it("coalesces a click burst on the same element into one note and one anchor id", async () => {
    const h = screenHarness();
    await h.goLive();

    const first = h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    vi.advanceTimersByTime(180);
    const second = h.interviewer.announceClick(clickAnchor("div.stat__value", 280), "the revenue figure");
    vi.advanceTimersByTime(180);
    const third = h.interviewer.announceClick(clickAnchor("div.stat__value", 460), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(h.realtime.sentTexts).toHaveLength(1);
    expect(h.interviewer.announcedAnchors()).toHaveLength(1);
    expect(h.interviewer.announcedAnchors()[0].anchor.t).toBe(460);

    vi.advanceTimersByTime(CLICK_ANNOUNCE_DEDUPE_MS + 1);
    h.interviewer.announceClick(clickAnchor("div.stat__value", 2000), "the revenue figure");
    expect(h.realtime.sentTexts).toHaveLength(2);
    expect(h.realtime.sentTexts[1]).toContain("(anchor id: anchor_0002)");
  });

  it("a click on another element inside the window is its own note", async () => {
    const h = screenHarness();
    await h.goLive();
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    vi.advanceTimersByTime(100);
    h.interviewer.announceClick(clickAnchor("article.card", 200), "the open tickets card");
    expect(h.realtime.sentTexts).toEqual([
      "[PAGE] The riffer clicked the revenue figure (anchor id: anchor_0001).",
      "[PAGE] The riffer clicked the open tickets card (anchor id: anchor_0002)."
    ]);
  });

  it('"this" in record_unit resolves to the most recent announced click', async () => {
    const h = screenHarness();
    await h.goLive();
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    await h.realtime.emit({ type: "transcript", transcript: transcript("t1", "ik vind deze niet zo mooi", 900) });
    await h.realtime.emit(
      h.realtime.toolCall({
        name: "record_unit",
        arguments: { statement: "Make this look nicer.", anchors: ["this"], transcript_excerpt: "ik vind deze niet zo mooi" }
      })
    );
    expect(h.session.allUnits()[0].anchors).toEqual([clickAnchor("div.stat__value", 100)]);
    expect(h.realtime.toolResults.at(-1)!.output).toMatchObject({ ok: true, anchors_resolved: 1 });
  });

  it("holds click notes and their frame while a response is active and sends them once it settles", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit({ type: "response_started", response_id: "resp_1" });
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentTexts).toEqual([]);
    expect(h.realtime.sentImages).toEqual([]);

    await h.realtime.emit({ type: "response_done", response_id: "resp_1" });
    expect(h.realtime.sentTexts).toEqual(["[PAGE] The riffer clicked the revenue figure (anchor id: anchor_0001)."]);
    expect(h.realtime.sentImages).toHaveLength(1);
    expect(h.realtime.actionsNamed("create_response")).toEqual([]);
  });
});

describe("Interviewer look_at_screen", () => {
  it("attaches the current frame as an image item, answers the call, and asks for a response", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit(h.realtime.toolCall({ name: "look_at_screen", arguments: { reason: "riffer asked if I can see" } }));
    await vi.advanceTimersByTimeAsync(0);

    const kinds = h.realtime.actions.map((action) => action.type);
    expect(kinds).toEqual(["send_image", "send_tool_result", "create_response"]);
    expect(h.realtime.sentImages[0].text).toMatch(/^\[PAGE\] Screenshot of the riffer's current view on \/settings, captured just now \(frame id: frame_0001\)\./);
    expect(h.realtime.toolResults[0]).toEqual({
      call_id: "call_0001",
      output: { ok: true, frame_id: "frame_0001", route: "/settings", age_ms: 0, fresh: true }
    });
    expect(h.frameShown).toHaveBeenCalledWith("frame_0001");
    expect(h.interviewer.status.responseActive).toBe(true);
  });

  it("defers the follow-up response until the calling response settles", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit({ type: "response_started", response_id: "resp_1" });
    await h.realtime.emit(h.realtime.toolCall({ name: "look_at_screen", arguments: {} }));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.actions.map((action) => action.type)).toEqual(["send_image", "send_tool_result"]);

    await h.realtime.emit({ type: "response_done", response_id: "resp_1" });
    expect(h.realtime.actionsNamed("create_response")).toHaveLength(1);
    expect(h.interviewer.status.responseActive).toBe(true);
  });

  it("reports no_frame when the screen is not shared or capture is paused, still asking for a response", async () => {
    const h = screenHarness({ look: null });
    await h.goLive();
    await h.realtime.emit(h.realtime.toolCall({ name: "look_at_screen", arguments: {} }));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.realtime.sentImages).toEqual([]);
    expect(h.realtime.toolResults[0].output).toEqual({ ok: false, reason: "no_frame", detail: NO_FRAME_DETAIL });
    expect(h.realtime.actionsNamed("create_response")).toHaveLength(1);
    expect(h.frameShown).not.toHaveBeenCalled();
  });

  it("reports frames_disabled without grabbing when the evidence profile keeps frames on the page", async () => {
    const h = screenHarness({ interviewer: { screenFrames: false } });
    await h.goLive();
    await h.realtime.emit(h.realtime.toolCall({ name: "look_at_screen", arguments: {} }));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.lookAtScreen).not.toHaveBeenCalled();
    expect(h.realtime.toolResults[0].output).toEqual({ ok: false, reason: "frames_disabled", detail: FRAMES_DISABLED_DETAIL });
    await h.realtime.emit({ type: "response_done", response_id: "resp_1" });
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toEqual([]);
    expect(h.realtime.sentTexts).toHaveLength(1);
  });

  it("a look counts against the proactive rate limit", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit(h.realtime.toolCall({ name: "look_at_screen", arguments: {} }));
    await vi.advanceTimersByTimeAsync(0);
    await h.realtime.emit({ type: "response_done", response_id: "resp_1" });
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toHaveLength(1);
  });
});

describe("Interviewer proactive frames", () => {
  it("attaches at most one frame per interval across clicks, drawings, and visual speech", async () => {
    const h = screenHarness();
    await h.goLive();

    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    h.interviewer.announceDrawing({ anchor: anchor(400), description: "the save button" });
    await h.realtime.emit({ type: "transcript", transcript: transcript("t1", "can you make this color nicer", 900) });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toHaveLength(1);
    expect(h.lookAtScreen).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PROACTIVE_FRAME_MIN_INTERVAL_MS);
    await h.realtime.emit({ type: "transcript", transcript: transcript("t2", "kijk hier, dat is lelijk", 7000) });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toHaveLength(2);
    expect(h.realtime.sentImages[1].text).toContain("attached because they referred to something on screen");
  });

  it("does not attach a frame for speech that points at nothing on screen", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit({ type: "transcript", transcript: transcript("t1", "okay let me think about the onboarding flow", 900) });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.lookAtScreen).not.toHaveBeenCalled();
    expect(h.realtime.sentImages).toEqual([]);
  });

  it("a drawing attaches a frame that names the drawing as the reason", async () => {
    const h = screenHarness();
    await h.goLive();
    h.interviewer.announceDrawing({ anchor: anchor(400), description: "the save button", kind: "stroke" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toHaveLength(1);
    expect(h.realtime.sentImages[0].text).toContain("attached because they just drew there");
  });

  it("keeps pending click notes across a reconnect but drops the stale screenshot", async () => {
    const h = screenHarness();
    await h.goLive();
    await h.realtime.emit({ type: "response_started", response_id: "resp_1" });
    h.interviewer.announceClick(clickAnchor("div.stat__value", 100), "the revenue figure");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.realtime.sentImages).toEqual([]);

    await h.realtime.emit({ type: "closed" });
    await vi.waitFor(() => expect(h.session.status).toBe("live"));

    expect(h.realtime.sentTexts.at(-1)).toBe("[PAGE] The riffer clicked the revenue figure (anchor id: anchor_0001).");
    expect(h.realtime.sentImages).toEqual([]);
    expect(h.frameShown).not.toHaveBeenCalled();
  });

  it("runs one grab at a time and swallows a failing grabber", async () => {
    const h = screenHarness();
    h.lookAtScreen.mockRejectedValueOnce(new Error("no canvas"));
    await h.goLive();
    h.interviewer.announceClick(clickAnchor("a", 100), "a");
    h.interviewer.announceClick(clickAnchor("b", 100), "b");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.lookAtScreen).toHaveBeenCalledTimes(1);
    expect(h.realtime.sentImages).toEqual([]);
    expect(h.errors.some((error) => String(error).includes("no canvas"))).toBe(true);
    expect(h.realtime.sentTexts).toHaveLength(2);
  });
});

describe("Interviewer session config (KTD4/KTD5 reconcile)", () => {
  it("adds the tools the mint lacked and appends the screen-context section to the endpoint's persona", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({
      type: "session_created",
      session: {
        instructions: "You are the interviewer in a live polish session. You do not watch the screen.",
        tools: [
          { type: "function", name: "record_unit", description: "endpoint copy" },
          { type: "function", name: "update_unit" },
          { type: "function", name: "withdraw_unit" },
          { type: "function", name: "relay_answer" }
        ]
      }
    });

    const updates = h.realtime.actionsNamed("update_session");
    expect(updates).toHaveLength(1);
    const patch = updates[0].patch as { type: string; instructions: string; tools: Array<{ name: string; description?: string }> };
    expect(patch.type).toBe("realtime");
    expect(patch.tools.map((tool) => tool.name)).toEqual(["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"]);
    expect(patch.tools[0].description).toBe("endpoint copy");
    expect(patch.instructions.startsWith("You are the interviewer in a live polish session.")).toBe(true);
    expect(patch.instructions.endsWith(SCREEN_CONTEXT_SECTION)).toBe(true);
  });

  it("leaves a session alone that already carries every tool and the screen-context section", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({
      type: "session_created",
      session: {
        instructions: `Endpoint persona.\n\n${SCREEN_CONTEXT_MARKER}\nEndpoint wording.`,
        tools: ["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"].map((name) => ({ type: "function", name }))
      }
    });
    expect(h.realtime.actionsNamed("update_session")).toEqual([]);
  });

  it("applies the default persona and tool set to a bare session", async () => {
    const h = harness();
    await h.goLive();
    await h.realtime.emit({ type: "session_created", session: { instructions: "You are a helpful assistant.", tools: [] } });
    const [update] = h.realtime.actionsNamed("update_session");
    expect(update.patch.instructions).toBe(DEFAULT_INTERVIEWER_INSTRUCTIONS);
    expect((update.patch.tools as Array<{ name: string }>).map((tool) => tool.name)).toHaveLength(5);
  });
});

// --- Pure helpers ----------------------------------------------------------

describe("isVisualReference", () => {
  it("matches deictic and visual words across the languages riffers use", () => {
    expect(isVisualReference("make this red")).toBe(true);
    expect(isVisualReference("Ik vind deze niet zo mooi")).toBe(true);
    expect(isVisualReference("kannst du das sehen? schau hier")).toBe(true);
    expect(isVisualReference("regarde ça")).toBe(true);
    expect(isVisualReference("mira esto")).toBe(true);
    expect(isVisualReference("let me think about the onboarding flow")).toBe(false);
    expect(isVisualReference("")).toBe(false);
  });
});

describe("isNoiseTranscript", () => {
  it("treats short verb-less utterances as noise and anything with a change verb or three words as a unit candidate", () => {
    expect(isNoiseTranscript("uh")).toBe(true);
    expect(isNoiseTranscript("hmm okay")).toBe(true);
    expect(isNoiseTranscript("")).toBe(true);
    expect(isNoiseTranscript("뭐")).toBe(true);
    expect(isNoiseTranscript("make this red")).toBe(false);
    expect(isNoiseTranscript("delete this")).toBe(false);
    expect(isNoiseTranscript("yeah that one there")).toBe(false);
  });
});

describe("buildReseedText", () => {
  it("keeps non-withdrawn unit statements and the recent window, trimming oldest transcript first", () => {
    const units = [
      { id: "unit_0001", statement: "Keep me.", status: "initial" },
      { id: "unit_0002", statement: "Drop me.", status: "withdrawn" }
    ] as never;
    const lines = Array.from({ length: 200 }, (_, i) => transcript(`t${i}`, `line ${i} ${"z".repeat(60)}`, 100_000 + i * 10));
    const text = buildReseedText({ transcript: lines, units, t: 110_000, windowMs: 120_000 });
    expect(text.length).toBeLessThanOrEqual(RESEED_MAX_CHARS);
    expect(text).toContain("unit_0001 (initial): Keep me.");
    expect(text).not.toContain("Drop me.");
    expect(text).toContain("line 199");
    expect(text).not.toContain("line 0 ");
  });

  it("drops transcript outside the window entirely", () => {
    const lines = [transcript("old", "ancient words here", 1000), transcript("new", "fresh words here", 200_000)];
    const text = buildReseedText({ transcript: lines, units: [], t: 200_500 });
    expect(text).toContain("fresh words here");
    expect(text).not.toContain("ancient words here");
  });
});

describe("Interviewer without an endpoint", () => {
  it("settles in live_novoice with no_endpoint and never mints", async () => {
    const session = LiveSession.create({
      bootstrap: null,
      storage: sessionStorage,
      frameStore: new MemoryFrameStore(),
      pageHideTarget: null,
      sessionId: "sess_offline"
    });
    sessions.push(session);
    const connect = vi.fn();
    const interviewer = createInterviewer({ session, connect });
    interviewers.push(interviewer);
    session.start();
    await interviewer.start();
    expect(session.status).toBe("live_novoice");
    expect(interviewer.status.unavailable).toEqual({ kind: "no_endpoint" });
    expect(connect).not.toHaveBeenCalled();
  });
});

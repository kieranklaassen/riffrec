// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFrameStore, type FrameStore } from "./buffer";
import { LIVE_SESSION_HEADER, type LiveAnchor, type LiveAnnotation, type LiveEnvelope } from "./contract";
import { SILENCE_CHECKPOINT_MS } from "./checkpoints";
import { LIVE_CURRENT_SESSION_KEY, LiveSession, liveSessionStorageKey, type LiveSessionOptions } from "./session";
import { createFakeEndpoint, type FakeEndpoint } from "./testing/fakeEndpoint";
import { LIVE_BOOTSTRAP_STORAGE_KEY, bootstrapLiveToken } from "./tokenBootstrap";

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  /** When set, `setItem` throws a quota error until it returns false. */
  quotaGate: ((key: string, value: string) => boolean) | null = null;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.quotaGate && this.quotaGate(key, value)) {
      const error = new DOMException("quota", "QuotaExceededError");
      throw error;
    }
    this.map.set(key, value);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

interface Harness {
  endpoint: FakeEndpoint;
  storage: FakeStorage;
  frameStore: MemoryFrameStore;
  requests: Array<{ url: string; init: RequestInit | undefined }>;
  setDown(down: boolean): void;
  options(overrides?: Partial<LiveSessionOptions>): LiveSessionOptions;
}

function harness(): Harness {
  const endpoint = createFakeEndpoint();
  const storage = new FakeStorage();
  const frameStore = new MemoryFrameStore();
  const requests: Harness["requests"] = [];
  let down = false;
  let clock = 1_000_000;
  const fetchImpl: typeof fetch = (input, init) => {
    requests.push({ url: String(input), init });
    if (down) return Promise.reject(new TypeError("Failed to fetch"));
    return endpoint.fetch(input, init);
  };
  return {
    endpoint,
    storage,
    frameStore,
    requests,
    setDown: (value) => {
      down = value;
    },
    options: (overrides = {}) => ({
      bootstrap: { token: endpoint.pageToken, endpoint: endpoint.baseUrl },
      storage,
      frameStore,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      route: () => "/settings",
      pageHideTarget: null,
      now: () => (clock += 10),
      sessionId: "sess_test_0001",
      backoffMs: [5, 5, 5],
      ...overrides
    })
  };
}

function anchor(t = 100): LiveAnchor {
  return { route: "/settings", selector: "button.save", component: "Save", rect: { x: 1, y: 2, width: 3, height: 4 }, t };
}

function recordUnits(session: LiveSession, count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(session.recordUnit({ statement: `Change ${i}`, transcript_excerpt: `change ${i}`, anchors: [anchor()] }).id);
  }
  return ids;
}

function stroke(id: string, unitId?: string): LiveAnnotation {
  return {
    id,
    kind: "stroke",
    points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
    bbox: { x: 0, y: 0, width: 5, height: 5 },
    anchor: anchor(),
    ...(unitId ? { unit_id: unitId } : {})
  };
}

function postBodies(requests: Harness["requests"]): LiveEnvelope[][] {
  return requests
    .filter((request) => request.url.endsWith("/events") && request.init?.method === "POST")
    .map((request) => JSON.parse(String(request.init?.body)) as LiveEnvelope[]);
}

async function settled(session: LiveSession): Promise<void> {
  await vi.waitFor(() => expect(session.sequence.queueLength).toBe(0));
}

const sessions: LiveSession[] = [];

function track(session: LiveSession): LiveSession {
  sessions.push(session);
  return session;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LiveSession lifecycle", () => {
  it("moves idle -> consenting -> connecting -> live and reports live_novoice when voice never arrives", () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    expect(session.status).toBe("idle");

    session.beginConsent();
    expect(session.status).toBe("consenting");
    session.declineConsent();
    expect(session.status).toBe("idle");

    session.beginConsent();
    session.start();
    expect(session.status).toBe("connecting");
    session.voiceConnected();
    expect(session.status).toBe("live");
    session.voiceLost();
    expect(session.status).toBe("reconnecting");
    session.voiceUnavailable();
    expect(session.status).toBe("live_novoice");
  });

  it("starts as live_novoice when the microphone was denied during consent", () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.beginConsent();
    session.micDenied();
    session.start();

    expect(session.status).toBe("live_novoice");
    expect(session.snapshot().mic).toBe("denied");
  });

  it("runs without an endpoint as live_novoice and streams nothing", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options({ bootstrap: null, endpoint: null })));
    session.start();

    expect(session.status).toBe("live_novoice");
    expect(session.hasEndpoint).toBe(false);
    recordUnits(session, 1);
    session.addAnnotation(stroke("ann_1"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(h.requests).toEqual([]);
    expect(session.sequence.nextSeq).toBe(3);
  });

  it("emits final, waits for its ack, and only then posts /session/end", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();
    await vi.waitFor(() => expect(h.requests.some((request) => request.url.endsWith("/stream"))).toBe(true));

    const result = await session.finish();

    expect(result.checkpoint.trigger).toBe("final");
    expect(result.finalAcked).toBe(true);
    expect(result.ended).toBe(true);
    const order = h.requests.filter((request) => request.init?.method === "POST").map((request) => request.url);
    expect(order[order.length - 1]).toMatch(/\/session\/end$/);
    expect(h.endpoint.received.filter((entry) => entry.type === "checkpoint")).toHaveLength(1);
    expect(h.endpoint.ended).toBe(true);
    expect(session.status).toBe("ended");
    expect(h.storage.keys()).toEqual([]);
  });

  it("finish says why the end was not confirmed when /session/end fails, and the session stays local", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options({ fetch: async (input, init) => {
      h.requests.push({ url: String(input), init });
      if (String(input).endsWith("/session/end")) return new Response("{}", { status: 502 });
      return h.endpoint.fetch(input, init);
    } })));
    session.start();
    session.voiceConnected();

    const result = await session.finish();

    expect(result.finalAcked).toBe(true);
    expect(result.ended).toBe(false);
    expect(result.failure).toBe("POST /session/end returned 502");
    expect(session.status).toBe("live");
    expect(h.endpoint.ended).toBe(false);
  });

  it("finish reports the unacknowledged final and the failed end when the endpoint is unreachable", async () => {
    vi.useFakeTimers();
    const h = harness();
    const session = track(LiveSession.create(h.options({ finalAckTimeoutMs: 200 })));
    session.start();
    h.setDown(true);

    const finishing = session.finish();
    await vi.advanceTimersByTimeAsync(500);
    const result = await finishing;

    expect(result.finalAcked).toBe(false);
    expect(result.ended).toBe(false);
    expect(result.failure).toBe("POST /session/end failed: Failed to fetch");
    expect(session.streamState).toBe("buffering");
  });

  it("finish carries no failure without an endpoint", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options({ bootstrap: null, endpoint: null })));
    session.start();
    const result = await session.finish();
    expect(result).toEqual({ checkpoint: expect.objectContaining({ trigger: "final" }), finalAcked: false, ended: false });
  });

  it("stop() clears every sessionStorage key the session wrote", async () => {
    const h = harness();
    h.storage.setItem(LIVE_BOOTSTRAP_STORAGE_KEY, JSON.stringify({ token: "t", endpoint: "http://e" }));
    const session = LiveSession.create(h.options());
    session.start();
    recordUnits(session, 1);
    expect(h.storage.getItem(LIVE_CURRENT_SESSION_KEY)).toBe(session.id);
    expect(h.storage.getItem(liveSessionStorageKey(session.id))).not.toBeNull();

    const inputs = await session.stop();

    expect(session.status).toBe("ended");
    expect(h.storage.keys()).toEqual([]);
    expect(inputs.units).toHaveLength(1);
  });
});

describe("LiveSession checkpoints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("covers AE1: three units with short gaps then a navigation produce exactly one page_change checkpoint", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();

    for (let i = 0; i < 3; i += 1) {
      session.speechStarted();
      recordUnits(session, 1);
      session.speechStopped();
      await vi.advanceTimersByTimeAsync(2000);
    }
    session.recordEvent({ t: 9000, type: "navigation", from: "/settings", to: "/billing" });
    await vi.advanceTimersByTimeAsync(SILENCE_CHECKPOINT_MS * 2);

    const checkpoints = session.allCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({ trigger: "page_change", mode: "smart" });
    await settled(session);
    expect(h.endpoint.received.filter((entry) => entry.type === "checkpoint")).toHaveLength(1);
    const batch = await h.endpoint.wait();
    expect((batch.body as { units: unknown[] }).units).toHaveLength(3);
  });

  it("covers AE1: three units followed by 2.5 s of silence produce exactly one silence checkpoint", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();

    session.speechStarted();
    recordUnits(session, 3);
    session.speechStopped();
    await vi.advanceTimersByTimeAsync(SILENCE_CHECKPOINT_MS - 1);
    expect(session.allCheckpoints()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(SILENCE_CHECKPOINT_MS * 3);

    expect(session.allCheckpoints().map((checkpoint) => checkpoint.trigger)).toEqual(["silence"]);
  });

  it("emits no silence checkpoint when nothing is held, and final regardless", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();

    session.speechStopped();
    await vi.advanceTimersByTimeAsync(SILENCE_CHECKPOINT_MS * 2);
    expect(session.allCheckpoints()).toEqual([]);

    const checkpoint = session.final();
    expect(checkpoint.trigger).toBe("final");
    await settled(session);
    expect(h.endpoint.received.map((entry) => entry.type)).toEqual(["checkpoint"]);
  });

  it("carries the current mode on each checkpoint and marks the mode pending until the endpoint acts on it", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();

    session.setMode("collect");
    expect(session.snapshot().pendingMode).toBe("collect");
    recordUnits(session, 1);
    await session.send();
    await settled(session);

    const checkpoint = h.endpoint.received.find((entry) => entry.type === "checkpoint")!;
    expect(checkpoint.payload).toMatchObject({ trigger: "send", mode: "collect" });
    expect(h.endpoint.mode).toBe("collect");
    await vi.waitFor(() => expect(session.snapshot().pendingMode).toBeNull());
  });
});

describe("LiveSession units and withdrawals", () => {
  it("covers AE12: a withdrawal in the same tick as a page-change checkpoint excludes the unit from the batch", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const [keep, drop] = recordUnits(session, 2);

    session.withdrawUnit(drop, "forget that");
    session.recordEvent({ t: 500, type: "navigation", from: "/settings", to: "/billing" });
    await settled(session);

    const batch = await h.endpoint.wait();
    const units = (batch.body as { units: Array<{ id: string; status: string }> }).units;
    expect(units.map((unit) => unit.id)).toEqual([keep]);
    expect(session.unit(drop)?.status).toBe("withdrawn");
    const seqs = h.endpoint.received.map((entry) => `${entry.type}:${entry.seq}`);
    expect(seqs.indexOf(`unit_withdraw:3`)).toBeLessThan(seqs.indexOf("checkpoint:5"));
  });

  it("covers AE12: a withdrawal after triaging is forwarded as withdrawn in the next batch", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const [id] = recordUnits(session, 1);
    await session.send();
    await settled(session);
    const first = await h.endpoint.wait();
    await h.endpoint.ack((first.body as { checkpoint_id: string }).checkpoint_id);
    await vi.waitFor(() => expect(session.unit(id)?.status).toBe("triaging"));
    expect(session.isReleased(id)).toBe(true);

    const result = session.withdrawUnit(id);
    expect(result).toMatchObject({ ok: true, afterRelease: true });
    expect(session.heldUnits()).toEqual([]);
    await expect(session.send()).resolves.toBe(true);
    await settled(session);

    const batch = await h.endpoint.wait();
    const units = (batch.body as { units: Array<{ id: string; status: string }> }).units;
    expect(units).toEqual([expect.objectContaining({ id, status: "withdrawn" })]);
  });

  it("rejects update_unit on a released unit and leaves it unchanged", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const [id] = recordUnits(session, 1);
    await session.send();
    await settled(session);
    await h.endpoint.wait();
    await vi.waitFor(() => expect(session.unit(id)?.status).toBe("triaging"));
    const before = session.unit(id);
    const envelopesBefore = h.endpoint.received.length;

    const result = session.updateUnit(id, { statement: "Different change" });

    expect(result).toMatchObject({ ok: false, reason: "released" });
    expect(session.unit(id)).toEqual(before);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.endpoint.received).toHaveLength(envelopesBefore);
  });

  it("applies endpoint status, surfaces questions, and posts answers", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    const asks: string[] = [];
    session.on("ask", ({ unit, question }) => asks.push(`${unit.id}:${question.question}`));
    session.start();
    const [id] = recordUnits(session, 1);
    await session.send();
    await settled(session);
    await vi.waitFor(() => expect(h.requests.some((request) => request.url.endsWith("/stream"))).toBe(true));
    const first = await h.endpoint.wait();
    await h.endpoint.ack((first.body as { checkpoint_id: string }).checkpoint_id);

    await h.endpoint.ask(id, "Which header?");
    await vi.waitFor(() => expect(asks).toEqual([`${id}:Which header?`]));
    expect(session.unit(id)?.status).toBe("needs_info");
    expect(session.openQuestions()).toHaveLength(1);

    session.relayAnswer(id, "The compact one");
    await settled(session);
    expect(session.openQuestions()).toHaveLength(0);
    const answerBatch = await h.endpoint.wait();
    expect((answerBatch.body as { kind: string; answers: unknown[] }).kind).toBe("answer");

    await h.endpoint.setUnitStatus(id, "applied", { note: "moved" });
    await vi.waitFor(() => expect(session.unit(id)?.status).toBe("applied"));
    expect(session.noteFor(id)).toBe("moved");
  });

  it("drops a second answer to a question that is already answered", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const [id] = recordUnits(session, 1);
    await session.send();
    await settled(session);
    await vi.waitFor(() => expect(h.requests.some((request) => request.url.endsWith("/stream"))).toBe(true));
    const first = await h.endpoint.wait();
    await h.endpoint.ack((first.body as { checkpoint_id: string }).checkpoint_id);
    await h.endpoint.ask(id, "Which header?");
    await vi.waitFor(() => expect(session.openQuestions()).toHaveLength(1));

    expect(session.relayAnswer(id, "The compact one")).not.toBeNull();
    expect(session.relayAnswer(id, "The compact one")).toBeNull();
    expect(session.answer("unit_missing", "x")).toBeNull();
  });

  it("folds a drawing-only unit into the spoken unit that follows on the same element", () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const drawing = session.recordUnit({
      statement: "Drawing on Sidebar",
      transcript_excerpt: "",
      anchors: [anchor()],
      evidence: { annotation_ids: ["ann_1"] }
    });
    const elsewhere = session.recordUnit({
      statement: "Drawing on Footer",
      transcript_excerpt: "",
      anchors: [{ ...anchor(), selector: "footer" }],
      evidence: { annotation_ids: ["ann_2"] }
    });

    const spoken = session.recordUnit({ statement: "Make this calmer", transcript_excerpt: "make this calmer", anchors: [anchor()] });

    expect(session.unit(drawing.id)?.status).toBe("withdrawn");
    expect(session.unit(elsewhere.id)?.status).toBe("initial");
    expect(spoken.evidence.annotation_ids).toEqual(["ann_1"]);
  });

  it("links annotations to units locally and posts them", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    const [id] = recordUnits(session, 1);

    session.addAnnotation(stroke("ann_1", id));
    session.addAnnotation(stroke("ann_2"));
    expect(session.attachAnnotation("ann_2", id)).toBe(true);
    await settled(session);

    expect(session.unit(id)?.evidence.annotation_ids).toEqual(["ann_1", "ann_2"]);
    expect(session.allAnnotations().map((annotation) => annotation.unit_id)).toEqual([id, id]);
    expect(h.endpoint.annotations).toHaveLength(2);
  });
});

describe("LiveSession buffering, persistence, and rehydration", () => {
  it("covers AE10: flips to buffering after three failures and back to live on the first ack", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();
    recordUnits(session, 2);
    await settled(session);
    expect(session.status).toBe("live");

    h.setDown(true);
    recordUnits(session, 3);
    await vi.waitFor(() => expect(session.status).toBe("buffering"));
    expect(session.sequence.queueLength).toBe(3);

    h.setDown(false);
    await vi.waitFor(() => expect(session.status).toBe("live"));
    await settled(session);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("covers AE7: rehydrates units, annotations, transcript, mode, sequencing, and the unsent queue after a reload", async () => {
    const h = harness();
    const session = LiveSession.create(h.options());
    session.start();
    session.voiceConnected();
    const ids = recordUnits(session, 2);
    session.addTranscript({ id: "tr_1", role: "riffer", text: "make it red", t_start: 0, t_end: 900, final: true });
    session.addAnnotation(stroke("ann_1", ids[0]));
    session.setMode("collect");
    await settled(session);
    const ackedBefore = session.sequence.ackedSeq;

    h.setDown(true);
    recordUnits(session, 1);
    session.addAnnotation(stroke("ann_2"));
    await vi.waitFor(() => expect(session.status).toBe("buffering"));
    const { nextSeq, queueLength } = session.sequence;
    expect(queueLength).toBe(2);

    // Simulated reload: the old page object is gone; a fresh module-level session rebuilds from storage.
    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored).not.toBeNull();
    expect(restored.id).toBe(session.id);
    expect(restored.isRehydrated).toBe(true);
    expect(restored.allUnits()).toEqual(session.allUnits());
    expect(restored.allAnnotations()).toEqual(session.allAnnotations());
    expect(restored.fullTranscript()).toEqual(session.fullTranscript());
    expect(restored.currentMode).toBe("collect");
    expect(restored.sequence).toEqual({ nextSeq, ackedSeq: ackedBefore, queueLength });
    expect(restored.status).toBe("reconnecting");

    restored.start();
    const first = restored.recordUnit({ statement: "post reload", transcript_excerpt: "post reload", anchors: [anchor()] });
    h.setDown(false);
    await settled(restored);

    const unitEnvelope = h.endpoint.received.find((entry) => entry.type === "unit" && entry.payload.id === first.id)!;
    expect(unitEnvelope.seq).toBe(nextSeq);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual(Array.from({ length: nextSeq }, (_, i) => i + 1));
    expect(h.endpoint.units.size).toBe(4);
  });

  it("keeps the fragment token out of every envelope and sends it only as a bearer header", async () => {
    const h = harness();
    history.replaceState(null, "", `/settings#riffrec_live=${h.endpoint.pageToken}&endpoint=${encodeURIComponent(h.endpoint.baseUrl)}`);
    const bootstrap = bootstrapLiveToken({ storage: h.storage });
    expect(location.hash).toBe("");
    const session = track(LiveSession.create(h.options({ bootstrap })));
    session.start();
    recordUnits(session, 1);
    session.recordEvent({ t: 1, type: "navigation", from: "/settings", to: "/billing" });
    await settled(session);

    const firstPost = h.requests.find((request) => request.init?.method === "POST")!;
    const headers = new Headers(firstPost.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${h.endpoint.pageToken}`);
    expect(headers.get(LIVE_SESSION_HEADER)).toBe(session.id);
    expect(JSON.stringify(h.endpoint.received)).not.toContain(h.endpoint.pageToken);
    expect(JSON.stringify(h.endpoint.received)).not.toContain("riffrec_live");
    expect(JSON.stringify(session.archiveInputs())).not.toContain(h.endpoint.pageToken);
    for (const body of postBodies(h.requests)) expect(JSON.stringify(body)).not.toContain(h.endpoint.pageToken);
    expect(h.storage.getItem(LIVE_BOOTSTRAP_STORAGE_KEY)).toContain(h.endpoint.pageToken);
  });

  it("spills queued frame bytes to the frame store, keeps sessionStorage in kilobytes, and rehydrates them on replay", async () => {
    const h = harness();
    const session = LiveSession.create(h.options({ keepFramesForArchive: false }));
    session.start();
    recordUnits(session, 1);
    await settled(session);

    h.setDown(true);
    const frameBytes = 1.5 * 1024 * 1024;
    for (let i = 0; i < 10; i += 1) {
      session.addFrame({ id: `frame_${i}`, t: i * 100, route: "/settings", kind: "periodic", jpeg_base64: "b".repeat(frameBytes) });
    }
    await vi.waitFor(() => expect(session.status).toBe("buffering"));

    const persisted = h.storage.getItem(liveSessionStorageKey(session.id))!;
    expect(persisted.length).toBeLessThan(64 * 1024);
    expect(h.frameStore.entries.size).toBe(10);
    for (const value of h.frameStore.entries.values()) expect(value).toHaveLength(frameBytes);

    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    restored.start();
    h.setDown(false);
    await settled(restored);

    expect(h.endpoint.frames).toHaveLength(10);
    for (const frame of h.endpoint.frames) {
      expect(frame.jpeg_base64).toHaveLength(frameBytes);
      expect(frame.dropped).toBeUndefined();
    }
    expect(h.frameStore.entries.size).toBe(0);
  });

  it("evicts the oldest queued envelopes on QuotaExceededError, keeps their seq as fillers, and stays live", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options({ keepFramesForArchive: false })));
    session.start();
    session.voiceConnected();
    recordUnits(session, 1);
    await settled(session);

    h.setDown(true);
    for (let i = 0; i < 2; i += 1) {
      session.addFrame({ id: `frame_${i}`, t: i * 100, route: "/settings", kind: "gesture", jpeg_base64: "c".repeat(2048) });
    }
    recordUnits(session, 6);
    await vi.waitFor(() => expect(session.status).toBe("buffering"));
    const { nextSeq, ackedSeq, queueLength } = session.sequence;
    expect(queueLength).toBe(8);

    let throwsLeft = 1;
    h.storage.quotaGate = (key) => {
      if (key === liveSessionStorageKey(session.id) && throwsLeft > 0) {
        throwsLeft -= 1;
        return true;
      }
      return false;
    };
    session.addAnnotation(stroke("ann_1"));
    h.storage.quotaGate = null;

    expect(throwsLeft).toBe(0);
    expect(session.snapshot().error).toBeNull();
    expect(session.status).toBe("buffering");
    expect(session.sequence).toEqual({ nextSeq: nextSeq + 1, ackedSeq, queueLength: queueLength + 1 });
    const persisted = JSON.parse(h.storage.getItem(liveSessionStorageKey(session.id))!) as {
      queue: Array<{ seq: number; type: string; payload: { dropped?: string; state?: string } }>;
    };
    expect(persisted.queue.map((entry) => entry.seq)).toEqual(Array.from({ length: 9 }, (_, i) => ackedSeq + 1 + i));
    expect(persisted.queue.slice(0, 2).map((entry) => `${entry.type}:${entry.payload.dropped}`)).toEqual([
      "frame:quota",
      "frame:quota"
    ]);
    expect(persisted.queue[2]).toMatchObject({ type: "stream_state", payload: { state: "buffering" } });
    expect(persisted.queue[3].type).toBe("unit");
    expect(session.allUnits()).toHaveLength(7);

    h.setDown(false);
    await vi.waitFor(() => expect(session.status).toBe("live"));
    await settled(session);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual(Array.from({ length: nextSeq }, (_, i) => i + 1));
    expect(h.endpoint.frames.map((frame) => frame.dropped)).toEqual(["quota", "quota"]);
    expect(h.endpoint.units.size).toBe(6);
  });

  it("falls back to a queue-less record when eviction cannot help and gap-fills on rehydrate", async () => {
    const h = harness();
    const session = LiveSession.create(h.options({ keepFramesForArchive: false }));
    session.start();
    recordUnits(session, 1);
    await settled(session);
    h.setDown(true);
    recordUnits(session, 3);
    await vi.waitFor(() => expect(session.status).toBe("buffering"));
    const { nextSeq, ackedSeq } = session.sequence;

    h.storage.quotaGate = (key, value) => key === liveSessionStorageKey(session.id) && value.includes('"queue":[');
    session.addTranscript({ id: "tr_1", role: "riffer", text: "still talking", t_start: 0, t_end: 1, final: true });
    h.storage.quotaGate = null;

    expect(session.lastPersistOutcome).toBe("stored_without_queue");
    const persisted = JSON.parse(h.storage.getItem(liveSessionStorageKey(session.id))!) as { queue: null; degraded: string };
    expect(persisted.queue).toBeNull();
    expect(persisted.degraded).toBe("without_queue");

    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored.sequence).toEqual({ nextSeq: nextSeq + 1, ackedSeq, queueLength: nextSeq - ackedSeq });
    restored.start();
    h.setDown(false);
    await settled(restored);

    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual(Array.from({ length: nextSeq }, (_, i) => i + 1));
    const fillers = h.endpoint.received.filter((entry) => entry.seq > ackedSeq);
    expect(fillers.every((entry) => entry.type === "stream_state" && entry.payload.state === "buffering")).toBe(true);
    expect(h.endpoint.ackedSeq).toBe(nextSeq);
  });

  it("keeps a frame's bytes inline in sessionStorage until the frame store write settles", async () => {
    const h = harness();
    let release: (() => void) | null = null;
    const slowStore: FrameStore = {
      put: (sessionId, frameId, bytes) =>
        new Promise<void>((resolve) => {
          release = () => {
            void h.frameStore.put(sessionId, frameId, bytes).then(resolve);
          };
        }),
      get: (sessionId, frameId) => h.frameStore.get(sessionId, frameId),
      delete: (sessionId, frameId) => h.frameStore.delete(sessionId, frameId),
      clear: (sessionId) => h.frameStore.clear(sessionId)
    };
    const session = track(LiveSession.create(h.options({ frameStore: slowStore, keepFramesForArchive: false })));
    session.start();
    h.setDown(true);
    session.addFrame({ id: "frame_slow", t: 1, route: "/settings", kind: "gesture", jpeg_base64: "d".repeat(4096) });

    const inline = JSON.parse(h.storage.getItem(liveSessionStorageKey(session.id))!) as {
      queue: Array<{ payload: { jpeg_base64: string } }>;
    };
    expect(inline.queue[0].payload.jpeg_base64).toHaveLength(4096);

    release!();
    await vi.waitFor(() => {
      const stripped = JSON.parse(h.storage.getItem(liveSessionStorageKey(session.id))!) as {
        queue: Array<{ payload: { jpeg_base64: string } }>;
      };
      expect(stripped.queue[0].payload.jpeg_base64).toBe("");
    });
    expect(h.frameStore.entries.size).toBe(1);
  });

  it("keeps a frame whose store write never settled in the archive across a reload", async () => {
    const h = harness();
    const pendingStore: FrameStore = {
      put: () => new Promise<void>(() => {}),
      get: (sessionId, frameId) => h.frameStore.get(sessionId, frameId),
      delete: (sessionId, frameId) => h.frameStore.delete(sessionId, frameId),
      clear: (sessionId) => h.frameStore.clear(sessionId)
    };
    const session = LiveSession.create(h.options({ frameStore: pendingStore }));
    session.start();
    h.setDown(true);
    session.addFrame({ id: "frame_1", t: 5, route: "/settings", kind: "gesture", jpeg_base64: btoa("jpeg") });
    await vi.waitFor(() => expect(session.status).toBe("buffering"));
    expect(h.frameStore.entries.size).toBe(0);

    const restored = LiveSession.rehydrate(h.options({ sessionId: undefined, frameStore: pendingStore }))!;
    const inputs = await restored.stop();

    expect(Object.keys(inputs.frames ?? {})).toEqual(["frame_1.jpg"]);
  });

  it("persists the pending-mode bookkeeping across a reload", async () => {
    const h = harness();
    const session = LiveSession.create(h.options());
    session.start();
    session.setMode("collect");
    recordUnits(session, 1);
    await settled(session);
    expect(session.snapshot().pendingMode).toBe("collect");

    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored.snapshot().pendingMode).toBe("collect");
    restored.start();
    await vi.waitFor(() => expect(h.requests.filter((request) => request.url.endsWith("/stream")).length).toBeGreaterThan(1));
    await restored.send();
    await settled(restored);

    await vi.waitFor(() => expect(restored.snapshot().pendingMode).toBeNull());
  });

  it("keeps screenshots off across a reload once the riffer turned them off at consent", () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    expect(session.framesLeavePage).toBe(true);
    session.disableFrames();
    session.start();
    expect(session.framesLeavePage).toBe(false);

    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored.framesLeavePage).toBe(false);
  });

  it("enters incompatible on a schema-version 409 instead of buffering", async () => {
    const h = harness();
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/events") && init?.method === "POST") {
        return new Response(JSON.stringify({ expected_schema_version: "live/2" }), { status: 409 });
      }
      return h.endpoint.fetch(input, init);
    };
    const session = track(LiveSession.create(h.options({ fetch: fetchImpl })));
    session.start();
    session.voiceConnected();
    recordUnits(session, 1);

    await vi.waitFor(() => expect(session.status).toBe("incompatible"));
    expect(session.snapshot().expectedSchemaVersion).toBe("live/2");
    expect(session.streamState).toBe("incompatible");
  });

  it("reports a session conflict as an error state", async () => {
    const h = harness();
    await h.endpoint.postEvents([], "sess_other");
    const session = track(LiveSession.create(h.options()));
    session.start();
    recordUnits(session, 1);

    await vi.waitFor(() => expect(session.status).toBe("error"));
    expect(session.snapshot().error).toMatchObject({ reason: "session_conflict", activeSessionId: "sess_other" });
  });

  it("sends stream_state unloading with keepalive on pagehide", async () => {
    const h = harness();
    const target = new EventTarget();
    const session = track(LiveSession.create(h.options({ pageHideTarget: target })));
    session.start();
    await settled(session);

    target.dispatchEvent(new Event("pagehide"));

    const beacon = h.requests.find((request) => request.init?.keepalive)!;
    expect(beacon).toBeTruthy();
    const body = JSON.parse(String(beacon.init?.body)) as LiveEnvelope[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ type: "stream_state", payload: { state: "unloading" } });
  });
});

describe("LiveSession archive inputs", () => {
  it("covers AE5: a no-endpoint session has annotations but no transcript", () => {
    const h = harness();
    const session = track(LiveSession.create(h.options({ bootstrap: null, endpoint: null })));
    session.start();
    session.addAnnotation(stroke("ann_1"));

    const inputs = session.archiveInputs();

    expect(inputs.transcript).toBeNull();
    expect(inputs.units).toBeNull();
    expect(inputs.annotations).toHaveLength(1);
  });

  it("a lost-endpoint session adds transcript and units", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.voiceConnected();
    session.addTranscript({ id: "tr_1", role: "riffer", text: "hello", t_start: 0, t_end: 10, final: true });
    recordUnits(session, 1);
    session.addFrame({ id: "frame_1", t: 5, route: "/settings", kind: "gesture", jpeg_base64: btoa("jpeg") });
    h.setDown(true);
    recordUnits(session, 1);
    await vi.waitFor(() => expect(session.status).toBe("buffering"));

    const inputs = session.archiveInputs();

    expect(inputs.transcript).toHaveLength(1);
    expect(inputs.units).toHaveLength(2);
    expect(inputs.annotations).toEqual([]);
    expect(Object.keys(inputs.frames ?? {})).toEqual(["frame_1.jpg"]);
  });
});

describe("LiveSession frame store default", () => {
  it("accepts an injected frame store implementing the interface", async () => {
    const calls: string[] = [];
    const store: FrameStore = {
      put: async (_s, id) => {
        calls.push(`put:${id}`);
      },
      get: async () => null,
      delete: async (_s, id) => {
        calls.push(`delete:${id}`);
      },
      clear: async () => {
        calls.push("clear");
      }
    };
    const h = harness();
    const session = LiveSession.create(h.options({ frameStore: store, keepFramesForArchive: false }));
    session.start();
    session.addFrame({ id: "frame_x", t: 1, route: "/", kind: "gesture", jpeg_base64: "zz" });
    await settled(session);
    await session.stop();

    expect(calls).toEqual(["put:frame_x", "delete:frame_x", "clear"]);
  });
});

import type { LiveAnchor, LiveFrame, LiveMintResponse, LiveTranscript, LiveUnit } from "../contract";
import type { LiveSession, RecordUnitInput } from "../session";
import type {
  LiveToolCall,
  LiveToolResult,
  RecordUnitArgs,
  RelayAnswerArgs,
  UpdateUnitArgs,
  WithdrawUnitArgs
} from "../tools";
import type { UnitQuestion } from "../units";
import type { RealtimeServerEvent, RealtimeTransport } from "./client";
import type { SharedMicrophone } from "./audioRouting";
import { mintWithRetry, type MintRefusalReason, type MintRetryResult } from "./mint";
import { reconcileSessionConfig, type RealtimeSessionConfig } from "./sessionConfig";

/**
 * The voice interviewer (U3): connects to OpenAI Realtime through the
 * endpoint's mint, maps the tools (KTD5) onto session actions, voices
 * endpoint questions at pauses per the breathwork conversation rules (KTD6),
 * tells the interviewer what the riffer clicks, draws, and pins as text items,
 * shows it the screen on request (`look_at_screen`), and re-seeds a
 * replacement connection from the transcript (R38).
 *
 * Timing it owns: the 1.5 s question-silence gate and the response lifecycle
 * gate. Timing it does not own: checkpoints — `speech_started`/`speech_stopped`
 * are forwarded to the session's `CheckpointEmitter` untouched (KTD9).
 *
 * U7 wiring: `createInterviewer({ session, connect, microphone })`, then
 * `start()`; `setMuted` is the mute hook; `stop()` on `stop()`/`session_ended`;
 * `retryVoice()` is the explicit re-attempt after a settled refusal.
 */

export const QUESTION_SILENCE_MS = 1500;
export const RESEED_MAX_CHARS = 6000;
export const RESEED_WINDOW_MS = 120_000;
/** How recent a clicked/drawn anchor may be to stand in for "this"/"that". */
export const ANCHOR_RECENCY_MS = 8000;
/** Repeated clicks on the same element inside this window are one note, not three (double- and triple-clicks). */
export const CLICK_ANNOUNCE_DEDUPE_MS = 1000;
/** Floor between two frames the page attaches on its own initiative (a `look_at_screen` counts too). */
export const PROACTIVE_FRAME_MIN_INTERVAL_MS = 5000;
export const MIN_UNIT_WORDS = 3;
export const CONNECT_MAX_ATTEMPTS = 3;
/**
 * Response-gate resets, the breathwork lesson: a gate held open by an event we
 * never see would silence the interviewer for the rest of the session.
 * Unconfirmed: our `response.create` (or a busy error) with no `response.created`.
 * Confirmed: a `response.created` whose `response.done` never arrives.
 */
export const RESPONSE_CONFIRM_TIMEOUT_MS = 10_000;
export const RESPONSE_GATE_RESET_MS = 45_000;
/** Page-side facts held while a response is active or the link is down; oldest are dropped past this. */
export const PENDING_TEXT_LIMIT = 50;

export type VoiceUnavailableReason =
  | { kind: "no_endpoint" }
  | { kind: "refused"; reason: MintRefusalReason; status: number; upstreamStatus?: number }
  | { kind: "exhausted"; reason: "throttled" | "network_error" }
  | { kind: "connect_failed"; message: string };

export interface InterviewerStatus {
  connected: boolean;
  connecting: boolean;
  responseActive: boolean;
  rifferSpeaking: boolean;
  queuedQuestions: UnitQuestion[];
  voicing: UnitQuestion | null;
  unavailable: VoiceUnavailableReason | null;
  mintAttempts: number;
  connections: number;
  /** Frames shown to the interviewer so far (tool calls and proactive attachments). */
  framesShown: number;
}

export interface AnnouncedAnchor {
  id: string;
  anchor: LiveAnchor;
  description: string;
  /** Milliseconds since session start. */
  t: number;
}

export interface DrawingAnnouncement {
  anchor: LiveAnchor;
  /** How the page names the element ("the sidebar toggle", "Button.Primary"). */
  description: string;
  /** Anchor id the tool call may reference; minted when omitted. */
  anchorId?: string;
  kind?: "stroke" | "pin";
}

/** What `look_at_screen` gets from the page: a frame, and whether it was grabbed for this call or is the latest buffered one. */
export interface ScreenLook {
  frame: LiveFrame;
  fresh: boolean;
}

/**
 * Evidence capture (U6) sits between the tools and the session: `record_unit`
 * goes through `LiveEvidence.recordUnit` so the unit carries its frame, clip,
 * and claimed annotations, speech events reach the attacher and the clip
 * recorder beside the session's checkpoint emitter, and `look_at_screen`
 * asks it for the current view.
 */
export interface InterviewerEvidenceHooks {
  recordUnit?: (input: RecordUnitInput) => LiveUnit;
  speechStarted?: () => void;
  speechStopped?: () => void;
  /** The current view for `look_at_screen` and proactive frames; null when none can be produced (no share, paused). */
  lookAtScreen?: () => Promise<ScreenLook | null>;
  /** A frame reached the interviewer: the consumer should hold it too (`LiveSession.releaseFrame`). */
  frameShown?: (frameId: string) => void;
}

/** The `look_at_screen` result when the page has no frame to show. */
export const NO_FRAME_DETAIL =
  "The screen is not being shared, or frame capture is paused, so no screenshot is available; ask the riffer to describe what they see.";

/** The `look_at_screen` result when the evidence profile keeps frames on the page. */
export const FRAMES_DISABLED_DETAIL =
  "This session's evidence profile does not let screenshots leave the page; ask the riffer to describe what they see.";

/** What made the page attach a frame without being asked. */
export type ProactiveFrameTrigger = "click" | "drawing" | "speech";

/**
 * Deictic and visual words, in the languages riffers have used so far, that
 * mark an utterance as being about something on screen. The rate limit keeps
 * a match from costing more than one frame every few seconds, so the list can
 * afford to be generous.
 */
const VISUAL_REFERENCE_WORDS = new Set([
  // English
  "this", "that", "these", "those", "here", "there", "look", "see", "watch", "screen", "color", "colour", "colors",
  "colours", "layout", "spacing", "align", "aligned", "font", "icon", "image", "picture", "red", "blue", "green",
  "yellow", "orange", "purple", "pink", "black", "white", "gray", "grey", "bigger", "smaller", "larger", "wider",
  "narrower", "taller", "shorter", "ugly", "pretty", "nicer",
  // Dutch
  "dit", "deze", "dat", "die", "hier", "daar", "kijk", "zie", "kleur", "kleuren", "scherm", "mooier", "lelijk",
  "groter", "kleiner", "plaatje",
  // German
  "dies", "dieses", "diese", "dieser", "das", "dort", "schau", "siehst", "farbe", "größer", "bildschirm",
  // French
  "ceci", "cela", "ça", "ici", "là", "regarde", "vois", "couleur", "écran",
  // Spanish
  "esto", "esta", "este", "eso", "esa", "ese", "aquí", "ahí", "allí", "mira", "ves", "pantalla"
]);

/** True when the riffer's words point at something on screen ("make this red", "kijk hier"). */
export function isVisualReference(text: string): boolean {
  return words(text).some((token) => VISUAL_REFERENCE_WORDS.has(token));
}

export interface InterviewerOptions {
  session: LiveSession;
  /** Builds a transport for one connection; called again on every reconnect. */
  connect: (secret: LiveMintResponse) => RealtimeTransport | Promise<RealtimeTransport>;
  microphone?: SharedMicrophone | null;
  evidence?: InterviewerEvidenceHooks | null;
  /**
   * Whether frames may be shown to the interviewer at all (`look_at_screen`
   * and proactive frames). Defaults to true; the runtime passes false under an
   * evidence profile with `frames: "none"`, so one knob keeps frames on the page.
   */
  screenFrames?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  questionSilenceMs?: number;
  reseedMaxChars?: number;
  reseedWindowMs?: number;
  anchorRecencyMs?: number;
  proactiveFrameMinIntervalMs?: number;
  /** Overrides anchor-reference resolution (U6 may supply the evidence store's). */
  resolveAnchor?: (ref: string, announced: AnnouncedAnchor[]) => LiveAnchor | null;
  onError?: (error: unknown) => void;
  onStatus?: (status: InterviewerStatus) => void;
}

interface QueuedQuestion {
  unit_id: string;
  question: string;
  requeued: number;
}

/** A page-side item held while a response is active or the link is down (KTD6). */
type PendingItem = { kind: "text"; text: string } | { kind: "image"; text: string; jpegBase64: string; frameId: string };

const CHANGE_VERBS = new Set([
  "add", "align", "animate", "bigger", "bold", "bolder", "bump", "center", "centre", "change", "collapse", "color",
  "colour", "darken", "darker", "decrease", "delete", "disable", "drop", "duplicate", "enable", "enlarge", "expand",
  "fix", "flip", "grow", "hide", "increase", "indent", "invert", "italic", "kill", "larger", "lighten", "lighter",
  "lose", "lower", "make", "move", "nudge", "pad", "put", "raise", "reduce", "remove", "rename", "reorder", "replace",
  "resize", "restyle", "reword", "rotate", "round", "scale", "shift", "shorten", "show", "shrink", "smaller", "sort",
  "space", "split", "stack", "swap", "tighten", "toggle", "turn", "underline", "undo", "unhide", "use", "widen", "wrap"
]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((word) => word.length > 0);
}

/** KTD6: fewer than three words and no change verb is noise, not a unit. */
export function isNoiseTranscript(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0) return true;
  if (tokens.length >= MIN_UNIT_WORDS) return false;
  return !tokens.some((token) => CHANGE_VERBS.has(token));
}

export interface ReseedInput {
  transcript: LiveTranscript[];
  units: LiveUnit[];
  /** Milliseconds since session start, now. */
  t: number;
  windowMs?: number;
  maxChars?: number;
}

/**
 * The re-seed for a replacement connection (Outstanding Questions): statements
 * of every non-withdrawn unit plus the last two minutes of transcript, capped
 * at 6,000 characters. Oldest transcript lines go first when trimming.
 */
export function buildReseedText(input: ReseedInput): string {
  const windowMs = input.windowMs ?? RESEED_WINDOW_MS;
  const maxChars = input.maxChars ?? RESEED_MAX_CHARS;
  const header =
    "[RECONNECT] Your connection was replaced mid-session. Do not greet or recap aloud. " +
    "Continue listening. Context so far:";
  const unitLines = input.units
    .filter((unit) => unit.status !== "withdrawn")
    .map((unit) => `- ${unit.id} (${unit.status}): ${unit.statement}`);
  const transcriptLines = input.transcript
    .filter((entry) => entry.final && entry.text.trim().length > 0 && entry.t_end >= input.t - windowMs)
    .map((entry) => `${entry.role}: ${entry.text.trim()}`);

  const assemble = (units: string[], lines: string[]): string => {
    const parts = [header];
    if (units.length > 0) parts.push(`Units on the board:\n${units.join("\n")}`);
    if (lines.length > 0) parts.push(`Recent transcript:\n${lines.join("\n")}`);
    return parts.join("\n\n");
  };

  let units = unitLines;
  let lines = transcriptLines;
  let text = assemble(units, lines);
  while (text.length > maxChars && lines.length > 0) {
    lines = lines.slice(1);
    text = assemble(units, lines);
  }
  while (text.length > maxChars && units.length > 0) {
    units = units.slice(1);
    text = assemble(units, lines);
  }
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

const PANEL_NOTE = "The riffrec panel docked at the top right is not part of the app.";

function describeTrigger(trigger: ProactiveFrameTrigger): string {
  switch (trigger) {
    case "click":
      return "attached because they just clicked there";
    case "drawing":
      return "attached because they just drew there";
    case "speech":
      return "attached because they referred to something on screen";
    default: {
      const exhaustive: never = trigger;
      return exhaustive;
    }
  }
}

function formatQuestion(question: QueuedQuestion): string {
  return (
    `[ENDPOINT QUESTION] The coding agent asks about unit ${question.unit_id}: "${question.question}" ` +
    "Read it to the riffer in your own words, then relay their answer with relay_answer for that unit."
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export class Interviewer {
  private readonly session: LiveSession;
  private readonly connectTransport: InterviewerOptions["connect"];
  private readonly microphone: SharedMicrophone | null;
  private readonly evidence: InterviewerEvidenceHooks | null;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly questionSilenceMs: number;
  private readonly reseedMaxChars: number;
  private readonly reseedWindowMs: number;
  private readonly anchorRecencyMs: number;
  private readonly screenFrames: boolean;
  private readonly proactiveFrameMinIntervalMs: number;
  private readonly resolveAnchorOverride: InterviewerOptions["resolveAnchor"];
  private readonly onError: (error: unknown) => void;
  private readonly onStatus: ((status: InterviewerStatus) => void) | null;

  private transport: RealtimeTransport | null = null;
  private connecting = false;
  private stopped = false;
  private generation = 0;
  private connections = 0;
  private mintAttempts = 0;
  private unavailable: VoiceUnavailableReason | null = null;

  private responseActive = false;
  private rifferSpeaking = false;
  private silenceAnchor = 0;
  private flushTimer: unknown = null;
  private gateTimer: unknown = null;
  /** A `look_at_screen` answered while a response was active: the model continues once that response settles. */
  private responseOwedAfterTool = false;

  private readonly queue: QueuedQuestion[] = [];
  private voicing: QueuedQuestion | null = null;
  private voicingInterrupted = false;
  private readonly pendingItems: PendingItem[] = [];

  private readonly announced: AnnouncedAnchor[] = [];
  private lastAnnouncedClick: { selector: string; t: number; id: string } | null = null;
  private lastRifferTranscript: LiveTranscript | null = null;
  private nextAnchorId = 1;
  /** Epoch ms of the last frame that reached the interviewer; 0 before the first. */
  private lastFrameAt = 0;
  private frameInFlight = false;
  private framesShown = 0;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(options: InterviewerOptions) {
    this.session = options.session;
    this.connectTransport = options.connect;
    this.microphone = options.microphone ?? null;
    this.evidence = options.evidence ?? null;
    this.fetchImpl = options.fetch;
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.cancel = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.questionSilenceMs = options.questionSilenceMs ?? QUESTION_SILENCE_MS;
    this.reseedMaxChars = options.reseedMaxChars ?? RESEED_MAX_CHARS;
    this.reseedWindowMs = options.reseedWindowMs ?? RESEED_WINDOW_MS;
    this.anchorRecencyMs = options.anchorRecencyMs ?? ANCHOR_RECENCY_MS;
    this.screenFrames = options.screenFrames ?? true;
    this.proactiveFrameMinIntervalMs = options.proactiveFrameMinIntervalMs ?? PROACTIVE_FRAME_MIN_INTERVAL_MS;
    this.resolveAnchorOverride = options.resolveAnchor;
    this.onError = options.onError ?? (() => {});
    this.onStatus = options.onStatus ?? null;
    this.silenceAnchor = this.now();

    this.unsubscribe.push(
      this.session.on("ask", ({ question }) => this.enqueueQuestion(question)),
      this.session.on("ended", () => this.stop())
    );
  }

  // ---------------------------------------------------------------------
  // Lifecycle (U7)
  // ---------------------------------------------------------------------

  /** Mints, connects, and moves the session to `live`; resolves when settled either way. */
  async start(): Promise<void> {
    if (this.stopped) return;
    for (const question of this.session.openQuestions()) this.enqueueQuestion(question);
    await this.connectVoice(this.session.voiceState === "reconnecting");
  }

  /** Explicit re-attempt after a settled refusal (the "later retry hook"). */
  async retryVoice(): Promise<void> {
    if (this.stopped || this.transport || this.connecting) return;
    await this.connectVoice(this.connections > 0 || this.session.voiceState === "reconnecting");
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.generation += 1;
    this.clearFlushTimer();
    this.clearGateTimer();
    this.responseOwedAfterTool = false;
    for (const off of this.unsubscribe.splice(0)) off();
    const transport = this.transport;
    this.transport = null;
    if (transport) {
      try {
        transport.close();
      } catch (error) {
        this.onError(error);
      }
    }
    this.microphone?.release("realtime");
    this.emitStatus();
  }

  get status(): InterviewerStatus {
    return {
      connected: this.transport !== null,
      connecting: this.connecting,
      responseActive: this.responseActive,
      rifferSpeaking: this.rifferSpeaking,
      queuedQuestions: this.queue.map((entry) => this.session.questionFor(entry.unit_id) ?? toUnitQuestion(entry)),
      voicing: this.voicing ? (this.session.questionFor(this.voicing.unit_id) ?? toUnitQuestion(this.voicing)) : null,
      unavailable: this.unavailable,
      mintAttempts: this.mintAttempts,
      connections: this.connections,
      framesShown: this.framesShown
    };
  }

  // ---------------------------------------------------------------------
  // Page-side hooks (U5, U6)
  // ---------------------------------------------------------------------

  /** The mute hook: flips every microphone clone, the Realtime sender, and the session's mic state together (KTD21). */
  setMuted(muted: boolean): void {
    if (this.session.isMuted === muted) return;
    this.microphone?.setMuted(muted);
    if (this.transport) {
      try {
        this.transport.setMuted(muted);
      } catch (error) {
        this.onError(error);
      }
    }
    this.session.setMuted(muted);
    this.announce(muted ? "The riffer muted their microphone; expect silence." : "The riffer unmuted their microphone.");
  }

  /** A completed stroke or pin (KTD5): the interviewer learns the element by name and by anchor id, and sees the view. */
  announceDrawing(drawing: DrawingAnnouncement): AnnouncedAnchor {
    const entry = this.rememberAnchor(drawing.anchor, drawing.description, drawing.anchorId);
    const verb = drawing.kind === "pin" ? "pinned" : "drew on";
    this.announce(`The riffer ${verb} ${drawing.description} (anchor id: ${entry.id}).`);
    void this.attachFrame("drawing");
    return entry;
  }

  /** An anchor the page resolved without a gesture to report; silent, but available to "this"/"that" resolution. */
  noteAnchor(anchor: LiveAnchor, description: string, anchorId?: string): AnnouncedAnchor {
    return this.rememberAnchor(anchor, description, anchorId);
  }

  /**
   * A click the page anchored: the interviewer learns the element by name and
   * by anchor id as it happens, so "this" and "here" resolve without asking.
   * Repeated clicks on the same element inside `CLICK_ANNOUNCE_DEDUPE_MS`
   * refresh the anchor but send no second note.
   */
  announceClick(anchor: LiveAnchor, description: string, anchorId?: string): AnnouncedAnchor {
    const now = this.elapsed();
    const last = this.lastAnnouncedClick;
    const repeat = last !== null && last.selector === anchor.selector && now - last.t <= CLICK_ANNOUNCE_DEDUPE_MS;
    const entry = this.rememberAnchor(anchor, description, anchorId ?? (repeat ? last.id : undefined));
    this.lastAnnouncedClick = { selector: anchor.selector, t: now, id: entry.id };
    if (!repeat) {
      this.announce(`The riffer clicked ${description} (anchor id: ${entry.id}).`);
      void this.attachFrame("click");
    }
    return entry;
  }

  announceBuffering(state: "buffering" | "streaming"): void {
    this.announce(
      state === "buffering"
        ? "The page lost its connection to the coding agent and is buffering; units still land on the board."
        : "The page reconnected to the coding agent; buffered units were delivered."
    );
  }

  /** Any page-side fact as a text item; held while a response is active or the link is down (KTD6). */
  announce(text: string): void {
    this.deliver({ kind: "text", text: `[PAGE] ${text}` });
  }

  announcedAnchors(): AnnouncedAnchor[] {
    return [...this.announced];
  }

  /**
   * Shows the interviewer the screen without being asked: after a click or a
   * drawing, or when the riffer's words point at something on screen. One frame
   * per `proactiveFrameMinIntervalMs` at most, and never while another grab is
   * in flight, so a click burst or a long sentence costs one image.
   */
  private async attachFrame(trigger: ProactiveFrameTrigger): Promise<void> {
    if (!this.screenFrames || !this.evidence?.lookAtScreen || this.stopped || !this.transport) return;
    if (this.frameInFlight || this.now() - this.lastFrameAt < this.proactiveFrameMinIntervalMs) return;
    this.frameInFlight = true;
    try {
      const look = await this.evidence.lookAtScreen();
      if (!look || look.frame.jpeg_base64.length === 0 || this.stopped) return;
      // Reserved now, not at send time: a frame held behind an active response must still hold the next one off.
      this.lastFrameAt = this.now();
      this.deliver({
        kind: "image",
        text: `[PAGE] Screenshot of the riffer's current view on ${look.frame.route}, ${describeTrigger(trigger)} (frame id: ${look.frame.id}). ${PANEL_NOTE}`,
        jpegBase64: look.frame.jpeg_base64,
        frameId: look.frame.id
      });
    } catch (error) {
      this.onError(error);
    } finally {
      this.frameInFlight = false;
    }
  }

  private deliver(item: PendingItem): void {
    if (this.stopped) return;
    if (!this.transport || this.responseActive) {
      this.pendingItems.push(item);
      if (this.pendingItems.length > PENDING_TEXT_LIMIT) this.pendingItems.shift();
      return;
    }
    this.sendItem(this.transport, item);
  }

  private sendItem(transport: RealtimeTransport, item: PendingItem): void {
    switch (item.kind) {
      case "text":
        this.sendText(item.text);
        return;
      case "image":
        this.sendFrame(transport, item);
        return;
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  }

  /** One image item to the model; on success the frame counts against the rate limit and is released to the endpoint. */
  private sendFrame(transport: RealtimeTransport, item: Extract<PendingItem, { kind: "image" }>): boolean {
    try {
      transport.sendImage(item.text, item.jpegBase64);
    } catch (error) {
      this.onError(error);
      return false;
    }
    this.lastFrameAt = this.now();
    this.framesShown += 1;
    this.evidence?.frameShown?.(item.frameId);
    return true;
  }

  // ---------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------

  private async connectVoice(reconnect: boolean): Promise<void> {
    if (this.stopped || this.connecting || this.transport) return;
    const endpoint = this.session.endpoint;
    const token = this.session.pageToken;
    if (!endpoint || !token) {
      this.unavailable = { kind: "no_endpoint" };
      this.session.voiceUnavailable();
      this.emitStatus();
      return;
    }
    const generation = ++this.generation;
    const alive = (): boolean => !this.stopped && generation === this.generation && this.session.status !== "ended";
    this.connecting = true;
    this.unavailable = null;
    this.session.voiceConnecting();
    this.emitStatus();

    try {
      for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt += 1) {
        const minted = await this.mint(alive);
        if (!alive()) return;
        if (!minted.ok) {
          this.settleUnavailable(minted);
          return;
        }
        try {
          const transport = await this.connectTransport(minted.secret);
          if (!alive()) {
            transport.close();
            return;
          }
          const connectResult = transport.connect({ onEvent: (event) => this.handleEvent(transport, event) });
          if (connectResult) await connectResult;
          if (!alive()) {
            transport.close();
            return;
          }
          this.becomeConnected(transport, reconnect);
          return;
        } catch (error) {
          this.onError(error);
          if (attempt === CONNECT_MAX_ATTEMPTS) {
            this.unavailable = { kind: "connect_failed", message: error instanceof Error ? error.message : String(error) };
            this.session.voiceUnavailable();
            return;
          }
        }
      }
    } finally {
      if (generation === this.generation) this.connecting = false;
      this.emitStatus();
    }
  }

  private async mint(alive: () => boolean): Promise<MintRetryResult> {
    const result = await mintWithRetry({
      endpoint: this.session.endpoint!,
      token: this.session.pageToken!,
      sessionId: this.session.id,
      fetch: this.fetchImpl,
      setTimeout: this.schedule,
      clearTimeout: this.cancel,
      shouldContinue: alive,
      onRetry: () => this.emitStatus()
    });
    this.mintAttempts += result.attempts;
    return result;
  }

  private settleUnavailable(result: Exclude<MintRetryResult, { ok: true }>): void {
    switch (result.kind) {
      case "abandoned":
        return;
      case "refused":
        this.unavailable = {
          kind: "refused",
          reason: result.reason,
          status: result.status,
          ...(result.upstreamStatus !== undefined ? { upstreamStatus: result.upstreamStatus } : {})
        };
        break;
      case "exhausted":
        this.unavailable = { kind: "exhausted", reason: result.reason };
        break;
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
    this.session.voiceUnavailable();
  }

  private becomeConnected(transport: RealtimeTransport, reconnect: boolean): void {
    this.transport = transport;
    this.connections += 1;
    this.responseActive = false;
    this.responseOwedAfterTool = false;
    this.rifferSpeaking = false;
    this.voicing = null;
    this.voicingInterrupted = false;
    this.silenceAnchor = this.now();
    if (reconnect) {
      this.sendText(
        buildReseedText({
          transcript: this.session.fullTranscript(),
          units: this.session.allUnits(),
          t: this.elapsed(),
          windowMs: this.reseedWindowMs,
          maxChars: this.reseedMaxChars
        })
      );
    }
    if (this.session.isMuted) {
      try {
        transport.setMuted(true);
      } catch (error) {
        this.onError(error);
      }
    }
    this.flushPendingTexts();
    this.session.voiceConnected();
    this.scheduleFlush();
  }

  private handleLost(): void {
    const lost = this.transport;
    this.transport = null;
    if (lost) {
      // The call is gone; release the peer, remote playback, and mic clone
      // even when the mint that follows is refused.
      try {
        lost.close();
      } catch (error) {
        this.onError(error);
      }
    }
    this.clearFlushTimer();
    this.clearGateTimer();
    this.responseActive = false;
    this.responseOwedAfterTool = false;
    // Notes still describe what happened; a screenshot from before the drop no longer shows the current view.
    const texts = this.pendingItems.filter((item) => item.kind === "text");
    this.pendingItems.splice(0, this.pendingItems.length, ...texts);
    if (this.voicing) {
      this.requeue(this.voicing);
      this.voicing = null;
    }
    if (this.stopped) return;
    this.session.voiceLost();
    this.emitStatus();
    void this.connectVoice(true).catch((error) => this.onError(error));
  }

  // ---------------------------------------------------------------------
  // Server events
  // ---------------------------------------------------------------------

  private handleEvent(transport: RealtimeTransport, event: RealtimeServerEvent): void {
    if (transport !== this.transport && event.type !== "closed") return;
    switch (event.type) {
      case "session_created":
        this.applySessionConfig(transport, event.session);
        break;
      case "speech_started":
        this.rifferSpeaking = true;
        this.clearFlushTimer();
        if (this.voicing) this.voicingInterrupted = true;
        this.session.speechStarted();
        this.evidence?.speechStarted?.();
        break;
      case "speech_stopped":
        this.rifferSpeaking = false;
        this.silenceAnchor = this.now();
        this.session.speechStopped();
        this.evidence?.speechStopped?.();
        this.scheduleFlush();
        break;
      case "transcript":
        this.handleTranscript(event.transcript);
        break;
      case "tool_call":
        this.handleToolCall(event.call);
        break;
      case "response_started":
        this.responseActive = true;
        this.clearFlushTimer();
        this.armGateTimer(RESPONSE_GATE_RESET_MS, "response.done never arrived");
        break;
      case "response_done":
        this.responseActive = false;
        this.clearGateTimer();
        this.silenceAnchor = this.now();
        if (this.voicing) {
          if (this.voicingInterrupted) this.requeue(this.voicing);
          this.voicing = null;
          this.voicingInterrupted = false;
        }
        this.flushPendingTexts();
        if (this.responseOwedAfterTool) {
          this.responseOwedAfterTool = false;
          this.createResponseNow(transport, "look_at_screen follow-up");
        }
        this.scheduleFlush();
        break;
      case "error":
        this.handleError(event.message);
        break;
      case "closed":
        if (transport === this.transport) this.handleLost();
        break;
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
    this.emitStatus();
  }

  private handleTranscript(transcript: LiveTranscript): void {
    if (transcript.text.trim().length === 0) return;
    if (transcript.role === "riffer") {
      this.lastRifferTranscript = transcript;
      if (isVisualReference(transcript.text)) void this.attachFrame("speech");
    }
    this.session.addTranscript(transcript);
  }

  private handleError(message: string): void {
    this.onError(new Error(`riffrec live interviewer: ${message}`));
    if (message.includes("conversation_already_has_active_response")) {
      // Our response.create lost the race with a riffer turn. A question is
      // asked again at the next pause; a look_at_screen follow-up is simply
      // superseded by the turn that won. The other response's `response.done`
      // clears the gate; the timer does when that event never arrives.
      if (this.voicing) {
        this.requeue(this.voicing);
        this.voicing = null;
        this.voicingInterrupted = false;
      }
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, "no response.done after a busy error");
    }
  }

  /**
   * `session.created`: the endpoint's mint owns the persona and may override
   * any tool it copied; the page adds only what it must be able to answer
   * (missing tools, the screen-context section) and leaves the rest alone.
   */
  private applySessionConfig(transport: RealtimeTransport, session: RealtimeSessionConfig): void {
    const patch = reconcileSessionConfig(session);
    if (!patch) return;
    try {
      transport.updateSession({ type: "realtime", ...patch });
    } catch (error) {
      this.onError(error);
    }
  }

  // ---------------------------------------------------------------------
  // Tools (KTD5)
  // ---------------------------------------------------------------------

  private handleToolCall(call: LiveToolCall): void {
    const transport = this.transport;
    if (!transport) return;
    if (call.name === "look_at_screen") {
      void this.lookAtScreen(transport, call).catch((error) => this.onError(error));
      return;
    }
    let output: Record<string, unknown>;
    try {
      output = this.runTool(call);
    } catch (error) {
      this.onError(error);
      output = { ok: false, reason: "tool_error", message: error instanceof Error ? error.message : String(error) };
    }
    this.sendToolResult(transport, { call_id: call.call_id, output });
    // KTD6: no response.create here. A pending question is voiced by the flush
    // gate once the response that made this call settles and the riffer pauses.
    this.scheduleFlush();
  }

  private runTool(call: Exclude<LiveToolCall, { name: "look_at_screen" }>): Record<string, unknown> {
    switch (call.name) {
      case "record_unit":
        return this.recordUnit(call.arguments);
      case "update_unit":
        return this.updateUnit(call.arguments);
      case "withdraw_unit":
        return this.withdrawUnit(call.arguments);
      case "relay_answer":
        return this.relayAnswer(call.arguments);
      default: {
        const exhaustive: never = call;
        return exhaustive;
      }
    }
  }

  /**
   * `look_at_screen`: the page grabs the current view, attaches it as an image
   * item, answers the call, and — unlike every other tool (KTD6) — asks for a
   * response, because the model called it mid-answer and would otherwise fall
   * silent until the riffer speaks again.
   */
  private async lookAtScreen(transport: RealtimeTransport, call: LiveToolCall<"look_at_screen">): Promise<void> {
    let look: ScreenLook | null = null;
    if (this.screenFrames) {
      try {
        look = (await this.evidence?.lookAtScreen?.()) ?? null;
      } catch (error) {
        this.onError(error);
      }
    }
    if (this.transport !== transport || this.stopped) return;

    let output: Record<string, unknown>;
    if (!this.screenFrames) {
      output = { ok: false, reason: "frames_disabled", detail: FRAMES_DISABLED_DETAIL };
    } else if (!look || look.frame.jpeg_base64.length === 0) {
      output = { ok: false, reason: "no_frame", detail: NO_FRAME_DETAIL };
    } else {
      const ageMs = Math.max(0, Math.round(this.elapsed() - look.frame.t));
      const when = look.fresh ? "captured just now" : `captured ${Math.max(1, Math.round(ageMs / 1000))} s ago`;
      // The model is waiting on this call, so the image goes now, response or not.
      const sent = this.sendFrame(transport, {
        kind: "image",
        text: `[PAGE] Screenshot of the riffer's current view on ${look.frame.route}, ${when} (frame id: ${look.frame.id}). ${PANEL_NOTE}`,
        jpegBase64: look.frame.jpeg_base64,
        frameId: look.frame.id
      });
      output = sent
        ? { ok: true, frame_id: look.frame.id, route: look.frame.route, age_ms: ageMs, fresh: look.fresh }
        : { ok: false, reason: "send_failed", detail: NO_FRAME_DETAIL };
    }
    this.sendToolResult(transport, { call_id: call.call_id, output });
    if (this.responseActive) this.responseOwedAfterTool = true;
    else this.createResponseNow(transport, "look_at_screen follow-up");
    this.emitStatus();
  }

  private sendToolResult(transport: RealtimeTransport, result: LiveToolResult): void {
    try {
      transport.sendToolResult(result);
    } catch (error) {
      this.onError(error);
    }
  }

  /** `response.create` with the same confirmation gate a voiced question uses. */
  private createResponseNow(transport: RealtimeTransport, why: string): void {
    try {
      transport.createResponse();
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, `${why}: response.create was never confirmed`);
    } catch (error) {
      this.onError(error);
    }
  }

  private recordUnit(args: RecordUnitArgs): Record<string, unknown> {
    const raw: unknown = args;
    if (!isRecord(raw) || typeof raw.statement !== "string" || raw.statement.trim().length === 0) {
      return { ok: false, reason: "invalid_arguments", detail: "statement is required" };
    }
    const statement = raw.statement.trim();
    const excerpt = typeof raw.transcript_excerpt === "string" ? raw.transcript_excerpt.trim() : "";
    const refs = stringList(raw.anchors);
    const spoken = excerpt.length > 0 ? excerpt : statement;
    if (isNoiseTranscript(spoken)) {
      return {
        ok: false,
        reason: "noise",
        detail: "Fewer than three words and no change verb; not a unit. Wait for a concrete request."
      };
    }
    const { anchors, unresolved } = this.resolveAnchors(refs);
    const span = this.lastRifferTranscript
      ? { t_start: this.lastRifferTranscript.t_start, t_end: this.lastRifferTranscript.t_end }
      : undefined;
    const input: RecordUnitInput = {
      statement,
      transcript_excerpt: excerpt,
      anchors,
      ...(span ? { evidence: { transcript_span: span } } : {})
    };
    const unit = this.evidence?.recordUnit ? this.evidence.recordUnit(input) : this.session.recordUnit(input);
    return {
      ok: true,
      unit_id: unit.id,
      anchors_resolved: anchors.length,
      ...(unresolved.length > 0 ? { anchors_unresolved: unresolved } : {})
    };
  }

  private updateUnit(args: UpdateUnitArgs): Record<string, unknown> {
    const raw: unknown = args;
    if (!isRecord(raw) || typeof raw.unit_id !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id is required" };
    }
    const refs = stringList(raw.anchors_add);
    const { anchors, unresolved } = this.resolveAnchors(refs);
    const statement = typeof raw.statement === "string" && raw.statement.trim().length > 0 ? raw.statement.trim() : undefined;
    const result = this.session.updateUnit(raw.unit_id, {
      ...(statement !== undefined ? { statement } : {}),
      ...(anchors.length > 0 ? { anchors_add: anchors } : {})
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        detail:
          result.reason === "released"
            ? "The coding agent already picked this unit up; record the refinement as a new unit."
            : result.reason === "withdrawn"
              ? "That unit was withdrawn; record a new one if the riffer still wants it."
              : "No unit with that id in this session."
      };
    }
    return { ok: true, unit_id: result.unit.id, ...(unresolved.length > 0 ? { anchors_unresolved: unresolved } : {}) };
  }

  private withdrawUnit(args: WithdrawUnitArgs): Record<string, unknown> {
    const raw: unknown = args;
    if (!isRecord(raw) || typeof raw.unit_id !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id is required" };
    }
    const reason = typeof raw.reason === "string" && raw.reason.trim().length > 0 ? raw.reason.trim() : undefined;
    const result = this.session.withdrawUnit(raw.unit_id, reason);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.dropQuestion(raw.unit_id);
    return { ok: true, unit_id: result.unit.id, after_release: result.afterRelease };
  }

  private relayAnswer(args: RelayAnswerArgs): Record<string, unknown> {
    const raw: unknown = args;
    if (!isRecord(raw) || typeof raw.unit_id !== "string" || typeof raw.answer_text !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id and answer_text are required" };
    }
    const text = raw.answer_text.trim();
    if (text.length === 0) return { ok: false, reason: "invalid_arguments", detail: "answer_text is empty" };
    const answer = this.session.relayAnswer(raw.unit_id, text);
    if (!answer) return { ok: false, reason: "unknown_unit" };
    this.dropQuestion(raw.unit_id);
    return { ok: true, unit_id: answer.unit_id };
  }

  // ---------------------------------------------------------------------
  // Anchors
  // ---------------------------------------------------------------------

  private rememberAnchor(anchor: LiveAnchor, description: string, anchorId?: string): AnnouncedAnchor {
    const id = anchorId ?? `anchor_${String(this.nextAnchorId++).padStart(4, "0")}`;
    const entry: AnnouncedAnchor = { id, anchor, description, t: this.elapsed() };
    const index = this.announced.findIndex((existing) => existing.id === id);
    if (index === -1) this.announced.push(entry);
    else this.announced[index] = entry;
    return entry;
  }

  private resolveAnchors(refs: string[]): { anchors: LiveAnchor[]; unresolved: string[] } {
    const anchors: LiveAnchor[] = [];
    const unresolved: string[] = [];
    for (const ref of refs) {
      const anchor = this.resolveAnchor(ref);
      if (anchor) {
        if (!anchors.some((existing) => existing === anchor)) anchors.push(anchor);
      } else {
        unresolved.push(ref);
      }
    }
    return { anchors, unresolved };
  }

  private resolveAnchor(ref: string): LiveAnchor | null {
    if (this.resolveAnchorOverride) return this.resolveAnchorOverride(ref, this.announcedAnchors());
    const needle = ref.trim().toLowerCase();
    if (needle.length === 0) return null;
    const byId = this.announced.find((entry) => entry.id.toLowerCase() === needle);
    if (byId) return byId.anchor;
    const byDescription = [...this.announced]
      .reverse()
      .find((entry) => entry.description.toLowerCase() === needle || entry.anchor.selector.toLowerCase() === needle);
    if (byDescription) return byDescription.anchor;
    const recent = this.announced[this.announced.length - 1];
    if (recent && this.elapsed() - recent.t <= this.anchorRecencyMs) return recent.anchor;
    return null;
  }

  // ---------------------------------------------------------------------
  // Endpoint questions (KTD6)
  // ---------------------------------------------------------------------

  private enqueueQuestion(question: UnitQuestion): void {
    if (question.answered) return;
    if (this.queue.some((entry) => entry.unit_id === question.unit_id)) return;
    if (this.voicing?.unit_id === question.unit_id) return;
    this.queue.push({ unit_id: question.unit_id, question: question.question, requeued: 0 });
    this.scheduleFlush();
    this.emitStatus();
  }

  private requeue(question: QueuedQuestion): void {
    if (this.queue.some((entry) => entry.unit_id === question.unit_id)) return;
    this.queue.unshift({ ...question, requeued: question.requeued + 1 });
  }

  private dropQuestion(unitId: string): void {
    const index = this.queue.findIndex((entry) => entry.unit_id === unitId);
    if (index !== -1) this.queue.splice(index, 1);
  }

  private scheduleFlush(): void {
    this.clearFlushTimer();
    if (!this.canFlush()) return;
    const wait = this.questionSilenceMs - (this.now() - this.silenceAnchor);
    if (wait <= 0) {
      this.flush();
      return;
    }
    this.flushTimer = this.schedule(() => {
      this.flushTimer = null;
      this.flush();
    }, wait);
  }

  private canFlush(): boolean {
    return (
      !this.stopped &&
      this.transport !== null &&
      !this.responseActive &&
      !this.rifferSpeaking &&
      this.voicing === null &&
      this.queue.length > 0
    );
  }

  private flush(): void {
    if (!this.canFlush()) return;
    if (this.now() - this.silenceAnchor < this.questionSilenceMs) {
      this.scheduleFlush();
      return;
    }
    const next = this.queue.shift()!;
    const current = this.session.questionFor(next.unit_id);
    const unit = this.session.unit(next.unit_id);
    if ((current && current.answered) || !unit || unit.status === "withdrawn") {
      this.scheduleFlush();
      return;
    }
    this.voicing = next;
    this.voicingInterrupted = false;
    try {
      this.transport!.sendText(formatQuestion(next));
      this.transport!.createResponse();
      // The server's response.created confirms; until then treat the response
      // as active so a second question cannot race it, but not forever.
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, "response.create was never confirmed");
    } catch (error) {
      this.onError(error);
      this.voicing = null;
      this.requeue(next);
    }
    this.emitStatus();
  }

  /** Reopens the response gate after `ms` unless `response.done` clears it first. */
  private armGateTimer(ms: number, why: string): void {
    this.clearGateTimer();
    this.gateTimer = this.schedule(() => {
      this.gateTimer = null;
      if (!this.responseActive) return;
      this.onError(new Error(`riffrec live interviewer: response gate reset (${why})`));
      this.responseActive = false;
      this.silenceAnchor = this.now();
      if (this.voicing) {
        this.requeue(this.voicing);
        this.voicing = null;
        this.voicingInterrupted = false;
      }
      this.flushPendingTexts();
      this.scheduleFlush();
    }, ms);
  }

  private clearGateTimer(): void {
    if (this.gateTimer !== null) {
      this.cancel(this.gateTimer);
      this.gateTimer = null;
    }
  }

  private flushPendingTexts(): void {
    const transport = this.transport;
    if (!transport) return;
    for (const item of this.pendingItems.splice(0)) this.sendItem(transport, item);
  }

  private sendText(text: string): void {
    if (!this.transport) return;
    try {
      this.transport.sendText(text);
    } catch (error) {
      this.onError(error);
    }
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      this.cancel(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private elapsed(): number {
    return Math.max(0, this.now() - this.session.startedAt);
  }

  private emitStatus(): void {
    this.onStatus?.(this.status);
  }
}

function toUnitQuestion(entry: QueuedQuestion): UnitQuestion {
  return { unit_id: entry.unit_id, question: entry.question, t: 0, answered: false };
}

export function createInterviewer(options: InterviewerOptions): Interviewer {
  return new Interviewer(options);
}

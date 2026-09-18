import type { RiffrecEvent } from "../types";
import type { LiveArchiveInputs } from "../output/session";
import {
  DEFAULT_EXECUTION_MODE,
  LIVE_SCHEMA_VERSION,
  isLiveEnvelopeOfType,
  type ExecutionMode,
  type LiveAnchor,
  type LiveAnnotation,
  type LiveAnswer,
  type LiveCheckpoint,
  type LiveEnvelope,
  type LiveEventType,
  type LiveFrame,
  type LivePayloadMap,
  type LiveServerEvent,
  type LiveTranscript,
  type LiveUnit,
  type LiveUnitEvidence,
  type MicState,
  type UnitStatus
} from "./contract";
import {
  UnsentQueue,
  createDefaultFrameStore,
  persistWithQuotaGuard,
  type FrameStore,
  type PersistedQueueEntry,
  type PersistOutcome,
  type PersistTier
} from "./buffer";
import { CheckpointEmitter, type PageCheckpointTrigger } from "./checkpoints";
import type { VoiceUnavailableReason } from "./realtime/interviewer";
import { clipFileName } from "./evidence/audioClip";
import {
  FULL_EVIDENCE_PROFILE,
  applyEvidenceProfile,
  frameWirePolicy,
  resolveEvidenceProfile,
  type EvidenceProfile,
  type EvidenceProfileInput
} from "./evidence/profile";
import { StreamClient, type StreamClientState, type StreamClientStateDetail } from "./streamClient";
import { clearStoredBootstrap, readStoredBootstrap, type LiveBootstrap } from "./tokenBootstrap";
import {
  UnitStore,
  type UnitQuestion,
  type UnitStoreSnapshot,
  type UnitUpdatePatch,
  type UnitUpdateResult,
  type UnitWithdrawResult
} from "./units";

/**
 * The live session (U2): the state machine from the plan's High-Level
 * Technical Design, the unit store, mode, `session_id` minting, checkpoint
 * ownership, and persistence to `sessionStorage` (KTD16) so a reload resumes
 * with numbering intact and unsent envelopes replay.
 *
 * Consumers:
 * - U3 (voice) drives `voiceConnecting/voiceConnected/voiceLost/voiceUnavailable`,
 *   `speechStarted/speechStopped`, `addTranscript`, `recordUnit`, `updateUnit`,
 *   `withdrawUnit`, `relayAnswer`, `setMuted`, `micGranted/micDenied`, and
 *   listens for `ask` to voice endpoint questions.
 * - U5 (overlay) reads `snapshot()`, calls `setMode`, `send`, `finish`, `stop`,
 *   `withdrawUnit`, `answer`, `confirmUnit`.
 * - U6 (evidence) calls `addAnnotation`, `attachAnnotation`, `addFrame`,
 *   `addClip`, and reads `isSpeaking`; `evidenceProfile` shapes what `unit`
 *   and `frame` envelopes carry.
 * - U7 (provider) creates or rehydrates the session, feeds `recordEvent`, and
 *   passes `archiveInputs()` to `SessionWriter.stop`.
 */

export type LiveSessionStatus =
  | "idle"
  | "consenting"
  | "connecting"
  | "live"
  | "live_novoice"
  | "buffering"
  | "reconnecting"
  | "incompatible"
  | "ended"
  | "error";

export type LiveVoiceState = "none" | "connecting" | "live" | "reconnecting" | "novoice";

export type LiveStreamStatus =
  | "offline"
  | "idle"
  | "streaming"
  | "buffering"
  | "incompatible"
  | "conflict"
  | "unauthorized"
  | "ended";

type Phase = "idle" | "consenting" | "running" | "ended" | "error";

export interface LiveSessionError {
  reason: "unauthorized" | "session_conflict" | "persist_failed" | "unknown";
  message: string;
  activeSessionId?: string;
}

export interface LiveFrameMeta {
  id: string;
  t: number;
  route: string;
  kind: LiveFrame["kind"];
  dropped?: LiveFrame["dropped"];
}

export interface LiveSessionSnapshot {
  id: string;
  status: LiveSessionStatus;
  phase: Phase;
  voice: LiveVoiceState;
  /** Why the interviewer is not running, when it settled that way; `null` otherwise. */
  voiceUnavailable: VoiceUnavailableReason | null;
  stream: LiveStreamStatus;
  endpoint: string | null;
  mode: ExecutionMode;
  pendingMode: ExecutionMode | null;
  muted: boolean;
  mic: MicState | null;
  units: LiveUnit[];
  annotations: LiveAnnotation[];
  transcript: LiveTranscript[];
  openQuestions: UnitQuestion[];
  checkpoints: LiveCheckpoint[];
  nextSeq: number;
  ackedSeq: number;
  queueLength: number;
  expectedSchemaVersion: string | null;
  error: LiveSessionError | null;
  finalEmitted: boolean;
}

export interface RecordUnitInput {
  statement: string;
  transcript_excerpt: string;
  anchors: LiveAnchor[];
  evidence?: Partial<LiveUnitEvidence>;
  id?: string;
}

export interface FinishResult {
  checkpoint: LiveCheckpoint;
  finalAcked: boolean;
  /** The endpoint confirmed the end (`/session/end` succeeded or `session_ended` arrived). */
  ended: boolean;
  /**
   * Why a streaming session's end was not confirmed, when it was not: the
   * reason the zip fallback is about to run. Absent when the endpoint confirmed
   * or when nothing streams.
   */
  failure?: string;
}

export interface LiveSessionEvents {
  ask: { unit: LiveUnit; question: UnitQuestion };
  unit_status: { unit: LiveUnit; status: UnitStatus; note?: string; guess?: string };
  applied: { checkpoint_id: string; unit_ids: string[] };
  checkpoint: LiveCheckpoint;
  frame_dropped: LiveFrameMeta;
  ended: { reason: string | undefined };
  error: LiveSessionError;
}

export type LiveSessionEventName = keyof LiveSessionEvents;

export interface LiveSessionOptions {
  /** Fallback endpoint origin for hosts running a fixed endpoint (`live.endpoint`). */
  endpoint?: string | null;
  /** Fragment credentials; defaults to what `bootstrapLiveToken` stored. */
  bootstrap?: LiveBootstrap | null;
  mode?: ExecutionMode;
  storage?: Storage | null;
  frameStore?: FrameStore;
  fetch?: typeof fetch;
  /** Epoch milliseconds. */
  now?: () => number;
  schedule?: (callback: () => void) => void;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Retry delays for the stream client after consecutive failures. */
  backoffMs?: readonly number[];
  route?: () => string;
  /** Where `pagehide` is listened for; null disables. Defaults to `window`. */
  pageHideTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  sessionId?: string;
  onError?: (error: unknown) => void;
  /** How long `finish` waits for the `final` checkpoint's ack before ending anyway. */
  finalAckTimeoutMs?: number;
  /** Keep frame bytes in memory for the archive's `frames/`. Default true. */
  keepFramesForArchive?: boolean;
  /**
   * R19: what a unit carries on the wire (U6 `profile.ts`). Local units, the
   * archive, and `/session/end` keep full evidence. Unset means no shaping —
   * every frame posts and units keep every reference; the provider resolves
   * `live.profile` (R19's default when omitted) and passes it here.
   */
  evidenceProfile?: EvidenceProfileInput;
}

interface PersistedLiveSession {
  version: 1;
  session_id: string;
  token: string | null;
  endpoint: string | null;
  started_at: number;
  mode: ExecutionMode;
  pending_mode: ExecutionMode | null;
  voice_ran: boolean;
  muted: boolean;
  mic: MicState | null;
  next_seq: number;
  acked_seq: number;
  next_unit: number;
  next_checkpoint: number;
  next_id: number;
  queue: PersistedQueueEntry[] | null;
  units: UnitStoreSnapshot;
  annotations: LiveAnnotation[];
  transcript: LiveTranscript[];
  frames: LiveFrameMeta[];
  answers: LiveAnswer[];
  checkpoints: LiveCheckpoint[];
  final_seq: number | null;
  pending_mode_seq: number | null;
  /** The riffer turned screenshots off at consent; overrides the profile's `frames`. */
  frames_off?: boolean;
  /** Set when the quota guard had to shed transcript, annotations, or frames. */
  degraded?: PersistTier;
}

/** Gesture frames kept for a later unit reference under `frames: "one"`; matches the U6 ring buffer with slack. */
const HELD_FRAME_CAP = 24;

export const LIVE_CURRENT_SESSION_KEY = "riffrec:live:current";
export const LIVE_SESSION_KEY_PREFIX = "riffrec:live:session:";

export function liveSessionStorageKey(sessionId: string): string {
  return `${LIVE_SESSION_KEY_PREFIX}${sessionId}`;
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function mintSessionId(): string {
  return `sess_${randomId()}`;
}

function pad(value: number): string {
  return String(value).padStart(4, "0");
}

function base64ToBlob(base64: string, type: string): Blob | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

function currentRoute(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

type Listener<K extends LiveSessionEventName> = (payload: LiveSessionEvents[K]) => void;

export class LiveSession {
  readonly id: string;
  readonly startedAt: number;

  private phase: Phase = "idle";
  private voice: LiveVoiceState = "none";
  private voiceReason: VoiceUnavailableReason | null = null;
  private streamStatus: LiveStreamStatus;
  private readonly token: string | null;
  private readonly endpointOrigin: string | null;
  private mode: ExecutionMode;
  private pendingMode: ExecutionMode | null = null;
  private pendingModeSeq: number | null = null;
  private voiceRan = false;
  private muted = false;
  private mic: MicState | null = null;
  private nextSeq = 1;
  private ackedSeq = 0;
  private nextUnit = 1;
  private nextCheckpoint = 1;
  private nextId = 1;
  private finalSeq: number | null = null;
  private expectedSchemaVersion: string | null = null;
  private error: LiveSessionError | null = null;
  private rehydrated = false;
  private started = false;
  private suspended = false;

  private readonly units: UnitStore;
  private readonly annotations: LiveAnnotation[] = [];
  private readonly transcript: LiveTranscript[] = [];
  private readonly frames: LiveFrameMeta[] = [];
  private readonly frameBytes = new Map<string, string>();
  /** Frames the profile posts only once a unit references them (`frames: "one"`). */
  private readonly heldFrames = new Map<string, string>();
  private readonly clipBytes = new Map<string, Blob>();
  private profile: EvidenceProfile;
  /** Set on a rehydrate: the reload of unacked frame bytes the archive needs. */
  private framesRestored: Promise<void> | null = null;
  private readonly answers: LiveAnswer[] = [];
  private readonly checkpoints: LiveCheckpoint[] = [];

  private readonly storage: Storage | null;
  private readonly frameStore: FrameStore;
  private readonly queue: UnsentQueue | null;
  private readonly client: StreamClient | null;
  private readonly emitter: CheckpointEmitter;
  private readonly now: () => number;
  private readonly route: () => string;
  private readonly pageHideTarget: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  private readonly onPageHide = (): void => this.handlePageHide();
  private pageHideAttached = false;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly finalAckTimeoutMs: number;
  private readonly keepFrames: boolean;
  private readonly fetchImpl: typeof fetch;

  private readonly changeListeners = new Set<(snapshot: LiveSessionSnapshot) => void>();
  private readonly listeners = new Map<LiveSessionEventName, Set<Listener<LiveSessionEventName>>>();
  private readonly ackWaiters: Array<{ seq: number; resolve: (acked: boolean) => void }> = [];
  private persistOutcome: PersistOutcome = "stored";

  private constructor(options: LiveSessionOptions, persisted: PersistedLiveSession | null) {
    this.now = options.now ?? (() => Date.now());
    this.route = options.route ?? currentRoute;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.frameStore = options.frameStore ?? createDefaultFrameStore();
    this.setTimer = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.finalAckTimeoutMs = options.finalAckTimeoutMs ?? 15000;
    this.keepFrames = options.keepFramesForArchive ?? true;
    this.profile = options.evidenceProfile ? resolveEvidenceProfile(options.evidenceProfile) : FULL_EVIDENCE_PROFILE;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.pageHideTarget =
      options.pageHideTarget === undefined
        ? typeof window !== "undefined"
          ? window
          : null
        : options.pageHideTarget;

    if (persisted) {
      this.rehydrated = true;
      this.id = persisted.session_id;
      this.token = persisted.token;
      this.endpointOrigin = persisted.endpoint;
      this.startedAt = persisted.started_at;
      this.mode = persisted.mode;
      this.pendingMode = persisted.pending_mode;
      this.pendingModeSeq = persisted.pending_mode_seq;
      this.voiceRan = persisted.voice_ran;
      if (persisted.frames_off) this.profile = { ...this.profile, frames: "none" };
      this.muted = persisted.muted;
      this.mic = persisted.mic;
      this.nextSeq = persisted.next_seq;
      this.ackedSeq = persisted.acked_seq;
      this.nextUnit = persisted.next_unit;
      this.nextCheckpoint = persisted.next_checkpoint;
      this.nextId = persisted.next_id;
      this.finalSeq = persisted.final_seq;
      this.units = UnitStore.fromSnapshot(persisted.units);
      this.annotations.push(...persisted.annotations);
      this.transcript.push(...persisted.transcript);
      this.frames.push(...persisted.frames);
      this.answers.push(...persisted.answers);
      this.checkpoints.push(...persisted.checkpoints);
      this.phase = "running";
      this.voice = this.voiceRan ? "reconnecting" : "novoice";
    } else {
      const bootstrap = options.bootstrap === undefined ? readStoredBootstrap(this.storage) : options.bootstrap;
      this.id = options.sessionId ?? mintSessionId();
      this.token = bootstrap?.token ?? null;
      this.endpointOrigin = bootstrap?.endpoint ?? options.endpoint ?? null;
      this.startedAt = this.now();
      this.mode = options.mode ?? DEFAULT_EXECUTION_MODE;
      this.units = new UnitStore();
    }

    const canStream = this.endpointOrigin !== null && this.token !== null;
    this.streamStatus = canStream ? "idle" : "offline";

    if (canStream) {
      const queueOptions = {
        onStoreError: (error: unknown) => options.onError?.(error),
        onStoreSettled: () => this.persist()
      };
      this.queue = persisted
        ? UnsentQueue.fromPersisted(
            this.id,
            persisted.queue,
            { ackedSeq: this.ackedSeq, nextSeq: this.nextSeq, t: this.elapsed() },
            this.frameStore,
            queueOptions
          )
        : new UnsentQueue(this.id, this.frameStore, queueOptions);
      this.client = new StreamClient({
        endpoint: this.endpointOrigin!,
        token: this.token!,
        sessionId: this.id,
        queue: this.queue,
        fetch: options.fetch,
        schedule: options.schedule,
        setTimeout: options.setTimeout,
        clearTimeout: options.clearTimeout,
        backoffMs: options.backoffMs,
        elapsed: () => this.elapsed(),
        onAck: (seq) => this.handleAck(seq),
        onStateChange: (state, detail) => this.handleStreamState(state, detail),
        onServerEvent: (event) => this.handleServerEvent(event),
        onEnded: (reason) => this.handleEnded(reason),
        onFrameDropped: (envelope) => this.handleFrameDropped(envelope),
        onError: (error) => options.onError?.(error),
        onQueueChange: () => this.persist()
      });
      this.client.ackedSeq = this.ackedSeq;
    } else {
      this.queue = null;
      this.client = null;
    }

    this.emitter = new CheckpointEmitter({
      emit: (trigger) => this.emitCheckpoint(trigger),
      hasHeldWork: () => this.units.hasHeldWork(),
      setTimeout: options.setTimeout,
      clearTimeout: options.clearTimeout
    });

    if (persisted && this.keepFrames) this.framesRestored = this.restoreFrameBytes(options.onError);
  }

  // ---------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------

  static create(options: LiveSessionOptions = {}): LiveSession {
    return new LiveSession(options, null);
  }

  /** Rebuilds the session a previous page load persisted; null when none exists. */
  static rehydrate(options: LiveSessionOptions = {}): LiveSession | null {
    const storage = options.storage === undefined ? defaultStorage() : options.storage;
    if (!storage) return null;
    let raw: string | null = null;
    let id: string | null = null;
    try {
      id = storage.getItem(LIVE_CURRENT_SESSION_KEY);
      if (!id) return null;
      raw = storage.getItem(liveSessionStorageKey(id));
    } catch {
      return null;
    }
    if (!raw) return null;
    let persisted: PersistedLiveSession;
    try {
      persisted = JSON.parse(raw) as PersistedLiveSession;
    } catch {
      return null;
    }
    if (!persisted || persisted.version !== 1 || persisted.session_id !== id) return null;
    return new LiveSession({ ...options, storage }, persisted);
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  get status(): LiveSessionStatus {
    switch (this.phase) {
      case "idle":
      case "consenting":
      case "ended":
      case "error":
        return this.phase;
      case "running":
        break;
      default: {
        const exhaustive: never = this.phase;
        return exhaustive;
      }
    }
    if (this.streamStatus === "incompatible") return "incompatible";
    if (this.streamStatus === "buffering") return "buffering";
    switch (this.voice) {
      case "connecting":
        return "connecting";
      case "reconnecting":
        return "reconnecting";
      case "live":
        return "live";
      case "none":
      case "novoice":
        return "live_novoice";
      default: {
        const exhaustive: never = this.voice;
        return exhaustive;
      }
    }
  }

  get isRehydrated(): boolean {
    return this.rehydrated;
  }

  get hasEndpoint(): boolean {
    return this.client !== null;
  }

  get endpoint(): string | null {
    return this.endpointOrigin;
  }

  /** The page token, for the voice interviewer's `/mint` (I2); never leaves the page. */
  get pageToken(): string | null {
    return this.token;
  }

  get currentMode(): ExecutionMode {
    return this.mode;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isSpeaking(): boolean {
    return this.emitter.isSpeaking;
  }

  get voiceState(): LiveVoiceState {
    return this.voice;
  }

  get streamState(): LiveStreamStatus {
    return this.streamStatus;
  }

  get sequence(): { nextSeq: number; ackedSeq: number; queueLength: number } {
    return { nextSeq: this.nextSeq, ackedSeq: this.ackedSeq, queueLength: this.queue?.length ?? 0 };
  }

  get lastPersistOutcome(): PersistOutcome {
    return this.persistOutcome;
  }

  /** `sessionStorage` keys this session writes; `stop()` removes them all. */
  storageKeys(): string[] {
    return [LIVE_CURRENT_SESSION_KEY, liveSessionStorageKey(this.id)];
  }

  beginConsent(): void {
    if (this.phase !== "idle") return;
    this.phase = "consenting";
    this.notify();
  }

  declineConsent(): void {
    if (this.phase !== "consenting") return;
    this.phase = "idle";
    this.notify();
  }

  /**
   * Accept + microphone (or a rehydrate) -> `connecting` when an endpoint can
   * mint a voice secret, otherwise `live_novoice`. Starts delivery and
   * persistence; the voice hooks move the session on from here.
   */
  start(): void {
    if (this.started || this.phase === "ended" || this.phase === "error") return;
    this.started = true;
    this.phase = "running";
    if (!this.rehydrated) {
      this.voice = this.client && this.mic !== "denied" ? "connecting" : "novoice";
    }
    this.attachPageHide();
    if (this.client) {
      this.client.start();
      if (this.streamStatus === "idle") this.streamStatus = "streaming";
    }
    this.persist();
    this.notify();
  }

  /**
   * Detaches from the page without ending the session (KTD16): the provider
   * unmounting mid-session persists the state, closes delivery, and leaves
   * every `sessionStorage` key and stored frame in place for `rehydrate()`.
   * The instance is inert afterwards.
   */
  suspend(): void {
    if (this.phase === "ended" || this.suspended) return;
    this.suspended = true;
    this.persist();
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.client?.close();
    this.detachPageHide();
    this.notify();
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  /** Ends the session locally, clears every key and frame it wrote, and returns the archive inputs. */
  async stop(): Promise<LiveArchiveInputs> {
    if (this.framesRestored) await this.framesRestored;
    const inputs = this.archiveInputs();
    if (this.phase !== "ended") {
      this.phase = "ended";
      this.emitEvent("ended", { reason: "stopped" });
    }
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.client?.close();
    this.detachPageHide();
    this.clearStorage();
    if (this.queue) await this.queue.clearStore();
    else await this.frameStore.clear(this.id).catch(() => {});
    this.notify();
    return inputs;
  }

  // ---------------------------------------------------------------------
  // Voice hooks (U3)
  // ---------------------------------------------------------------------

  voiceConnecting(): void {
    if (this.phase !== "running") return;
    this.voice = this.voiceRan ? "reconnecting" : "connecting";
    this.voiceReason = null;
    this.notify();
  }

  voiceConnected(): void {
    if (this.phase !== "running") return;
    this.voice = "live";
    this.voiceRan = true;
    this.persist();
    this.notify();
  }

  voiceLost(): void {
    if (this.phase !== "running") return;
    this.voice = "reconnecting";
    this.notify();
  }

  /** Mint refused for good, mic denied, or no endpoint: a one-way move to `live_novoice`. */
  voiceUnavailable(reason: VoiceUnavailableReason | null = null): void {
    if (this.phase !== "running") return;
    this.voice = "novoice";
    this.voiceReason = reason;
    this.notify();
  }

  speechStarted(): void {
    this.emitter.speechStarted();
  }

  speechStopped(): void {
    this.emitter.speechStopped();
  }

  micGranted(): void {
    this.mic = "granted";
    this.emit("mic", { state: "granted" });
  }

  micDenied(): void {
    this.mic = "denied";
    this.emit("mic", { state: "denied" });
    this.voiceUnavailable();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.mic = muted ? "muted" : "unmuted";
    this.emit("mic", { state: this.mic });
  }

  addTranscript(transcript: LiveTranscript): void {
    const index = this.transcript.findIndex((entry) => entry.id === transcript.id);
    if (index === -1) this.transcript.push(transcript);
    else this.transcript[index] = transcript;
    this.voiceRan = true;
    this.emit("transcript", transcript);
  }

  // ---------------------------------------------------------------------
  // Units (tool intake and board actions)
  // ---------------------------------------------------------------------

  recordUnit(input: RecordUnitInput): LiveUnit {
    const id = input.id ?? `unit_${pad(this.nextUnit++)}`;
    const firstAnchorT = input.anchors[0]?.t ?? this.elapsed();
    const unit: LiveUnit = {
      id,
      statement: input.statement,
      transcript_excerpt: input.transcript_excerpt,
      anchors: input.anchors,
      evidence: {
        frame_ids: input.evidence?.frame_ids ?? [],
        annotation_ids: input.evidence?.annotation_ids ?? [],
        transcript_span: input.evidence?.transcript_span ?? { t_start: firstAnchorT, t_end: this.elapsed() },
        ...(input.evidence?.telemetry_window ? { telemetry_window: input.evidence.telemetry_window } : {}),
        ...(input.evidence?.audio_clip_id ? { audio_clip_id: input.evidence.audio_clip_id } : {})
      },
      status: "initial"
    };
    this.units.add(unit);
    const wireUnit = applyEvidenceProfile(unit, this.profile, (frameId) => this.frameKind(frameId));
    for (const frameId of wireUnit.evidence.frame_ids) this.postHeldFrame(frameId);
    this.emit("unit", wireUnit);
    return unit;
  }

  get evidenceProfile(): EvidenceProfile {
    return { ...this.profile };
  }

  updateUnit(id: string, patch: UnitUpdatePatch): UnitUpdateResult {
    const result = this.units.update(id, patch);
    if (result.ok) {
      this.emit("unit_update", {
        unit_id: id,
        ...(patch.statement !== undefined ? { statement: patch.statement } : {}),
        ...(patch.anchors_add ? { anchors_add: patch.anchors_add } : {}),
        ...(patch.confirmed ? { confirmed: patch.confirmed } : {})
      });
    }
    return result;
  }

  /** KTD22 confirmation pass: accepted at any status. */
  confirmUnit(id: string, confirmed: { element: boolean; change: boolean }): UnitUpdateResult {
    return this.updateUnit(id, { confirmed });
  }

  withdrawUnit(id: string, reason?: string): UnitWithdrawResult {
    const result = this.units.withdraw(id);
    if (result.ok) {
      this.emit("unit_withdraw", { unit_id: id, ...(reason ? { reason } : {}) });
    }
    return result;
  }

  /** The riffer's answer to an endpoint question, spoken (`relay_answer`) or typed. */
  answer(unitId: string, text: string): LiveAnswer | null {
    const unit = this.units.get(unitId);
    if (!unit) return null;
    this.units.answer(unitId);
    const answer: LiveAnswer = { unit_id: unitId, text };
    this.answers.push(answer);
    this.emit("answer", answer);
    return answer;
  }

  relayAnswer(unitId: string, text: string): LiveAnswer | null {
    return this.answer(unitId, text);
  }

  unit(id: string): LiveUnit | null {
    return this.units.get(id);
  }

  allUnits(): LiveUnit[] {
    return this.units.all();
  }

  heldUnits(): LiveUnit[] {
    return this.units.held();
  }

  isReleased(id: string): boolean {
    return this.units.isReleased(id);
  }

  questionFor(id: string): UnitQuestion | null {
    return this.units.question(id);
  }

  openQuestions(): UnitQuestion[] {
    return this.units.openQuestions();
  }

  noteFor(id: string): string | null {
    return this.units.note(id);
  }

  guessFor(id: string): string | null {
    return this.units.guess(id);
  }

  // ---------------------------------------------------------------------
  // Annotations, frames, events
  // ---------------------------------------------------------------------

  mintId(prefix: string): string {
    return `${prefix}_${pad(this.nextId++)}`;
  }

  addAnnotation(annotation: LiveAnnotation): LiveAnnotation {
    const index = this.annotations.findIndex((entry) => entry.id === annotation.id);
    if (index === -1) this.annotations.push(annotation);
    else this.annotations[index] = annotation;
    if (annotation.unit_id) this.linkAnnotation(annotation.id, annotation.unit_id);
    this.emit("annotation", annotation);
    return annotation;
  }

  /** Local bookkeeping when a unit claims an annotation after it was posted (KTD10). */
  attachAnnotation(annotationId: string, unitId: string): boolean {
    const index = this.annotations.findIndex((entry) => entry.id === annotationId);
    if (index === -1 || !this.units.get(unitId)) return false;
    this.annotations[index] = { ...this.annotations[index], unit_id: unitId };
    this.linkAnnotation(annotationId, unitId);
    this.persist();
    this.notify();
    return true;
  }

  allAnnotations(): LiveAnnotation[] {
    return [...this.annotations];
  }

  /**
   * Records a frame locally (metadata always, bytes for the archive) and posts
   * it per the evidence profile: every frame under `all`, composites at once
   * and gesture frames only when a unit references them under `one`, nothing
   * under `none`.
   */
  addFrame(frame: LiveFrame): void {
    const meta: LiveFrameMeta = { id: frame.id, t: frame.t, route: frame.route, kind: frame.kind };
    this.frames.push(meta);
    if (this.keepFrames && frame.jpeg_base64) this.frameBytes.set(frame.id, frame.jpeg_base64);
    const policy = frameWirePolicy(frame.kind, this.profile);
    switch (policy) {
      case "post":
        this.emit("frame", frame);
        return;
      case "hold":
        if (frame.jpeg_base64) this.holdFrame(frame.id, frame.jpeg_base64);
        break;
      case "never":
        break;
      default: {
        const exhaustive: never = policy;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }

  frameMetadata(): LiveFrameMeta[] {
    return [...this.frames];
  }

  /**
   * A frame the interviewer was shown is evidence the consumer should hold too:
   * under `frames: "one"` it leaves the page now instead of waiting for a unit
   * to reference it. No-op under `all` (already posted) and `none` (nothing
   * leaves the page).
   */
  releaseFrame(frameId: string): void {
    this.postHeldFrame(frameId);
  }

  /** The riffer turned screenshots off at consent: no frame leaves the page for the rest of the session. */
  disableFrames(): void {
    this.profile = { ...this.profile, frames: "none" };
    this.persist();
  }

  /** Whether frames may leave the page at all (R25/R19): false under `frames: "none"`. */
  get framesLeavePage(): boolean {
    return this.profile.frames !== "none";
  }

  /** An utterance audio clip's bytes for the archive's `clips/` (I6); never posted. */
  addClip(id: string, blob: Blob): void {
    this.clipBytes.set(id, blob);
  }

  fullTranscript(): LiveTranscript[] {
    return [...this.transcript];
  }

  /** Feeds a classic riffrec event; a navigation also fires the `page_change` checkpoint. */
  recordEvent(event: RiffrecEvent): void {
    switch (event.type) {
      case "click":
        this.emit("click", event);
        return;
      case "network_request":
        this.emit("network_request", event);
        return;
      case "console_error":
        this.emit("console_error", event);
        return;
      case "navigation":
        this.emit("navigation", event);
        this.emitter.pageChanged();
        return;
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Mode and checkpoints
  // ---------------------------------------------------------------------

  setMode(mode: ExecutionMode): void {
    if (mode === this.mode) return;
    // Leaving Collect makes the endpoint wake on the `mode` event itself
    // (KTD12), so that envelope's own ack settles the hint; every other switch
    // waits for the first checkpoint stamped with the new mode.
    const wakesOnModeEvent = this.mode === "collect";
    this.mode = mode;
    this.pendingMode = mode;
    this.pendingModeSeq = wakesOnModeEvent ? this.nextSeq : null;
    this.emit("mode", { mode });
  }

  /** Send control: resolves with whether a `send` checkpoint left the page. */
  send(): Promise<boolean> {
    return this.emitter.send();
  }

  /** Done control: emits the `final` checkpoint (always) and returns it. */
  final(): LiveCheckpoint {
    this.emitter.final();
    return this.checkpoints[this.checkpoints.length - 1];
  }

  /**
   * Done control, end to end: `final` checkpoint, wait for its ack (or a
   * terminal stream state / timeout), then `POST /session/end`. The session
   * ends when the endpoint confirms; `stop()` still assembles the archive, and
   * when the endpoint did not confirm the result says why, so the zip fallback
   * that follows is never silent.
   */
  async finish(): Promise<FinishResult> {
    const checkpoint = this.final();
    let finalAcked = false;
    let failure: string | undefined;
    if (this.client && this.finalSeq !== null) {
      finalAcked = await this.waitForAck(this.finalSeq, this.finalAckTimeoutMs);
      if (!finalAcked) {
        failure = this.client.isTerminal
          ? `the stream is ${this.client.state}`
          : `the final checkpoint was not acknowledged within ${Math.round(this.finalAckTimeoutMs / 1000)} s`;
      }
    }
    let ended = this.phase === "ended";
    if (!ended && this.client && this.token && this.endpointOrigin && !this.client.isTerminal) {
      const outcome = await this.postSessionEnd();
      ended = outcome.ok;
      if (!outcome.ok) failure = outcome.failure;
    }
    if (ended && this.phase !== "ended") this.handleEnded("riffer_done");
    if (!this.client || ended) return { checkpoint, finalAcked, ended };
    return { checkpoint, finalAcked, ended, failure: failure ?? "the endpoint did not confirm the session end" };
  }

  allCheckpoints(): LiveCheckpoint[] {
    return [...this.checkpoints];
  }

  // ---------------------------------------------------------------------
  // Observation
  // ---------------------------------------------------------------------

  subscribe(listener: (snapshot: LiveSessionSnapshot) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  on<K extends LiveSessionEventName>(name: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener as Listener<LiveSessionEventName>);
    this.listeners.set(name, set);
    return () => set.delete(listener as Listener<LiveSessionEventName>);
  }

  snapshot(): LiveSessionSnapshot {
    return {
      id: this.id,
      status: this.status,
      phase: this.phase,
      voice: this.voice,
      voiceUnavailable: this.voiceReason,
      stream: this.streamStatus,
      endpoint: this.endpointOrigin,
      mode: this.mode,
      pendingMode: this.pendingMode,
      muted: this.muted,
      mic: this.mic,
      units: this.units.all(),
      annotations: [...this.annotations],
      transcript: [...this.transcript],
      openQuestions: this.units.openQuestions(),
      checkpoints: [...this.checkpoints],
      nextSeq: this.nextSeq,
      ackedSeq: this.ackedSeq,
      queueLength: this.queue?.length ?? 0,
      expectedSchemaVersion: this.expectedSchemaVersion,
      error: this.error,
      finalEmitted: this.finalSeq !== null
    };
  }

  // ---------------------------------------------------------------------
  // Archive (I6, R4)
  // ---------------------------------------------------------------------

  /**
   * The two R4 shapes: with no endpoint the interviewer never ran, so there is
   * no `transcript.json`; a session whose endpoint was lost adds transcript and
   * units. `annotations.json` is always present for a live session.
   */
  archiveInputs(): LiveArchiveInputs {
    const frames: Record<string, Blob> = {};
    for (const [id, base64] of this.frameBytes) {
      const blob = base64ToBlob(base64, "image/jpeg");
      if (blob) frames[`${id}.jpg`] = blob;
    }
    const clips: Record<string, Blob> = {};
    for (const [id, blob] of this.clipBytes) {
      clips[clipFileName({ id, mimeType: blob.type })] = blob;
    }
    const units = this.units.all();
    return {
      transcript: this.voiceRan ? [...this.transcript] : null,
      units: this.client || units.length > 0 ? units : null,
      annotations: [...this.annotations],
      frames,
      ...(Object.keys(clips).length > 0 ? { clips } : {})
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private elapsed(): number {
    return Math.max(0, this.now() - this.startedAt);
  }

  /**
   * A reload keeps only frame metadata, so the JPEGs of every unacked frame are
   * read back for the archive's `frames/`: from the rehydrated queue for a frame
   * whose bytes stayed inline (its store write had not settled), otherwise from
   * the frame store.
   */
  private async restoreFrameBytes(onError?: (error: unknown) => void): Promise<void> {
    for (const entry of this.queue?.all() ?? []) {
      if (!isLiveEnvelopeOfType(entry, "frame") || entry.payload.dropped) continue;
      if (entry.payload.jpeg_base64 !== "") this.frameBytes.set(entry.payload.id, entry.payload.jpeg_base64);
    }
    // Every store read is issued before the first await, so an ack on replay or
    // a `clearStore` cannot delete a row this still has to read.
    await Promise.all(
      this.frames
        .filter((frame) => !frame.dropped && !this.frameBytes.has(frame.id))
        .map(async (frame) => {
          try {
            const bytes = await this.frameStore.get(this.id, frame.id);
            if (bytes) this.frameBytes.set(frame.id, bytes);
          } catch (error) {
            onError?.(error);
          }
        })
    );
  }

  private emit<T extends LiveEventType>(type: T, payload: LivePayloadMap[T]): LiveEnvelope<T> {
    const envelope = {
      schema_version: LIVE_SCHEMA_VERSION,
      session_id: this.id,
      seq: this.nextSeq++,
      t: this.elapsed(),
      type,
      payload
    } as LiveEnvelope<T>;
    if (this.client && this.phase === "running") {
      this.client.enqueue(envelope);
    } else if (this.client) {
      this.queue?.enqueue(envelope);
    }
    this.persist();
    this.notify();
    return envelope;
  }

  private emitCheckpoint(trigger: PageCheckpointTrigger): void {
    if (this.phase !== "running") return;
    const checkpoint: LiveCheckpoint = {
      id: `cp_${pad(this.nextCheckpoint++)}`,
      trigger,
      mode: this.mode
    };
    this.checkpoints.push(checkpoint);
    this.units.markCheckpointEmitted();
    const envelope = this.emit("checkpoint", checkpoint);
    const stampsPendingMode = this.pendingMode !== null && this.pendingModeSeq === null;
    if (stampsPendingMode) this.pendingModeSeq = envelope.seq;
    if (trigger === "final") this.finalSeq = envelope.seq;
    if (trigger === "final" || stampsPendingMode) this.persist();
    this.emitEvent("checkpoint", checkpoint);
    if (this.client) void this.client.flushNow();
  }

  private linkAnnotation(annotationId: string, unitId: string): void {
    this.units.addAnnotationId(unitId, annotationId);
  }

  private frameKind(frameId: string): LiveFrame["kind"] | null {
    return this.frames.find((frame) => frame.id === frameId)?.kind ?? null;
  }

  /** Only the most recent held frames can still be picked by a unit (the U6 ring buffer keeps 12). */
  private holdFrame(frameId: string, jpeg: string): void {
    this.heldFrames.set(frameId, jpeg);
    while (this.heldFrames.size > HELD_FRAME_CAP) {
      const oldest = this.heldFrames.keys().next().value;
      if (oldest === undefined) break;
      this.heldFrames.delete(oldest);
    }
  }

  /** A gesture frame held under `frames: "one"` leaves the page the moment a unit references it. */
  private postHeldFrame(frameId: string): void {
    const jpeg = this.heldFrames.get(frameId);
    if (jpeg === undefined) return;
    this.heldFrames.delete(frameId);
    const meta = this.frames.find((frame) => frame.id === frameId);
    if (!meta) return;
    this.emit("frame", { id: meta.id, t: meta.t, route: meta.route, kind: meta.kind, jpeg_base64: jpeg });
  }

  private handleAck(seq: number): void {
    if (seq > this.ackedSeq) this.ackedSeq = seq;
    this.clearPendingModeIfActedOn();
    const waiters = this.ackWaiters.splice(0);
    for (const waiter of waiters) {
      if (waiter.seq <= seq) waiter.resolve(true);
      else this.ackWaiters.push(waiter);
    }
    this.persist();
    this.notify();
  }

  private handleStreamState(state: StreamClientState, detail: StreamClientStateDetail): void {
    switch (state) {
      case "idle":
        this.streamStatus = "idle";
        break;
      case "streaming":
        this.streamStatus = "streaming";
        break;
      case "buffering":
        this.streamStatus = "buffering";
        break;
      case "incompatible":
        this.streamStatus = "incompatible";
        this.expectedSchemaVersion = detail.expectedSchemaVersion ?? null;
        break;
      case "conflict":
        this.streamStatus = "conflict";
        this.fail({
          reason: "session_conflict",
          message: "The endpoint is bound to another session.",
          ...(detail.activeSessionId ? { activeSessionId: detail.activeSessionId } : {})
        });
        break;
      case "unauthorized":
        this.streamStatus = "unauthorized";
        this.fail({ reason: "unauthorized", message: "The endpoint rejected the page token." });
        break;
      case "ended":
        this.streamStatus = "ended";
        break;
      case "closed":
        break;
      default: {
        const exhaustive: never = state;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }

  private handleServerEvent(event: LiveServerEvent): void {
    switch (event.event) {
      case "unit_status": {
        const { unit_id, status, note, guess } = event.data;
        const unit = this.units.applyStatus(unit_id, status, { note, guess });
        if (unit) this.emitEvent("unit_status", { unit, status, ...(note ? { note } : {}), ...(guess ? { guess } : {}) });
        break;
      }
      case "applied": {
        for (const id of event.data.unit_ids) this.units.applyStatus(id, "applied");
        this.emitEvent("applied", event.data);
        break;
      }
      case "ask": {
        const question = this.units.ask(event.data.unit_id, event.data.question, this.elapsed());
        const unit = this.units.get(event.data.unit_id);
        if (question && unit) this.emitEvent("ask", { unit, question });
        break;
      }
      case "ack":
        break;
      case "session_ended":
        break;
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }

  /**
   * KTD12 hint: the mode stays "pending" until the endpoint acknowledges the
   * envelope it acts on — the `mode` envelope itself when the switch left
   * Collect, otherwise the first checkpoint stamped with the new mode.
   */
  private clearPendingModeIfActedOn(): void {
    if (this.pendingMode === null || this.pendingModeSeq === null) return;
    if (this.ackedSeq < this.pendingModeSeq) return;
    this.pendingMode = null;
    this.pendingModeSeq = null;
  }

  private handleEnded(reason: string | undefined): void {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.streamStatus = "ended";
    this.emitter.dispose();
    this.client?.close();
    this.detachPageHide();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.clearStorage();
    if (this.queue) void this.queue.clearStore();
    this.emitEvent("ended", { reason });
    this.notify();
  }

  private handleFrameDropped(envelope: LiveEnvelope<"frame">): void {
    const meta = this.frames.find((frame) => frame.id === envelope.payload.id);
    if (meta) meta.dropped = envelope.payload.dropped;
    this.emitEvent("frame_dropped", {
      id: envelope.payload.id,
      t: envelope.payload.t,
      route: envelope.payload.route,
      kind: envelope.payload.kind,
      dropped: envelope.payload.dropped
    });
    this.notify();
  }

  private fail(error: LiveSessionError): void {
    this.error = error;
    if (this.phase === "running") this.phase = "error";
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.emitEvent("error", error);
  }

  private waitForAck(seq: number, timeoutMs: number): Promise<boolean> {
    if (this.ackedSeq >= seq) return Promise.resolve(true);
    if (!this.client || this.client.isTerminal) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const timer = this.setTimer(() => {
        if (settled) return;
        settled = true;
        const index = this.ackWaiters.findIndex((waiter) => waiter.resolve === wrapped);
        if (index !== -1) this.ackWaiters.splice(index, 1);
        resolve(false);
      }, timeoutMs);
      const wrapped = (acked: boolean) => {
        if (settled) return;
        settled = true;
        this.clearTimer(timer);
        resolve(acked);
      };
      this.ackWaiters.push({ seq, resolve: wrapped });
    });
  }

  private async postSessionEnd(): Promise<{ ok: true } | { ok: false; failure: string }> {
    if (!this.client) return { ok: false, failure: "no endpoint is configured" };
    const body = {
      schema_version: LIVE_SCHEMA_VERSION,
      session_id: this.id,
      mode: this.mode,
      transcript: this.transcript,
      units: this.units.all(),
      annotations: this.annotations,
      answers: this.answers,
      checkpoints: this.checkpoints,
      frames: this.frames
    };
    try {
      const response = await this.fetchImpl(`${this.endpointOrigin}/session/end`, {
        method: "POST",
        headers: this.client.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      if (response.ok) return { ok: true };
      return { ok: false, failure: `POST /session/end returned ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, failure: `POST /session/end failed: ${message}` };
    }
  }

  private attachPageHide(): void {
    if (this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.addEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = true;
  }

  private detachPageHide(): void {
    if (!this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.removeEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = false;
  }

  private handlePageHide(): void {
    if (this.phase !== "running" || !this.client) {
      this.persist();
      return;
    }
    const envelope = {
      schema_version: LIVE_SCHEMA_VERSION,
      session_id: this.id,
      seq: this.nextSeq++,
      t: this.elapsed(),
      type: "stream_state",
      payload: { state: "unloading" }
    } as LiveEnvelope<"stream_state">;
    this.client.sendUnloading(envelope);
    this.persist();
  }

  private toPersisted(tier: PersistTier, queue: PersistedQueueEntry[] | null): PersistedLiveSession {
    const minimal = tier === "minimal";
    return {
      version: 1,
      session_id: this.id,
      token: this.token,
      endpoint: this.endpointOrigin,
      started_at: this.startedAt,
      mode: this.mode,
      pending_mode: this.pendingMode,
      voice_ran: this.voiceRan,
      muted: this.muted,
      mic: this.mic,
      next_seq: this.nextSeq,
      acked_seq: this.ackedSeq,
      next_unit: this.nextUnit,
      next_checkpoint: this.nextCheckpoint,
      next_id: this.nextId,
      queue,
      units: this.units.snapshot(),
      annotations: minimal ? [] : this.annotations,
      transcript: minimal ? [] : this.transcript,
      frames: minimal ? [] : this.frames,
      answers: this.answers,
      checkpoints: this.checkpoints,
      final_seq: this.finalSeq,
      pending_mode_seq: this.pendingModeSeq,
      ...(this.profile.frames === "none" ? { frames_off: true } : {}),
      ...(tier === "full" ? {} : { degraded: tier })
    };
  }

  private persist(): void {
    if (!this.storage || this.phase === "ended" || this.phase === "idle" || this.phase === "consenting") return;
    const key = liveSessionStorageKey(this.id);
    try {
      this.storage.setItem(LIVE_CURRENT_SESSION_KEY, this.id);
    } catch {
      // The record write below reports the outcome.
    }
    this.persistOutcome = persistWithQuotaGuard(
      this.storage,
      key,
      this.queue,
      (tier, entries) => JSON.stringify(this.toPersisted(tier, entries)),
      { t: this.elapsed() }
    );
    if (this.persistOutcome === "failed") {
      this.error = { reason: "persist_failed", message: "riffrec live: sessionStorage write failed" };
    }
  }

  private clearStorage(): void {
    if (!this.storage) return;
    try {
      for (const key of this.storageKeys()) this.storage.removeItem(key);
    } catch {
      // Storage unavailable; nothing to clear.
    }
    clearStoredBootstrap(this.storage);
  }

  private emitEvent<K extends LiveSessionEventName>(name: K, payload: LiveSessionEvents[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of set) (listener as Listener<K>)(payload);
  }

  private notify(): void {
    if (this.changeListeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.changeListeners) listener(snapshot);
  }
}

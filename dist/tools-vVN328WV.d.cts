/**
 * Live-mode wire contract (Interface I1).
 *
 * Every page -> endpoint message is a `LiveEnvelope`. The envelope is versioned
 * independently from the zip schema (`RIFFREC_SCHEMA_VERSION`); breaking changes
 * bump `LIVE_SCHEMA_VERSION` and are documented in the CHANGELOG.
 * The human-readable description lives in `docs/live-stream-contract.md`.
 */
declare const LIVE_SCHEMA_VERSION: "live/1";
type LiveSchemaVersion = typeof LIVE_SCHEMA_VERSION;
/** Header carrying the page's session id on every page -> endpoint request. */
declare const LIVE_SESSION_HEADER: "X-Riffrec-Session";
/** Body cap for a `POST /events` batch (I3). */
declare const LIVE_EVENTS_BODY_MAX_BYTES: number;
/** Body cap for a `POST /events` body holding a lone `frame` envelope (I3). */
declare const LIVE_FRAME_BODY_MAX_BYTES: number;
declare const LIVE_EVENT_TYPES: readonly ["click", "network_request", "console_error", "navigation", "transcript", "unit", "unit_update", "unit_withdraw", "annotation", "checkpoint", "answer", "frame", "mic", "mode", "stream_state"];
type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];
type ExecutionMode = "instant" | "smart" | "collect";
declare const EXECUTION_MODES: readonly ExecutionMode[];
declare const DEFAULT_EXECUTION_MODE: ExecutionMode;
/** R11: initial -> triaging -> accepted | needs_info, then applied | blocked; withdrawn when retracted. */
type UnitStatus = "initial" | "triaging" | "accepted" | "needs_info" | "applied" | "blocked" | "withdrawn";
declare const UNIT_STATUSES: readonly UnitStatus[];
/** `silence`, `page_change`, `send` are page-emitted (KTD9); `answer`, `final` are endpoint-emitted. */
type CheckpointTrigger = "silence" | "page_change" | "send" | "answer" | "final";
declare const CHECKPOINT_TRIGGERS: readonly CheckpointTrigger[];
type MicState = "granted" | "denied" | "muted" | "unmuted";
type StreamState = "streaming" | "buffering" | "unloading";
type FrameKind = "gesture" | "periodic" | "composite";
type AnnotationKind = "stroke" | "pin";
type TranscriptRole = "riffer" | "interviewer";
interface LiveAnchor {
    route: string;
    selector: string;
    component?: string | null;
    rect: ElementBoundingBox;
    /** Milliseconds since session start, matching `RiffrecEvent.t`. */
    t: number;
}
interface LiveTranscriptSpan {
    t_start: number;
    t_end: number;
}
/** R21: the +-10 s window of network and console events around the utterance. */
interface LiveTelemetryWindow {
    t_start: number;
    t_end: number;
    events: RiffrecEvent[];
}
interface LiveUnitEvidence {
    frame_ids: string[];
    annotation_ids: string[];
    transcript_span: LiveTranscriptSpan;
    telemetry_window?: LiveTelemetryWindow;
    audio_clip_id?: string;
}
/** KTD22: the riffer's per-unit confirmation of intended element and intended change. */
interface LiveUnitConfirmation {
    element: boolean;
    change: boolean;
}
interface LiveUnit {
    id: string;
    statement: string;
    transcript_excerpt: string;
    anchors: LiveAnchor[];
    evidence: LiveUnitEvidence;
    status: UnitStatus;
    confirmed?: LiveUnitConfirmation;
}
interface LivePoint {
    x: number;
    y: number;
    pressure?: number;
}
interface LiveAnnotation {
    id: string;
    kind: AnnotationKind;
    points: LivePoint[];
    bbox: ElementBoundingBox;
    anchor: LiveAnchor;
    text?: string;
    unit_id?: string;
    composite_frame_id?: string;
}
interface LiveTranscript {
    id: string;
    role: TranscriptRole;
    text: string;
    t_start: number;
    t_end: number;
    final: boolean;
}
interface LiveUnitUpdate {
    unit_id: string;
    statement?: string;
    anchors_add?: LiveAnchor[];
    confirmed?: LiveUnitConfirmation;
}
interface LiveUnitWithdraw {
    unit_id: string;
    reason?: string;
}
interface LiveCheckpoint {
    id: string;
    trigger: CheckpointTrigger;
    mode: ExecutionMode;
}
interface LiveAnswer {
    unit_id: string;
    text: string;
}
/** Why a frame reached the endpoint without its JPEG (KTD16 quota guard, I3 413). */
type FrameDropReason = "quota" | "oversize";
declare const FRAME_DROP_REASONS: readonly FrameDropReason[];
interface LiveFrame {
    id: string;
    t: number;
    route: string;
    kind: FrameKind;
    /** Empty when `dropped` is set: the frame kept its `seq` but its bytes were discarded. */
    jpeg_base64: string;
    dropped?: FrameDropReason;
}
interface LiveMic {
    state: MicState;
}
interface LiveMode {
    mode: ExecutionMode;
}
interface LiveStreamState {
    state: StreamState;
}
interface LivePayloadMap {
    click: ClickEvent;
    network_request: NetworkRequestEvent;
    console_error: ConsoleErrorEvent;
    navigation: NavigationEvent;
    transcript: LiveTranscript;
    unit: LiveUnit;
    unit_update: LiveUnitUpdate;
    unit_withdraw: LiveUnitWithdraw;
    annotation: LiveAnnotation;
    checkpoint: LiveCheckpoint;
    answer: LiveAnswer;
    frame: LiveFrame;
    mic: LiveMic;
    mode: LiveMode;
    stream_state: LiveStreamState;
}
type LivePayload<T extends LiveEventType = LiveEventType> = LivePayloadMap[T];
/** KTD2 envelope. `seq` is a per-session monotonic integer starting at 1. */
type LiveEnvelope<T extends LiveEventType = LiveEventType> = T extends LiveEventType ? {
    schema_version: LiveSchemaVersion;
    session_id: string;
    seq: number;
    t: number;
    type: T;
    payload: LivePayloadMap[T];
} : never;
type LiveEnvelopeRejection = "not_object" | "unsupported_schema_version" | "missing_session_id" | "missing_seq" | "invalid_seq" | "invalid_t" | "unknown_type" | "invalid_payload";
type LiveEnvelopeInspection = {
    ok: true;
    envelope: LiveEnvelope;
} | {
    ok: false;
    reason: LiveEnvelopeRejection;
    detail?: string;
};
type LiveServerEventName = "unit_status" | "applied" | "ask" | "ack" | "session_ended";
interface LiveUnitStatusEvent {
    event: "unit_status";
    data: {
        unit_id: string;
        status: UnitStatus;
        note?: string;
        guess?: string;
    };
}
interface LiveAppliedEvent {
    event: "applied";
    data: {
        checkpoint_id: string;
        unit_ids: string[];
    };
}
interface LiveAskEvent {
    event: "ask";
    data: {
        unit_id: string;
        question: string;
    };
}
interface LiveAckEvent {
    event: "ack";
    data: {
        acked_seq: number;
    };
}
interface LiveSessionEndedEvent {
    event: "session_ended";
    data: {
        reason?: string;
    };
}
type LiveServerEvent = LiveUnitStatusEvent | LiveAppliedEvent | LiveAskEvent | LiveAckEvent | LiveSessionEndedEvent;
type WakeSessionStatus = "live" | "page_lost";
/** KTD7: the JSON printed by `wait` when a batch is available. */
interface LiveWakeBatch {
    schema_version: LiveSchemaVersion;
    checkpoint_id: string;
    kind: CheckpointTrigger;
    mode_at_checkpoint: ExecutionMode;
    session_status: WakeSessionStatus;
    units: LiveUnit[];
    annotations: LiveAnnotation[];
    answers: LiveAnswer[];
}
interface LiveEventsResponse {
    acked_seq: number;
}
interface LiveSchemaMismatchResponse {
    expected_schema_version: LiveSchemaVersion;
}
interface LiveMintRequest {
    session_id: string;
}
interface LiveMintResponse {
    client_secret: string;
    /** Unix epoch seconds. */
    expires_at: number;
    model: string;
}
type LiveMintError = {
    status: 401;
} | {
    status: 403;
    reason: "tls_required";
} | {
    status: 429;
    retry_after: number;
} | {
    status: 502;
    reason: "openai_error";
    upstream_status: number;
} | {
    status: 503;
    reason: "no_key" | "brief_contains_secret";
};
declare function isLiveEventType(value: unknown): value is LiveEventType;
/**
 * Inspects an unknown value as a live envelope and reports why it fails.
 * Endpoints use the reason to pick a status code: `unsupported_schema_version`
 * maps to HTTP 409, every other rejection to HTTP 400.
 */
declare function inspectEnvelope(value: unknown): LiveEnvelopeInspection;
/** Type guard over `inspectEnvelope`: rejects unknown types, a missing `seq`, or a foreign `schema_version`. */
declare function validateEnvelope(value: unknown): value is LiveEnvelope;
declare function isLiveEnvelopeOfType<T extends LiveEventType>(envelope: LiveEnvelope, type: T): envelope is LiveEnvelope<T>;

/**
 * The evidence profile (R19, R21): what a unit carries on the wire. Anchors
 * and the transcript span are always present; everything else is declared per
 * session by the consumer. The archive and `/session/end` keep full evidence
 * regardless (KTD22), so the profile shapes only the `unit` and `frame`
 * envelopes the session posts.
 */
/**
 * Which frames leave the page:
 * - `none`: no `frame` envelope is posted and units ship with empty `frame_ids`.
 * - `one`: a unit carries one frame — its first composite when it has one,
 *   otherwise the gesture frame nearest its first anchor — and only frames a
 *   unit references (plus every composite) are posted.
 * - `all`: every buffered frame is posted and units keep every reference.
 */
type EvidenceFrames = "none" | "one" | "all";
interface EvidenceProfile {
    transcript_excerpt: boolean;
    /** Structured strokes and pins (`annotation_ids`). */
    strokes: boolean;
    frames: EvidenceFrames;
    telemetry_window: boolean;
    audio_clip: boolean;
}
type EvidenceProfileName = "anchors_transcript_only" | "default" | "full";

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
type LiveSessionStatus = "idle" | "consenting" | "connecting" | "live" | "live_novoice" | "buffering" | "reconnecting" | "incompatible" | "ended" | "error";

declare const RIFFREC_SCHEMA_VERSION: "1.0.0";
type RiffrecSchemaVersion = typeof RIFFREC_SCHEMA_VERSION;
/**
 * `live` marks a live session (KTD16): unlike `recording`, unmounting the
 * provider does not end it, and the next mount rehydrates it.
 */
type RiffrecStatus = "idle" | "recording" | "live" | "stopping" | "disabled" | "error";
type RiffrecWriteMethod = "zip";
interface ElementBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface ElementInfo {
    tag: string;
    text: string | null;
    id: string | null;
    selector: string;
    name?: string;
    fullPath?: string;
    classes?: string[];
    role?: string | null;
    ariaLabel?: string | null;
    nearbyText?: string | null;
    nearbyElements?: string | null;
    boundingBox?: ElementBoundingBox;
    computedStyles?: Record<string, string>;
}
interface ClickEvent {
    t: number;
    type: "click";
    component: string | null;
    componentPath?: string[] | null;
    element: ElementInfo;
}
interface NetworkRequestEvent {
    t: number;
    type: "network_request";
    url: string;
    method: string;
    status: number;
    duration_ms: number;
}
interface ConsoleErrorEvent {
    t: number;
    type: "console_error";
    message: string;
    stack: string | null;
    component: string | null;
}
interface NavigationEvent {
    t: number;
    type: "navigation";
    from: string;
    to: string;
}
type RiffrecEvent = ClickEvent | NetworkRequestEvent | ConsoleErrorEvent | NavigationEvent;
interface EventsJson {
    version: "1";
    schema_version: RiffrecSchemaVersion;
    session_id: string;
    url: string;
    started_at: string;
    duration_seconds: number;
    events: RiffrecEvent[];
}
interface SessionJson {
    url: string;
    react_version: string | null;
    browser: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    files_present: string[];
}
interface SessionResult {
    sessionPath: string | null;
    method: RiffrecWriteMethod;
    filesPresent: string[];
    sessionId: string;
    filename: string;
    archive: Blob;
}
interface RiffrecSessionOptions {
    /** Download the completed ZIP. Defaults to true. */
    download?: boolean;
    /** Runs after the archive is ready, including when stopped from the provider overlay. */
    onSessionComplete?: (result: SessionResult) => void | Promise<void>;
}
type RiffrecDisplayMediaVideo = MediaTrackConstraints;
type RiffrecDisplayMediaOptions = DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: "include" | "exclude";
    monitorTypeSurfaces?: "include" | "exclude";
    surfaceSwitching?: "include" | "exclude";
    systemAudio?: "include" | "exclude";
};
type RiffrecLiveMode = ExecutionMode;
/**
 * Live mode (I5). Setting `live` on the provider lazy-loads the live subtree;
 * `start()` then runs a live session instead of a classic recording. The page
 * token and endpoint origin normally arrive in the URL fragment
 * (`#riffrec_live=<token>&endpoint=<origin>`); `endpoint` is a fallback for
 * hosts that run a fixed endpoint. No option accepts an OpenAI key: the
 * endpoint mints the interviewer's ephemeral secret (R5).
 */
interface RiffrecLiveConfig {
    /** Fallback endpoint origin when the fragment carries none. */
    endpoint?: string;
    /** Evidence profile applied on the wire (R19); defaults to `"default"`. */
    profile?: EvidenceProfileName | Partial<EvidenceProfile>;
    /** Begin the consent step as soon as the live subtree is ready. */
    autoStart?: boolean;
    /** Keyboard shortcut for the drawing layer; `null` disables it. Defaults to `Alt+Shift+D`. */
    drawShortcut?: string | null;
    /** Who runs the endpoint, named in the consent copy (R26). */
    endpointOwner?: string;
}
/** `"disabled"` when the provider has no `live` config or is disabled in production. */
type RiffrecLiveStatus = LiveSessionStatus | "disabled";
interface RiffrecLiveControls {
    status: RiffrecLiveStatus;
    mode: RiffrecLiveMode;
    /** Takes effect at the next checkpoint (KTD12). */
    setMode: (mode: RiffrecLiveMode) => void;
    muted: boolean;
    /** Mutes the interviewer, the voice recording, and the audio clips together (KTD21). */
    setMuted: (muted: boolean) => void;
    /** Emits a `send` checkpoint; resolves with whether one left the page. */
    send: () => Promise<boolean>;
    /** Ends the live session and assembles the archive (R4). */
    stop: () => Promise<SessionResult | null>;
}
interface RiffrecConfig {
    /**
     * Override default screen-capture options passed to `getDisplayMedia()`.
     */
    displayMedia?: Partial<RiffrecDisplayMediaOptions>;
    /**
     * Override default screen-capture video constraints (e.g. `frameRate`).
     */
    displayMediaVideo?: Partial<RiffrecDisplayMediaVideo>;
    downloadNoticeTitle?: string;
    downloadNoticeMessage?: string;
    forceEnable?: boolean;
    forceEnableParam?: boolean | string;
    onError?: (err: Error) => void;
    sanitizeError?: (msg: string, stack: string | null) => string;
    /** Enable live mode (I5). Absent: classic recording, no live code loaded. */
    live?: RiffrecLiveConfig;
}
interface RiffrecContextValue {
    start: (options?: RiffrecSessionOptions) => Promise<void>;
    stop: () => Promise<SessionResult | null>;
    status: RiffrecStatus;
    isEnabled: boolean;
    live: RiffrecLiveControls;
}
type UseRiffrecResult = Pick<RiffrecContextValue, "start" | "stop" | "status" | "live">;
interface CaptureOutputs {
    sessionId: string;
    startedAt: Date;
    durationSeconds: number;
    events: RiffrecEvent[];
    screenBlob: Blob | null;
    voiceBlob: Blob | null;
}
interface CaptureStartOptions {
    sessionStart: number;
}
type RiffrecEventSink = (event: RiffrecEvent) => void;
declare global {
    interface Window {
        __RIFFREC_PATCHED__?: boolean;
    }
}

/**
 * Interviewer tool set (KTD5): four flat function tools in the `breathwork-live`
 * shape. Exported as data so the endpoint helper can copy them verbatim.
 *
 * No tool emits checkpoints or reports state: the client owns all timing, and
 * page-side facts (a completed drawing, buffering, a mute) reach the interviewer
 * as text conversation items. No tool carries image content.
 */
declare const LIVE_TOOL_NAMES: readonly ["record_unit", "update_unit", "withdraw_unit", "relay_answer"];
type LiveToolName = (typeof LIVE_TOOL_NAMES)[number];
interface JsonSchemaProperty {
    type: "string" | "number" | "integer" | "boolean" | "array" | "object";
    description?: string;
    items?: JsonSchemaProperty;
    enum?: readonly string[];
}
interface JsonSchemaObject {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: readonly string[];
    additionalProperties: false;
}
/** The flat Realtime session tool shape: `{ type: "function", name, description, parameters }`. */
interface LiveToolDefinition<N extends LiveToolName = LiveToolName> {
    type: "function";
    name: N;
    description: string;
    parameters: JsonSchemaObject;
}
interface RecordUnitArgs {
    statement: string;
    /**
     * Anchor references, as the riffer named them or as the page announced them in
     * a conversation item ("the riffer drew on the sidebar toggle"). The client
     * resolves them to `LiveAnchor` objects; the interviewer never sees the page.
     */
    anchors: string[];
    transcript_excerpt: string;
}
interface UpdateUnitArgs {
    unit_id: string;
    statement?: string;
    anchors_add?: string[];
}
interface WithdrawUnitArgs {
    unit_id: string;
    reason?: string;
}
interface RelayAnswerArgs {
    unit_id: string;
    answer_text: string;
}
interface LiveToolArgsMap {
    record_unit: RecordUnitArgs;
    update_unit: UpdateUnitArgs;
    withdraw_unit: WithdrawUnitArgs;
    relay_answer: RelayAnswerArgs;
}
type LiveToolArgs<N extends LiveToolName = LiveToolName> = LiveToolArgsMap[N];
/** A tool call as the client receives it from the Realtime data channel. */
type LiveToolCall<N extends LiveToolName = LiveToolName> = N extends LiveToolName ? {
    call_id: string;
    name: N;
    arguments: LiveToolArgsMap[N];
} : never;
interface LiveToolResult {
    call_id: string;
    /** JSON-serializable result handed back as the function call output. */
    output: Record<string, unknown>;
}
declare const RECORD_UNIT_TOOL: LiveToolDefinition<"record_unit">;
declare const UPDATE_UNIT_TOOL: LiveToolDefinition<"update_unit">;
declare const WITHDRAW_UNIT_TOOL: LiveToolDefinition<"withdraw_unit">;
declare const RELAY_ANSWER_TOOL: LiveToolDefinition<"relay_answer">;
declare const LIVE_TOOLS: readonly LiveToolDefinition[];
declare function isLiveToolName(value: unknown): value is LiveToolName;
declare function getLiveTool<N extends LiveToolName>(name: N): LiveToolDefinition<N>;

export { type LivePoint as $, type AnnotationKind as A, type LiveAnswer as B, CHECKPOINT_TRIGGERS as C, DEFAULT_EXECUTION_MODE as D, EXECUTION_MODES as E, FRAME_DROP_REASONS as F, type LiveAppliedEvent as G, type LiveAskEvent as H, type LiveCheckpoint as I, type JsonSchemaObject as J, type LiveEnvelope as K, LIVE_EVENTS_BODY_MAX_BYTES as L, type LiveEnvelopeInspection as M, type LiveEnvelopeRejection as N, type LiveEventType as O, type LiveEventsResponse as P, type LiveFrame as Q, type RiffrecConfig as R, type SessionResult as S, type LiveMic as T, type UseRiffrecResult as U, type LiveMintError as V, type LiveMintRequest as W, type LiveMintResponse as X, type LiveMode as Y, type LivePayload as Z, type LivePayloadMap as _, type RiffrecDisplayMediaOptions as a, type LiveSchemaMismatchResponse as a0, type LiveSchemaVersion as a1, type LiveServerEvent as a2, type LiveServerEventName as a3, type LiveSessionEndedEvent as a4, type LiveSessionStatus as a5, type LiveStreamState as a6, type LiveTelemetryWindow as a7, type LiveToolArgs as a8, type LiveToolArgsMap as a9, type RiffrecLiveMode as aA, type RiffrecLiveStatus as aB, type RiffrecSchemaVersion as aC, type RiffrecSessionOptions as aD, type RiffrecStatus as aE, type RiffrecWriteMethod as aF, type SessionJson as aG, type StreamState as aH, type TranscriptRole as aI, UNIT_STATUSES as aJ, UPDATE_UNIT_TOOL as aK, type UnitStatus as aL, type UpdateUnitArgs as aM, WITHDRAW_UNIT_TOOL as aN, type WakeSessionStatus as aO, type WithdrawUnitArgs as aP, getLiveTool as aQ, inspectEnvelope as aR, isLiveEnvelopeOfType as aS, isLiveEventType as aT, isLiveToolName as aU, validateEnvelope as aV, type LiveToolCall as aa, type LiveToolDefinition as ab, type LiveToolName as ac, type LiveToolResult as ad, type LiveTranscript as ae, type LiveTranscriptSpan as af, type LiveUnit as ag, type LiveUnitConfirmation as ah, type LiveUnitEvidence as ai, type LiveUnitStatusEvent as aj, type LiveUnitUpdate as ak, type LiveUnitWithdraw as al, type LiveWakeBatch as am, type MicState as an, type NavigationEvent as ao, type NetworkRequestEvent as ap, RECORD_UNIT_TOOL as aq, RELAY_ANSWER_TOOL as ar, RIFFREC_SCHEMA_VERSION as as, type RecordUnitArgs as at, type RelayAnswerArgs as au, type RiffrecContextValue as av, type RiffrecEvent as aw, type RiffrecEventSink as ax, type RiffrecLiveConfig as ay, type RiffrecLiveControls as az, type RiffrecDisplayMediaVideo as b, type CaptureOutputs as c, type CaptureStartOptions as d, type CheckpointTrigger as e, type ClickEvent as f, type ConsoleErrorEvent as g, type ElementBoundingBox as h, type ElementInfo as i, type EventsJson as j, type EvidenceFrames as k, type EvidenceProfile as l, type EvidenceProfileName as m, type ExecutionMode as n, type FrameDropReason as o, type FrameKind as p, type JsonSchemaProperty as q, LIVE_EVENT_TYPES as r, LIVE_FRAME_BODY_MAX_BYTES as s, LIVE_SCHEMA_VERSION as t, LIVE_SESSION_HEADER as u, LIVE_TOOLS as v, LIVE_TOOL_NAMES as w, type LiveAckEvent as x, type LiveAnchor as y, type LiveAnnotation as z };

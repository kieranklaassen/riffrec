declare const RIFFREC_SCHEMA_VERSION: "1.0.0";
type RiffrecSchemaVersion = typeof RIFFREC_SCHEMA_VERSION;
type RiffrecStatus = "idle" | "recording" | "stopping" | "disabled" | "error";
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
}
interface RiffrecContextValue {
    start: (options?: RiffrecSessionOptions) => Promise<void>;
    stop: () => Promise<SessionResult | null>;
    status: RiffrecStatus;
    isEnabled: boolean;
}
type UseRiffrecResult = Pick<RiffrecContextValue, "start" | "stop" | "status">;
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
interface LiveFrame {
    id: string;
    t: number;
    route: string;
    kind: FrameKind;
    jpeg_base64: string;
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

export { type LiveSessionEndedEvent as $, type AnnotationKind as A, type LiveEnvelopeInspection as B, CHECKPOINT_TRIGGERS as C, DEFAULT_EXECUTION_MODE as D, EXECUTION_MODES as E, type FrameKind as F, type LiveEnvelopeRejection as G, type LiveEventType as H, type LiveEventsResponse as I, type JsonSchemaObject as J, type LiveFrame as K, LIVE_EVENTS_BODY_MAX_BYTES as L, type LiveMic as M, type LiveMintError as N, type LiveMintRequest as O, type LiveMintResponse as P, type LiveMode as Q, type RiffrecConfig as R, type SessionResult as S, type LivePayload as T, type UseRiffrecResult as U, type LivePayloadMap as V, type LivePoint as W, type LiveSchemaMismatchResponse as X, type LiveSchemaVersion as Y, type LiveServerEvent as Z, type LiveServerEventName as _, type RiffrecDisplayMediaOptions as a, type LiveStreamState as a0, type LiveTelemetryWindow as a1, type LiveToolArgs as a2, type LiveToolArgsMap as a3, type LiveToolCall as a4, type LiveToolDefinition as a5, type LiveToolName as a6, type LiveToolResult as a7, type LiveTranscript as a8, type LiveTranscriptSpan as a9, UPDATE_UNIT_TOOL as aA, type UnitStatus as aB, type UpdateUnitArgs as aC, WITHDRAW_UNIT_TOOL as aD, type WakeSessionStatus as aE, type WithdrawUnitArgs as aF, getLiveTool as aG, inspectEnvelope as aH, isLiveEnvelopeOfType as aI, isLiveEventType as aJ, isLiveToolName as aK, validateEnvelope as aL, type LiveUnit as aa, type LiveUnitConfirmation as ab, type LiveUnitEvidence as ac, type LiveUnitStatusEvent as ad, type LiveUnitUpdate as ae, type LiveUnitWithdraw as af, type LiveWakeBatch as ag, type MicState as ah, type NavigationEvent as ai, type NetworkRequestEvent as aj, RECORD_UNIT_TOOL as ak, RELAY_ANSWER_TOOL as al, RIFFREC_SCHEMA_VERSION as am, type RecordUnitArgs as an, type RelayAnswerArgs as ao, type RiffrecContextValue as ap, type RiffrecEvent as aq, type RiffrecEventSink as ar, type RiffrecSchemaVersion as as, type RiffrecSessionOptions as at, type RiffrecStatus as au, type RiffrecWriteMethod as av, type SessionJson as aw, type StreamState as ax, type TranscriptRole as ay, UNIT_STATUSES as az, type RiffrecDisplayMediaVideo as b, type CaptureOutputs as c, type CaptureStartOptions as d, type CheckpointTrigger as e, type ClickEvent as f, type ConsoleErrorEvent as g, type ElementBoundingBox as h, type ElementInfo as i, type EventsJson as j, type ExecutionMode as k, type JsonSchemaProperty as l, LIVE_EVENT_TYPES as m, LIVE_FRAME_BODY_MAX_BYTES as n, LIVE_SCHEMA_VERSION as o, LIVE_SESSION_HEADER as p, LIVE_TOOLS as q, LIVE_TOOL_NAMES as r, type LiveAckEvent as s, type LiveAnchor as t, type LiveAnnotation as u, type LiveAnswer as v, type LiveAppliedEvent as w, type LiveAskEvent as x, type LiveCheckpoint as y, type LiveEnvelope as z };

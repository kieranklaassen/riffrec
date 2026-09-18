import type {
  ClickEvent,
  ConsoleErrorEvent,
  ElementBoundingBox,
  NavigationEvent,
  NetworkRequestEvent,
  RiffrecEvent
} from "../types";

/**
 * Live-mode wire contract (Interface I1).
 *
 * Every page -> endpoint message is a `LiveEnvelope`. The envelope is versioned
 * independently from the zip schema (`RIFFREC_SCHEMA_VERSION`); breaking changes
 * bump `LIVE_SCHEMA_VERSION` and are documented in the CHANGELOG.
 * The human-readable description lives in `docs/live-stream-contract.md`.
 */
export const LIVE_SCHEMA_VERSION = "live/1" as const;

export type LiveSchemaVersion = typeof LIVE_SCHEMA_VERSION;

/** Header carrying the page's session id on every page -> endpoint request. */
export const LIVE_SESSION_HEADER = "X-Riffrec-Session" as const;
/** Carries a riffer-pasted OpenAI key on `POST /mint`; the endpoint prefers it over its own. */
export const LIVE_OPENAI_KEY_HEADER = "X-Riffrec-OpenAI-Key" as const;

/** Body cap for a `POST /events` batch (I3). */
export const LIVE_EVENTS_BODY_MAX_BYTES = 64 * 1024;

/** Body cap for a `POST /events` body holding a lone `frame` envelope (I3). */
export const LIVE_FRAME_BODY_MAX_BYTES = 2 * 1024 * 1024;

export const LIVE_EVENT_TYPES = [
  "click",
  "network_request",
  "console_error",
  "navigation",
  "transcript",
  "unit",
  "unit_update",
  "unit_withdraw",
  "annotation",
  "checkpoint",
  "answer",
  "frame",
  "mic",
  "mode",
  "stream_state"
] as const;

export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

export type ExecutionMode = "instant" | "smart" | "collect";

export const EXECUTION_MODES: readonly ExecutionMode[] = ["instant", "smart", "collect"];

export const DEFAULT_EXECUTION_MODE: ExecutionMode = "smart";

/** R11: initial -> triaging -> accepted | needs_info -> working (the agent is editing), then applied | blocked; withdrawn when retracted. */
export type UnitStatus =
  | "initial"
  | "triaging"
  | "accepted"
  | "needs_info"
  | "working"
  | "applied"
  | "blocked"
  | "withdrawn";

export const UNIT_STATUSES: readonly UnitStatus[] = [
  "initial",
  "triaging",
  "accepted",
  "needs_info",
  "working",
  "applied",
  "blocked",
  "withdrawn"
];

/**
 * KTD9/KTD12: `silence`, `page_change`, `send`, and `final` are page-emitted;
 * `answer` and `mode_change` are endpoint-emitted and appear only as wake kinds.
 * `answer`, `mode_change`, and `final` always wake the agent, even with nothing
 * newly held; `silence`, `page_change`, and `send` wake only when they release work.
 */
export type CheckpointTrigger = "silence" | "page_change" | "send" | "answer" | "mode_change" | "final";

export const CHECKPOINT_TRIGGERS: readonly CheckpointTrigger[] = [
  "silence",
  "page_change",
  "send",
  "answer",
  "mode_change",
  "final"
];

/** Wake kinds served even when the held queue is empty (KTD9). */
export const ALWAYS_WAKE_TRIGGERS: readonly CheckpointTrigger[] = ["answer", "mode_change", "final"];

export type MicState = "granted" | "denied" | "muted" | "unmuted";

export type StreamState = "streaming" | "buffering" | "unloading";

export type FrameKind = "gesture" | "periodic" | "composite";

export type AnnotationKind = "stroke" | "pin";

export type TranscriptRole = "riffer" | "interviewer";

export interface LiveAnchor {
  route: string;
  selector: string;
  component?: string | null;
  rect: ElementBoundingBox;
  /** Milliseconds since session start, matching `RiffrecEvent.t`. */
  t: number;
}

export interface LiveTranscriptSpan {
  t_start: number;
  t_end: number;
}

/** R21: the +-10 s window of network and console events around the utterance. */
export interface LiveTelemetryWindow {
  t_start: number;
  t_end: number;
  events: RiffrecEvent[];
}

export interface LiveUnitEvidence {
  frame_ids: string[];
  annotation_ids: string[];
  transcript_span: LiveTranscriptSpan;
  telemetry_window?: LiveTelemetryWindow;
  audio_clip_id?: string;
}

/** KTD22: the riffer's per-unit confirmation of intended element and intended change. */
export interface LiveUnitConfirmation {
  element: boolean;
  change: boolean;
}

export interface LiveUnit {
  id: string;
  statement: string;
  transcript_excerpt: string;
  anchors: LiveAnchor[];
  evidence: LiveUnitEvidence;
  status: UnitStatus;
  confirmed?: LiveUnitConfirmation;
}

export interface LivePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface LiveAnnotation {
  id: string;
  kind: AnnotationKind;
  points: LivePoint[];
  bbox: ElementBoundingBox;
  anchor: LiveAnchor;
  text?: string;
  unit_id?: string;
  composite_frame_id?: string;
}

export interface LiveTranscript {
  id: string;
  role: TranscriptRole;
  text: string;
  t_start: number;
  t_end: number;
  final: boolean;
}

export interface LiveUnitUpdate {
  unit_id: string;
  statement?: string;
  anchors_add?: LiveAnchor[];
  confirmed?: LiveUnitConfirmation;
}

export interface LiveUnitWithdraw {
  unit_id: string;
  reason?: string;
}

export interface LiveCheckpoint {
  id: string;
  trigger: CheckpointTrigger;
  mode: ExecutionMode;
}

export interface LiveAnswer {
  unit_id: string;
  text: string;
}

/** Why a frame reached the endpoint without its JPEG (KTD16 quota guard, I3 413). */
export type FrameDropReason = "quota" | "oversize";

export const FRAME_DROP_REASONS: readonly FrameDropReason[] = ["quota", "oversize"];

export interface LiveFrame {
  id: string;
  t: number;
  route: string;
  kind: FrameKind;
  /** Empty when `dropped` is set: the frame kept its `seq` but its bytes were discarded. */
  jpeg_base64: string;
  dropped?: FrameDropReason;
}

export interface LiveMic {
  state: MicState;
}

export interface LiveMode {
  mode: ExecutionMode;
}

export interface LiveStreamState {
  state: StreamState;
}

export interface LivePayloadMap {
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

export type LivePayload<T extends LiveEventType = LiveEventType> = LivePayloadMap[T];

/** KTD2 envelope. `seq` is a per-session monotonic integer starting at 1. */
export type LiveEnvelope<T extends LiveEventType = LiveEventType> = T extends LiveEventType
  ? {
      schema_version: LiveSchemaVersion;
      session_id: string;
      seq: number;
      t: number;
      type: T;
      payload: LivePayloadMap[T];
    }
  : never;

export type LiveEnvelopeRejection =
  | "not_object"
  | "unsupported_schema_version"
  | "missing_session_id"
  | "missing_seq"
  | "invalid_seq"
  | "invalid_t"
  | "unknown_type"
  | "invalid_payload";

export type LiveEnvelopeInspection =
  | { ok: true; envelope: LiveEnvelope }
  | { ok: false; reason: LiveEnvelopeRejection; detail?: string };

// ---------------------------------------------------------------------------
// Endpoint -> page (SSE, I3) and endpoint -> agent (wake, KTD7 / I4) shapes.
// Owned by U8; typed here so page and harness code share one definition.
// ---------------------------------------------------------------------------

export type LiveServerEventName = "unit_status" | "applied" | "ask" | "ack" | "session_ended" | "agent";

/** What the agent is doing right now, as the endpoint sees it (its wait loop). */
export type LiveAgentState = "listening" | "working" | "away";

export interface LiveUnitStatusEvent {
  event: "unit_status";
  data: { unit_id: string; status: UnitStatus; note?: string; guess?: string };
}

export interface LiveAppliedEvent {
  event: "applied";
  data: { checkpoint_id: string; unit_ids: string[] };
}

export interface LiveAskEvent {
  event: "ask";
  data: { unit_id: string; question: string };
}

export interface LiveAckEvent {
  event: "ack";
  data: { acked_seq: number };
}

export interface LiveSessionEndedEvent {
  event: "session_ended";
  data: { reason?: string };
}

/** Sent on connect and on every change: listening (a wait is parked), working (a batch is out), away. */
export interface LiveAgentEvent {
  event: "agent";
  data: { state: LiveAgentState; since: number; checkpoint_id?: string };
}

export type LiveServerEvent =
  | LiveAgentEvent
  | LiveUnitStatusEvent
  | LiveAppliedEvent
  | LiveAskEvent
  | LiveAckEvent
  | LiveSessionEndedEvent;

export type WakeSessionStatus = "live" | "page_lost";

/** KTD7: the JSON printed by `wait` when a batch is available. */
export interface LiveWakeBatch {
  schema_version: LiveSchemaVersion;
  checkpoint_id: string;
  kind: CheckpointTrigger;
  mode_at_checkpoint: ExecutionMode;
  session_status: WakeSessionStatus;
  units: LiveUnit[];
  annotations: LiveAnnotation[];
  answers: LiveAnswer[];
}

export interface LiveEventsResponse {
  acked_seq: number;
}

export interface LiveSchemaMismatchResponse {
  expected_schema_version: LiveSchemaVersion;
}

export interface LiveMintRequest {
  session_id: string;
}

export interface LiveMintResponse {
  client_secret: string;
  /** Unix epoch seconds. */
  expires_at: number;
  model: string;
}

/** `GET /session`: whether the link's endpoint is up and can take another session. */
export interface LiveSessionProbeResponse {
  status: "live" | "ended";
  session_id: string | null;
  /** The last session ended and nothing is still held, so a new session id opens a fresh board. */
  accepts_new_session: boolean;
}

export type LiveMintError =
  | { status: 401 }
  | { status: 403; reason: "tls_required" }
  | { status: 429; retry_after: number }
  | { status: 502; reason: "openai_error"; upstream_status: number }
  | { status: 503; reason: "no_key" | "brief_contains_secret" };

// ---------------------------------------------------------------------------
// Runtime guard
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return isString(value) && (allowed as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRect(value: unknown): value is ElementBoundingBox {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isAnchor(value: unknown): value is LiveAnchor {
  return (
    isRecord(value) &&
    isString(value.route) &&
    isString(value.selector) &&
    (value.component === undefined || value.component === null || isString(value.component)) &&
    isRect(value.rect) &&
    isFiniteNumber(value.t)
  );
}

function isAnchorArray(value: unknown): value is LiveAnchor[] {
  return Array.isArray(value) && value.every(isAnchor);
}

function isConfirmation(value: unknown): value is LiveUnitConfirmation {
  return isRecord(value) && isBoolean(value.element) && isBoolean(value.change);
}

function isSpan(value: unknown): value is LiveTranscriptSpan {
  return isRecord(value) && isFiniteNumber(value.t_start) && isFiniteNumber(value.t_end);
}

function isTelemetryWindow(value: unknown): value is LiveTelemetryWindow {
  return isRecord(value) && isSpan(value) && Array.isArray(value.events);
}

function isEvidence(value: unknown): value is LiveUnitEvidence {
  if (!isRecord(value)) return false;
  if (!isStringArray(value.frame_ids) || !isStringArray(value.annotation_ids)) return false;
  if (!isSpan(value.transcript_span)) return false;
  if (value.audio_clip_id !== undefined && !isString(value.audio_clip_id)) return false;
  if (value.telemetry_window !== undefined && !isTelemetryWindow(value.telemetry_window)) return false;
  return true;
}

function isPointArray(value: unknown): value is LivePoint[] {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        isRecord(point) &&
        isFiniteNumber(point.x) &&
        isFiniteNumber(point.y) &&
        (point.pressure === undefined || isFiniteNumber(point.pressure))
    )
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isRiffrecEventPayload(type: RiffrecEvent["type"], payload: Record<string, unknown>): boolean {
  if (payload.type !== type || !isFiniteNumber(payload.t)) return false;
  switch (type) {
    case "click":
      return isRecord(payload.element) && isString(payload.element.selector);
    case "network_request":
      return isString(payload.url) && isString(payload.method) && isFiniteNumber(payload.status);
    case "console_error":
      return isString(payload.message);
    case "navigation":
      return isString(payload.from) && isString(payload.to);
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function isPayloadFor(type: LiveEventType, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  switch (type) {
    case "click":
    case "network_request":
    case "console_error":
    case "navigation":
      return isRiffrecEventPayload(type, payload);
    case "transcript":
      return (
        isString(payload.id) &&
        isOneOf(payload.role, ["riffer", "interviewer"]) &&
        isString(payload.text) &&
        isFiniteNumber(payload.t_start) &&
        isFiniteNumber(payload.t_end) &&
        isBoolean(payload.final)
      );
    case "unit":
      return (
        isString(payload.id) &&
        isString(payload.statement) &&
        isString(payload.transcript_excerpt) &&
        isAnchorArray(payload.anchors) &&
        isEvidence(payload.evidence) &&
        isOneOf(payload.status, UNIT_STATUSES) &&
        (payload.confirmed === undefined || isConfirmation(payload.confirmed))
      );
    case "unit_update":
      return (
        isString(payload.unit_id) &&
        optionalString(payload.statement) &&
        (payload.anchors_add === undefined || isAnchorArray(payload.anchors_add)) &&
        (payload.confirmed === undefined || isConfirmation(payload.confirmed))
      );
    case "unit_withdraw":
      return isString(payload.unit_id) && optionalString(payload.reason);
    case "annotation":
      return (
        isString(payload.id) &&
        isOneOf(payload.kind, ["stroke", "pin"]) &&
        isPointArray(payload.points) &&
        isRect(payload.bbox) &&
        isAnchor(payload.anchor) &&
        optionalString(payload.text) &&
        optionalString(payload.unit_id) &&
        optionalString(payload.composite_frame_id)
      );
    case "checkpoint":
      return (
        isString(payload.id) &&
        isOneOf(payload.trigger, CHECKPOINT_TRIGGERS) &&
        isOneOf(payload.mode, EXECUTION_MODES)
      );
    case "answer":
      return isString(payload.unit_id) && isString(payload.text);
    case "frame":
      return (
        isString(payload.id) &&
        isFiniteNumber(payload.t) &&
        isString(payload.route) &&
        isOneOf(payload.kind, ["gesture", "periodic", "composite"]) &&
        isString(payload.jpeg_base64) &&
        (payload.dropped === undefined || isOneOf(payload.dropped, FRAME_DROP_REASONS))
      );
    case "mic":
      return isOneOf(payload.state, ["granted", "denied", "muted", "unmuted"]);
    case "mode":
      return isOneOf(payload.mode, EXECUTION_MODES);
    case "stream_state":
      return isOneOf(payload.state, ["streaming", "buffering", "unloading"]);
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export function isLiveEventType(value: unknown): value is LiveEventType {
  return isOneOf(value, LIVE_EVENT_TYPES);
}

/**
 * Inspects an unknown value as a live envelope and reports why it fails.
 * Endpoints use the reason to pick a status code: `unsupported_schema_version`
 * maps to HTTP 409, every other rejection to HTTP 400.
 */
export function inspectEnvelope(value: unknown): LiveEnvelopeInspection {
  if (!isRecord(value)) return { ok: false, reason: "not_object" };
  if (value.schema_version !== LIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_schema_version",
      detail: isString(value.schema_version) ? value.schema_version : undefined
    };
  }
  if (!isString(value.session_id) || value.session_id.length === 0) {
    return { ok: false, reason: "missing_session_id" };
  }
  if (value.seq === undefined || value.seq === null) return { ok: false, reason: "missing_seq" };
  if (!isFiniteNumber(value.seq) || !Number.isInteger(value.seq) || value.seq < 1) {
    return { ok: false, reason: "invalid_seq" };
  }
  if (!isFiniteNumber(value.t)) return { ok: false, reason: "invalid_t" };
  if (!isLiveEventType(value.type)) {
    return { ok: false, reason: "unknown_type", detail: isString(value.type) ? value.type : undefined };
  }
  if (!isPayloadFor(value.type, value.payload)) {
    return { ok: false, reason: "invalid_payload", detail: value.type };
  }
  return { ok: true, envelope: value as unknown as LiveEnvelope };
}

/** Type guard over `inspectEnvelope`: rejects unknown types, a missing `seq`, or a foreign `schema_version`. */
export function validateEnvelope(value: unknown): value is LiveEnvelope {
  return inspectEnvelope(value).ok;
}

export function isLiveEnvelopeOfType<T extends LiveEventType>(
  envelope: LiveEnvelope,
  type: T
): envelope is LiveEnvelope<T> {
  return envelope.type === type;
}

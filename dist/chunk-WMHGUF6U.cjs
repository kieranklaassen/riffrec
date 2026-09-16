"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/live/tools.ts
var LIVE_TOOL_NAMES = ["record_unit", "update_unit", "withdraw_unit", "relay_answer"];
var anchorsProperty = {
  type: "array",
  description: `Anchor references for the element(s) the change is about: the riffer's own words for the element ("the sidebar toggle", "that red button") or an anchor id the page announced in conversation. Empty only when the riffer named no element at all.`,
  items: { type: "string" }
};
var RECORD_UNIT_TOOL = {
  type: "function",
  name: "record_unit",
  description: "Record one requested change as a unit on the board. Call when the riffer has asked for exactly one concrete change to the app and you can state it in one sentence; call once per change, so a sentence that asks for three things becomes three calls. Never call for questions, thinking aloud, praise, or utterances shorter than three words without a change verb; ask a clarifying question instead when the target element or the intended change is ambiguous.",
  parameters: {
    type: "object",
    properties: {
      statement: {
        type: "string",
        description: "Normalized imperative statement of the change, in the riffer's vocabulary, one sentence, no speculation."
      },
      anchors: anchorsProperty,
      transcript_excerpt: {
        type: "string",
        description: "The riffer's own words that carry this change, verbatim, trimmed to the relevant span."
      }
    },
    required: ["statement", "anchors", "transcript_excerpt"],
    additionalProperties: false
  }
};
var UPDATE_UNIT_TOOL = {
  type: "function",
  name: "update_unit",
  description: "Refine a unit you recorded earlier. Call when the riffer adds detail, corrects wording, or names another element for a change already on the board, or when they answer a clarifying question you asked about it. Never call to change a unit into a different change; withdraw it and record a new one. The call is rejected once the unit has left the initial status; the result tells you so, and you must then record the refinement as a new unit.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id returned by record_unit." },
      statement: { type: "string", description: "Replacement statement, when the wording changes." },
      anchors_add: {
        type: "array",
        description: "Additional anchor references to attach; existing anchors are kept.",
        items: { type: "string" }
      }
    },
    required: ["unit_id"],
    additionalProperties: false
  }
};
var WITHDRAW_UNIT_TOOL = {
  type: "function",
  name: "withdraw_unit",
  description: "Retract a unit the riffer no longer wants. Call when the riffer says never mind, undo, scrap that, or otherwise takes back a change you recorded. Never call because you are unsure the unit was right; ask instead. Never call for units you did not record in this session.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id returned by record_unit." },
      reason: { type: "string", description: "The riffer's reason, in their words, when they gave one." }
    },
    required: ["unit_id"],
    additionalProperties: false
  }
};
var RELAY_ANSWER_TOOL = {
  type: "function",
  name: "relay_answer",
  description: "Relay the riffer's answer to a question the coding agent asked about a unit. Call when you voiced a question that arrived from the endpoint for a specific unit and the riffer has answered it. Never call for answers to your own clarifying questions; use update_unit for those. Never invent or summarize an answer the riffer did not give.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id of the unit the question was attached to." },
      answer_text: { type: "string", description: "The riffer's answer, verbatim or lightly cleaned of filler." }
    },
    required: ["unit_id", "answer_text"],
    additionalProperties: false
  }
};
var LIVE_TOOLS = [
  RECORD_UNIT_TOOL,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  RELAY_ANSWER_TOOL
];
function isLiveToolName(value) {
  return typeof value === "string" && LIVE_TOOL_NAMES.includes(value);
}
function getLiveTool(name) {
  const tool = LIVE_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown live tool: ${name}`);
  return tool;
}

// src/live/contract.ts
var LIVE_SCHEMA_VERSION = "live/1";
var LIVE_SESSION_HEADER = "X-Riffrec-Session";
var LIVE_EVENTS_BODY_MAX_BYTES = 64 * 1024;
var LIVE_FRAME_BODY_MAX_BYTES = 2 * 1024 * 1024;
var LIVE_EVENT_TYPES = [
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
];
var EXECUTION_MODES = ["instant", "smart", "collect"];
var DEFAULT_EXECUTION_MODE = "smart";
var UNIT_STATUSES = [
  "initial",
  "triaging",
  "accepted",
  "needs_info",
  "applied",
  "blocked",
  "withdrawn"
];
var CHECKPOINT_TRIGGERS = [
  "silence",
  "page_change",
  "send",
  "answer",
  "mode_change",
  "final"
];
var ALWAYS_WAKE_TRIGGERS = ["answer", "mode_change", "final"];
var FRAME_DROP_REASONS = ["quota", "oversize"];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
  return typeof value === "string";
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isBoolean(value) {
  return typeof value === "boolean";
}
function isOneOf(value, allowed) {
  return isString(value) && allowed.includes(value);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every(isString);
}
function isRect(value) {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.width) && isFiniteNumber(value.height);
}
function isAnchor(value) {
  return isRecord(value) && isString(value.route) && isString(value.selector) && (value.component === void 0 || value.component === null || isString(value.component)) && isRect(value.rect) && isFiniteNumber(value.t);
}
function isAnchorArray(value) {
  return Array.isArray(value) && value.every(isAnchor);
}
function isConfirmation(value) {
  return isRecord(value) && isBoolean(value.element) && isBoolean(value.change);
}
function isSpan(value) {
  return isRecord(value) && isFiniteNumber(value.t_start) && isFiniteNumber(value.t_end);
}
function isTelemetryWindow(value) {
  return isRecord(value) && isSpan(value) && Array.isArray(value.events);
}
function isEvidence(value) {
  if (!isRecord(value)) return false;
  if (!isStringArray(value.frame_ids) || !isStringArray(value.annotation_ids)) return false;
  if (!isSpan(value.transcript_span)) return false;
  if (value.audio_clip_id !== void 0 && !isString(value.audio_clip_id)) return false;
  if (value.telemetry_window !== void 0 && !isTelemetryWindow(value.telemetry_window)) return false;
  return true;
}
function isPointArray(value) {
  return Array.isArray(value) && value.every(
    (point) => isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y) && (point.pressure === void 0 || isFiniteNumber(point.pressure))
  );
}
function optionalString(value) {
  return value === void 0 || isString(value);
}
function isRiffrecEventPayload(type, payload) {
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
      const exhaustive = type;
      return exhaustive;
    }
  }
}
function isPayloadFor(type, payload) {
  if (!isRecord(payload)) return false;
  switch (type) {
    case "click":
    case "network_request":
    case "console_error":
    case "navigation":
      return isRiffrecEventPayload(type, payload);
    case "transcript":
      return isString(payload.id) && isOneOf(payload.role, ["riffer", "interviewer"]) && isString(payload.text) && isFiniteNumber(payload.t_start) && isFiniteNumber(payload.t_end) && isBoolean(payload.final);
    case "unit":
      return isString(payload.id) && isString(payload.statement) && isString(payload.transcript_excerpt) && isAnchorArray(payload.anchors) && isEvidence(payload.evidence) && isOneOf(payload.status, UNIT_STATUSES) && (payload.confirmed === void 0 || isConfirmation(payload.confirmed));
    case "unit_update":
      return isString(payload.unit_id) && optionalString(payload.statement) && (payload.anchors_add === void 0 || isAnchorArray(payload.anchors_add)) && (payload.confirmed === void 0 || isConfirmation(payload.confirmed));
    case "unit_withdraw":
      return isString(payload.unit_id) && optionalString(payload.reason);
    case "annotation":
      return isString(payload.id) && isOneOf(payload.kind, ["stroke", "pin"]) && isPointArray(payload.points) && isRect(payload.bbox) && isAnchor(payload.anchor) && optionalString(payload.text) && optionalString(payload.unit_id) && optionalString(payload.composite_frame_id);
    case "checkpoint":
      return isString(payload.id) && isOneOf(payload.trigger, CHECKPOINT_TRIGGERS) && isOneOf(payload.mode, EXECUTION_MODES);
    case "answer":
      return isString(payload.unit_id) && isString(payload.text);
    case "frame":
      return isString(payload.id) && isFiniteNumber(payload.t) && isString(payload.route) && isOneOf(payload.kind, ["gesture", "periodic", "composite"]) && isString(payload.jpeg_base64) && (payload.dropped === void 0 || isOneOf(payload.dropped, FRAME_DROP_REASONS));
    case "mic":
      return isOneOf(payload.state, ["granted", "denied", "muted", "unmuted"]);
    case "mode":
      return isOneOf(payload.mode, EXECUTION_MODES);
    case "stream_state":
      return isOneOf(payload.state, ["streaming", "buffering", "unloading"]);
    default: {
      const exhaustive = type;
      return exhaustive;
    }
  }
}
function isLiveEventType(value) {
  return isOneOf(value, LIVE_EVENT_TYPES);
}
function inspectEnvelope(value) {
  if (!isRecord(value)) return { ok: false, reason: "not_object" };
  if (value.schema_version !== LIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_schema_version",
      detail: isString(value.schema_version) ? value.schema_version : void 0
    };
  }
  if (!isString(value.session_id) || value.session_id.length === 0) {
    return { ok: false, reason: "missing_session_id" };
  }
  if (value.seq === void 0 || value.seq === null) return { ok: false, reason: "missing_seq" };
  if (!isFiniteNumber(value.seq) || !Number.isInteger(value.seq) || value.seq < 1) {
    return { ok: false, reason: "invalid_seq" };
  }
  if (!isFiniteNumber(value.t)) return { ok: false, reason: "invalid_t" };
  if (!isLiveEventType(value.type)) {
    return { ok: false, reason: "unknown_type", detail: isString(value.type) ? value.type : void 0 };
  }
  if (!isPayloadFor(value.type, value.payload)) {
    return { ok: false, reason: "invalid_payload", detail: value.type };
  }
  return { ok: true, envelope: value };
}
function validateEnvelope(value) {
  return inspectEnvelope(value).ok;
}
function isLiveEnvelopeOfType(envelope, type) {
  return envelope.type === type;
}

























exports.LIVE_TOOL_NAMES = LIVE_TOOL_NAMES; exports.RECORD_UNIT_TOOL = RECORD_UNIT_TOOL; exports.UPDATE_UNIT_TOOL = UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = WITHDRAW_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = RELAY_ANSWER_TOOL; exports.LIVE_TOOLS = LIVE_TOOLS; exports.isLiveToolName = isLiveToolName; exports.getLiveTool = getLiveTool; exports.LIVE_SCHEMA_VERSION = LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = LIVE_SESSION_HEADER; exports.LIVE_EVENTS_BODY_MAX_BYTES = LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_FRAME_BODY_MAX_BYTES = LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = LIVE_EVENT_TYPES; exports.EXECUTION_MODES = EXECUTION_MODES; exports.DEFAULT_EXECUTION_MODE = DEFAULT_EXECUTION_MODE; exports.UNIT_STATUSES = UNIT_STATUSES; exports.CHECKPOINT_TRIGGERS = CHECKPOINT_TRIGGERS; exports.ALWAYS_WAKE_TRIGGERS = ALWAYS_WAKE_TRIGGERS; exports.FRAME_DROP_REASONS = FRAME_DROP_REASONS; exports.isLiveEventType = isLiveEventType; exports.inspectEnvelope = inspectEnvelope; exports.validateEnvelope = validateEnvelope; exports.isLiveEnvelopeOfType = isLiveEnvelopeOfType;
//# sourceMappingURL=chunk-WMHGUF6U.cjs.map
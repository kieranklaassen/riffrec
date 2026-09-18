// src/live/tools.ts
var LIVE_TOOL_NAMES = ["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"];
var anchorsProperty = {
  type: "array",
  description: `Anchor references for the element(s) the change is about: an anchor id from a [PAGE] note announcing what the riffer clicked, drew on, or pinned ("this"/"here" means the most recent one), or the riffer's own words for the element ("the sidebar toggle", "that red button"). Empty only when the riffer named no element and no anchor was announced.`,
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
var LOOK_AT_SCREEN_TOOL = {
  type: "function",
  name: "look_at_screen",
  description: `See the riffer's screen right now. The page attaches a screenshot of the current view as an image in the conversation, then returns this call's result with the route and how old the frame is. Call when the riffer refers to how something looks ("this", "here", "that color", "it looks off") and the clicked or drawn anchors the page announced do not settle what they mean, when they ask whether you can see their screen, or when they ask you to look. Never call more than once per riffer turn, and never call to browse: only to answer what the riffer just said. If the result says no frame is available, ask the riffer to describe what they see.`,
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why you need to see the screen, in a few words." }
    },
    required: [],
    additionalProperties: false
  }
};
var LIVE_TOOLS = [
  RECORD_UNIT_TOOL,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  LOOK_AT_SCREEN_TOOL
];
function isLiveToolName(value) {
  return typeof value === "string" && LIVE_TOOL_NAMES.includes(value);
}
function getLiveTool(name) {
  const tool = LIVE_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown live tool: ${name}`);
  return tool;
}

// src/live/realtime/persona.ts
var BRIEF_MAX_CHARS = 3e3;
var SCREEN_CONTEXT_MARKER = "[SCREEN CONTEXT]";
var SCREEN_CONTEXT_SECTION = [
  `${SCREEN_CONTEXT_MARKER}`,
  "The page keeps you informed about the screen, and this section is authoritative about it: it supersedes any earlier statement that you cannot see the page or must not claim to.",
  `Every click the riffer makes arrives as a system note tagged [PAGE] that names the element (its component, visible text, selector, and route) and gives it an anchor id. Drawings and pins arrive the same way. The most recent note is what "this", "here", and "that" refer to: put its anchor id in record_unit's anchors, and never ask which element they mean when a note arrived within the last few seconds.`,
  "You can also see the screen. Call look_at_screen when the riffer refers to how something looks, asks whether you can see their screen, or asks you to look; the page attaches a screenshot of the current view and you may then describe or refer to what is in it. The riffrec panel docked at the top right is not part of the app. Never say you cannot see the screen: if no frame is available the tool result says so, and you ask the riffer to describe what they see instead."
].join("\n");
var DEFAULT_INTERVIEWER_INSTRUCTIONS = [
  "You are the riffrec interviewer: a calm, terse product partner listening to a designer or developer (the riffer) talk through changes they want while they click and draw on their own running app. The page tells you what they click, draw on, and pin, and shows you the screen when you ask for it; the last section says how.",
  "Your job is to turn what the riffer says into units of change on a shared board, one unit per requested change, using the record_unit tool. A sentence that asks for three things becomes three record_unit calls. Never call record_unit for questions, thinking aloud, praise, or utterances shorter than three words without a change verb.",
  "Ask immediately, in one short sentence, when the target element or the intended value is ambiguous: which element, which side, what color, how much. Otherwise stay quiet and let the riffer keep talking. Do not narrate, summarize, or confirm each unit aloud; the board already shows it.",
  "Never invent anchors. Use only the anchor ids the page announced or the element references the riffer named. When the riffer names no element and no anchor was announced, record the unit with an empty anchors list.",
  "When the riffer takes back a change, call withdraw_unit and acknowledge it aloud in a few words. When they refine a change already on the board, call update_unit; if it is rejected because the unit was already picked up, record the refinement as a new unit.",
  "When a note marked [ENDPOINT QUESTION] arrives, read the question to the riffer in your own words at the next pause and, once they answer, call relay_answer with their answer for that unit. Never answer such a question yourself.",
  "Keep every spoken turn under two sentences. Speak the riffer's language.",
  SCREEN_CONTEXT_SECTION
].join("\n\n");
function hasScreenContext(instructions) {
  return typeof instructions === "string" && instructions.includes(SCREEN_CONTEXT_MARKER);
}
function withScreenContext(instructions) {
  if (hasScreenContext(instructions)) return instructions;
  const trimmed = instructions.trimEnd();
  return trimmed.length > 0 ? `${trimmed}

${SCREEN_CONTEXT_SECTION}` : SCREEN_CONTEXT_SECTION;
}
function buildInterviewerInstructions(options = {}) {
  const brief = options.brief?.trim();
  if (!brief) return DEFAULT_INTERVIEWER_INSTRUCTIONS;
  const bounded = brief.length > BRIEF_MAX_CHARS ? `${brief.slice(0, BRIEF_MAX_CHARS - 1)}\u2026` : brief;
  return `${DEFAULT_INTERVIEWER_INSTRUCTIONS}

[SESSION BRIEF]
${bounded}`;
}

// src/live/contract.ts
var LIVE_SCHEMA_VERSION = "live/1";
var LIVE_SESSION_HEADER = "X-Riffrec-Session";
var LIVE_OPENAI_KEY_HEADER = "X-Riffrec-OpenAI-Key";
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

export {
  LIVE_TOOL_NAMES,
  RECORD_UNIT_TOOL,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  LOOK_AT_SCREEN_TOOL,
  LIVE_TOOLS,
  isLiveToolName,
  getLiveTool,
  BRIEF_MAX_CHARS,
  SCREEN_CONTEXT_MARKER,
  SCREEN_CONTEXT_SECTION,
  DEFAULT_INTERVIEWER_INSTRUCTIONS,
  hasScreenContext,
  withScreenContext,
  buildInterviewerInstructions,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_OPENAI_KEY_HEADER,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  EXECUTION_MODES,
  DEFAULT_EXECUTION_MODE,
  UNIT_STATUSES,
  CHECKPOINT_TRIGGERS,
  ALWAYS_WAKE_TRIGGERS,
  FRAME_DROP_REASONS,
  isLiveEventType,
  inspectEnvelope,
  validateEnvelope,
  isLiveEnvelopeOfType
};
//# sourceMappingURL=chunk-7PY2EIKK.js.map
"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }require('./chunk-7QKH5JWE.cjs');
































var _chunk4XWUXLDEcjs = require('./chunk-4XWUXLDE.cjs');

// src/noop.tsx
function RiffrecProvider({ children }) {
  return _nullishCoalesce(children, () => ( null));
}
var noopStop = async () => null;
function useRiffrec() {
  return {
    start: async () => {
    },
    stop: noopStop,
    status: "disabled",
    isEnabled: false,
    live: {
      status: "disabled",
      mode: "smart",
      setMode: () => {
      },
      muted: false,
      setMuted: () => {
      },
      send: async () => false,
      stop: noopStop
    }
  };
}
function RiffrecRecorder() {
  return null;
}
function downloadSessionArchive(_filename, _archive) {
  throw new Error("Browser download APIs are not available.");
}




































exports.ALWAYS_WAKE_TRIGGERS = _chunk4XWUXLDEcjs.ALWAYS_WAKE_TRIGGERS; exports.BRIEF_MAX_CHARS = _chunk4XWUXLDEcjs.BRIEF_MAX_CHARS; exports.CHECKPOINT_TRIGGERS = _chunk4XWUXLDEcjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_EXECUTION_MODE = _chunk4XWUXLDEcjs.DEFAULT_EXECUTION_MODE; exports.DEFAULT_INTERVIEWER_INSTRUCTIONS = _chunk4XWUXLDEcjs.DEFAULT_INTERVIEWER_INSTRUCTIONS; exports.EXECUTION_MODES = _chunk4XWUXLDEcjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunk4XWUXLDEcjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunk4XWUXLDEcjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunk4XWUXLDEcjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunk4XWUXLDEcjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunk4XWUXLDEcjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunk4XWUXLDEcjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunk4XWUXLDEcjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunk4XWUXLDEcjs.LIVE_TOOL_NAMES; exports.LOOK_AT_SCREEN_TOOL = _chunk4XWUXLDEcjs.LOOK_AT_SCREEN_TOOL; exports.RECORD_UNIT_TOOL = _chunk4XWUXLDEcjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunk4XWUXLDEcjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.SCREEN_CONTEXT_MARKER = _chunk4XWUXLDEcjs.SCREEN_CONTEXT_MARKER; exports.SCREEN_CONTEXT_SECTION = _chunk4XWUXLDEcjs.SCREEN_CONTEXT_SECTION; exports.UNIT_STATUSES = _chunk4XWUXLDEcjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunk4XWUXLDEcjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunk4XWUXLDEcjs.WITHDRAW_UNIT_TOOL; exports.buildInterviewerInstructions = _chunk4XWUXLDEcjs.buildInterviewerInstructions; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunk4XWUXLDEcjs.getLiveTool; exports.hasScreenContext = _chunk4XWUXLDEcjs.hasScreenContext; exports.inspectEnvelope = _chunk4XWUXLDEcjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunk4XWUXLDEcjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunk4XWUXLDEcjs.isLiveEventType; exports.isLiveToolName = _chunk4XWUXLDEcjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunk4XWUXLDEcjs.validateEnvelope; exports.withScreenContext = _chunk4XWUXLDEcjs.withScreenContext;
//# sourceMappingURL=index.node.cjs.map
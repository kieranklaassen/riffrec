"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }require('./chunk-7QKH5JWE.cjs');
































var _chunkMTPO77EAcjs = require('./chunk-MTPO77EA.cjs');

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




































exports.ALWAYS_WAKE_TRIGGERS = _chunkMTPO77EAcjs.ALWAYS_WAKE_TRIGGERS; exports.BRIEF_MAX_CHARS = _chunkMTPO77EAcjs.BRIEF_MAX_CHARS; exports.CHECKPOINT_TRIGGERS = _chunkMTPO77EAcjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_EXECUTION_MODE = _chunkMTPO77EAcjs.DEFAULT_EXECUTION_MODE; exports.DEFAULT_INTERVIEWER_INSTRUCTIONS = _chunkMTPO77EAcjs.DEFAULT_INTERVIEWER_INSTRUCTIONS; exports.EXECUTION_MODES = _chunkMTPO77EAcjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunkMTPO77EAcjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunkMTPO77EAcjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunkMTPO77EAcjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunkMTPO77EAcjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunkMTPO77EAcjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunkMTPO77EAcjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunkMTPO77EAcjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunkMTPO77EAcjs.LIVE_TOOL_NAMES; exports.LOOK_AT_SCREEN_TOOL = _chunkMTPO77EAcjs.LOOK_AT_SCREEN_TOOL; exports.RECORD_UNIT_TOOL = _chunkMTPO77EAcjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunkMTPO77EAcjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.SCREEN_CONTEXT_MARKER = _chunkMTPO77EAcjs.SCREEN_CONTEXT_MARKER; exports.SCREEN_CONTEXT_SECTION = _chunkMTPO77EAcjs.SCREEN_CONTEXT_SECTION; exports.UNIT_STATUSES = _chunkMTPO77EAcjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunkMTPO77EAcjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunkMTPO77EAcjs.WITHDRAW_UNIT_TOOL; exports.buildInterviewerInstructions = _chunkMTPO77EAcjs.buildInterviewerInstructions; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunkMTPO77EAcjs.getLiveTool; exports.hasScreenContext = _chunkMTPO77EAcjs.hasScreenContext; exports.inspectEnvelope = _chunkMTPO77EAcjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunkMTPO77EAcjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunkMTPO77EAcjs.isLiveEventType; exports.isLiveToolName = _chunkMTPO77EAcjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunkMTPO77EAcjs.validateEnvelope; exports.withScreenContext = _chunkMTPO77EAcjs.withScreenContext;
//# sourceMappingURL=index.node.cjs.map
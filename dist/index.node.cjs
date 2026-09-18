"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }require('./chunk-7QKH5JWE.cjs');
































var _chunkP3B23XWXcjs = require('./chunk-P3B23XWX.cjs');

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




































exports.ALWAYS_WAKE_TRIGGERS = _chunkP3B23XWXcjs.ALWAYS_WAKE_TRIGGERS; exports.BRIEF_MAX_CHARS = _chunkP3B23XWXcjs.BRIEF_MAX_CHARS; exports.CHECKPOINT_TRIGGERS = _chunkP3B23XWXcjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_EXECUTION_MODE = _chunkP3B23XWXcjs.DEFAULT_EXECUTION_MODE; exports.DEFAULT_INTERVIEWER_INSTRUCTIONS = _chunkP3B23XWXcjs.DEFAULT_INTERVIEWER_INSTRUCTIONS; exports.EXECUTION_MODES = _chunkP3B23XWXcjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunkP3B23XWXcjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunkP3B23XWXcjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunkP3B23XWXcjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunkP3B23XWXcjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunkP3B23XWXcjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunkP3B23XWXcjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunkP3B23XWXcjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunkP3B23XWXcjs.LIVE_TOOL_NAMES; exports.LOOK_AT_SCREEN_TOOL = _chunkP3B23XWXcjs.LOOK_AT_SCREEN_TOOL; exports.RECORD_UNIT_TOOL = _chunkP3B23XWXcjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunkP3B23XWXcjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.SCREEN_CONTEXT_MARKER = _chunkP3B23XWXcjs.SCREEN_CONTEXT_MARKER; exports.SCREEN_CONTEXT_SECTION = _chunkP3B23XWXcjs.SCREEN_CONTEXT_SECTION; exports.UNIT_STATUSES = _chunkP3B23XWXcjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunkP3B23XWXcjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunkP3B23XWXcjs.WITHDRAW_UNIT_TOOL; exports.buildInterviewerInstructions = _chunkP3B23XWXcjs.buildInterviewerInstructions; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunkP3B23XWXcjs.getLiveTool; exports.hasScreenContext = _chunkP3B23XWXcjs.hasScreenContext; exports.inspectEnvelope = _chunkP3B23XWXcjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunkP3B23XWXcjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunkP3B23XWXcjs.isLiveEventType; exports.isLiveToolName = _chunkP3B23XWXcjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunkP3B23XWXcjs.validateEnvelope; exports.withScreenContext = _chunkP3B23XWXcjs.withScreenContext;
//# sourceMappingURL=index.node.cjs.map
"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }require('./chunk-G4R6R3NJ.cjs');
























var _chunkWMHGUF6Ucjs = require('./chunk-WMHGUF6U.cjs');

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




























exports.ALWAYS_WAKE_TRIGGERS = _chunkWMHGUF6Ucjs.ALWAYS_WAKE_TRIGGERS; exports.CHECKPOINT_TRIGGERS = _chunkWMHGUF6Ucjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_EXECUTION_MODE = _chunkWMHGUF6Ucjs.DEFAULT_EXECUTION_MODE; exports.EXECUTION_MODES = _chunkWMHGUF6Ucjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunkWMHGUF6Ucjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunkWMHGUF6Ucjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunkWMHGUF6Ucjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunkWMHGUF6Ucjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunkWMHGUF6Ucjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunkWMHGUF6Ucjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunkWMHGUF6Ucjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunkWMHGUF6Ucjs.LIVE_TOOL_NAMES; exports.RECORD_UNIT_TOOL = _chunkWMHGUF6Ucjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunkWMHGUF6Ucjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.UNIT_STATUSES = _chunkWMHGUF6Ucjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunkWMHGUF6Ucjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunkWMHGUF6Ucjs.WITHDRAW_UNIT_TOOL; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunkWMHGUF6Ucjs.getLiveTool; exports.inspectEnvelope = _chunkWMHGUF6Ucjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunkWMHGUF6Ucjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunkWMHGUF6Ucjs.isLiveEventType; exports.isLiveToolName = _chunkWMHGUF6Ucjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunkWMHGUF6Ucjs.validateEnvelope;
//# sourceMappingURL=index.node.cjs.map
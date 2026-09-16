"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }require('./chunk-G4R6R3NJ.cjs');























var _chunkN4M47HUUcjs = require('./chunk-N4M47HUU.cjs');

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



























exports.CHECKPOINT_TRIGGERS = _chunkN4M47HUUcjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_EXECUTION_MODE = _chunkN4M47HUUcjs.DEFAULT_EXECUTION_MODE; exports.EXECUTION_MODES = _chunkN4M47HUUcjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunkN4M47HUUcjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunkN4M47HUUcjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunkN4M47HUUcjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunkN4M47HUUcjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunkN4M47HUUcjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunkN4M47HUUcjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunkN4M47HUUcjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunkN4M47HUUcjs.LIVE_TOOL_NAMES; exports.RECORD_UNIT_TOOL = _chunkN4M47HUUcjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunkN4M47HUUcjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.UNIT_STATUSES = _chunkN4M47HUUcjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunkN4M47HUUcjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunkN4M47HUUcjs.WITHDRAW_UNIT_TOOL; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunkN4M47HUUcjs.getLiveTool; exports.inspectEnvelope = _chunkN4M47HUUcjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunkN4M47HUUcjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunkN4M47HUUcjs.isLiveEventType; exports.isLiveToolName = _chunkN4M47HUUcjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunkN4M47HUUcjs.validateEnvelope;
//# sourceMappingURL=index.node.cjs.map
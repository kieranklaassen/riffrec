import "./chunk-2GWEBU4Q.js";
import {
  ALWAYS_WAKE_TRIGGERS,
  CHECKPOINT_TRIGGERS,
  DEFAULT_EXECUTION_MODE,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  getLiveTool,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  validateEnvelope
} from "./chunk-FUTET4MR.js";

// src/noop.tsx
function RiffrecProvider({ children }) {
  return children ?? null;
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
export {
  ALWAYS_WAKE_TRIGGERS,
  CHECKPOINT_TRIGGERS,
  DEFAULT_EXECUTION_MODE,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  RiffrecProvider,
  RiffrecRecorder,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  downloadSessionArchive,
  getLiveTool,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  useRiffrec,
  validateEnvelope
};
//# sourceMappingURL=index.node.js.map
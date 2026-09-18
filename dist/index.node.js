import "./chunk-ON7GEFY4.js";
import {
  ALWAYS_WAKE_TRIGGERS,
  BRIEF_MAX_CHARS,
  CHECKPOINT_TRIGGERS,
  DEFAULT_EXECUTION_MODE,
  DEFAULT_INTERVIEWER_INSTRUCTIONS,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  LOOK_AT_SCREEN_TOOL,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  SCREEN_CONTEXT_MARKER,
  SCREEN_CONTEXT_SECTION,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  buildInterviewerInstructions,
  getLiveTool,
  hasScreenContext,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  validateEnvelope,
  withScreenContext
} from "./chunk-7PY2EIKK.js";

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
  BRIEF_MAX_CHARS,
  CHECKPOINT_TRIGGERS,
  DEFAULT_EXECUTION_MODE,
  DEFAULT_INTERVIEWER_INSTRUCTIONS,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  LOOK_AT_SCREEN_TOOL,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  RiffrecProvider,
  RiffrecRecorder,
  SCREEN_CONTEXT_MARKER,
  SCREEN_CONTEXT_SECTION,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  buildInterviewerInstructions,
  downloadSessionArchive,
  getLiveTool,
  hasScreenContext,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  useRiffrec,
  validateEnvelope,
  withScreenContext
};
//# sourceMappingURL=index.node.js.map
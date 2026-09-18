import type { CSSProperties } from "react";
import type { MicState } from "../contract";
import type { VoiceUnavailableReason } from "../realtime/interviewer";
import type { LiveSessionError, LiveSessionStatus } from "../session";

/**
 * Every state the riffer can see on the live indicator (R23). Session status
 * comes from `LiveSession.status`; `muted` and `paused` layer on top of a
 * running session because the stream keeps flowing while the microphone is
 * off or capture is paused.
 */
export type IndicatorState =
  | "idle"
  | "consenting"
  | "connecting"
  | "reconnecting"
  | "streaming"
  | "novoice"
  | "buffering"
  | "muted"
  | "paused"
  | "incompatible"
  | "ended"
  | "error";

export interface IndicatorInput {
  status: LiveSessionStatus;
  muted: boolean;
  mic?: MicState | null;
  paused?: boolean;
  /** Expected `schema_version` reported by an incompatible endpoint. */
  expectedSchemaVersion?: string | null;
  endpoint?: string | null;
  error?: LiveSessionError | null;
  /** Why the interviewer is not running, for the `novoice` label. */
  voiceUnavailable?: VoiceUnavailableReason | null;
}

export interface IndicatorView {
  state: IndicatorState;
  label: string;
  /** Short form for the collapsed pill. */
  short: string;
  color: string;
  pulse: boolean;
  /** Longer explanation, shown as the tooltip. */
  detail?: string;
}

export interface LiveIndicatorProps extends IndicatorInput {
  /** Collapsed pill form: dot and short label only. */
  compact?: boolean;
}

function hostOf(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** Plain-language cause of a voice-less session, or `null` when riffrec cannot tell. */
export function voiceUnavailableCause(reason: VoiceUnavailableReason | null | undefined): string | null {
  if (!reason) return null;
  switch (reason.kind) {
    case "no_endpoint":
      return "no endpoint configured";
    case "connect_failed":
      return "couldn't connect to OpenAI Realtime";
    case "exhausted":
      return reason.reason === "throttled" ? "the endpoint is throttling voice requests" : "couldn't reach the endpoint";
    case "refused":
      switch (reason.reason) {
        case "openai_error":
          if (reason.upstreamStatus === 401) return "OpenAI rejected the API key";
          if (reason.upstreamStatus === 429) return "OpenAI rate limit or quota reached";
          if (reason.upstreamStatus === undefined) return "couldn't reach OpenAI";
          return `OpenAI returned an error (${reason.upstreamStatus})`;
        case "no_key":
          return "the endpoint has no OpenAI key";
        case "brief_contains_secret":
          return "the session brief looked like it held a secret";
        case "unauthorized":
          return "the endpoint rejected this page's token";
        case "tls_required":
          return "the endpoint requires HTTPS";
        default:
          return "the endpoint refused to start voice";
      }
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** Derives the indicator state; the order is the priority when several apply. */
export function deriveIndicatorState(input: IndicatorInput): IndicatorState {
  const base = baseIndicatorState(input.status);
  const flowing = base === "connecting" || base === "reconnecting" || base === "streaming" || base === "novoice";
  if ((flowing || base === "buffering") && input.paused) return "paused";
  if (flowing && (input.muted || input.mic === "denied")) return "muted";
  return base;
}

function baseIndicatorState(status: LiveSessionStatus): IndicatorState {
  switch (status) {
    case "idle":
      return "idle";
    case "consenting":
      return "consenting";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "live":
      return "streaming";
    case "live_novoice":
      return "novoice";
    case "buffering":
      return "buffering";
    case "incompatible":
      return "incompatible";
    case "ended":
      return "ended";
    case "error":
      return "error";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function describeIndicator(input: IndicatorInput): IndicatorView {
  const state = deriveIndicatorState(input);
  const host = hostOf(input.endpoint);
  switch (state) {
    case "idle":
      return { state, label: "Not live", short: "Off", color: "#98a2b3", pulse: false };
    case "consenting":
      return { state, label: "Waiting for consent", short: "Consent", color: "#98a2b3", pulse: false };
    case "connecting":
      return { state, label: "Connecting to the interviewer…", short: "Connecting", color: "#f79009", pulse: true };
    case "reconnecting":
      return { state, label: "Reconnecting to the interviewer…", short: "Reconnecting", color: "#f79009", pulse: true };
    case "streaming":
      return {
        state,
        label: host ? `Live · streaming to ${host}` : "Live · streaming",
        short: "Live",
        color: "#12b76a",
        pulse: true
      };
    case "novoice": {
      const cause = voiceUnavailableCause(input.voiceUnavailable);
      const where = host ? `Clicks, drawings, and the board still stream to ${host}.` : "Clicks, drawings, and the board are saved locally.";
      return {
        state,
        label: cause ? `Voice off · ${cause}` : host ? `Voice off · streaming to ${host}` : "Voice off · saving locally",
        short: "Voice off",
        color: "#f79009",
        pulse: false,
        detail: `The voice interviewer is not running${cause ? `: ${cause}` : ""}. ${where}`
      };
    }
    case "buffering":
      return {
        state,
        label: "Buffering locally · endpoint unreachable",
        short: "Buffering",
        color: "#f79009",
        pulse: true
      };
    case "muted":
      return { state, label: "Microphone muted · still streaming", short: "Muted", color: "#667085", pulse: false };
    case "paused":
      return { state, label: "Capture paused · frames and stream held", short: "Paused", color: "#667085", pulse: false };
    case "incompatible":
      return {
        state,
        label: input.expectedSchemaVersion
          ? `Incompatible endpoint · expects ${input.expectedSchemaVersion}`
          : "Incompatible endpoint",
        short: "Incompatible",
        color: "#d92d20",
        pulse: false
      };
    case "ended":
      return { state, label: "Session ended", short: "Ended", color: "#98a2b3", pulse: false };
    case "error":
      return {
        state,
        label: input.error ? `Error · ${input.error.message}` : "Error",
        short: "Error",
        color: "#d92d20",
        pulse: false
      };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

const rootStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 500,
  color: "#344054",
  minWidth: 0
};

const dotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  flex: "none"
};

/** Dot and label for the session state; only a flowing live stream gets the halo. */
export function LiveIndicator({ compact = false, ...input }: LiveIndicatorProps) {
  const view = describeIndicator(input);
  return (
    <span data-riffrec-live-indicator={view.state} aria-live="polite" title={view.detail ?? view.label} style={rootStyle}>
      <span
        aria-hidden="true"
        style={{ ...dotStyle, background: view.color, boxShadow: view.state === "streaming" ? `0 0 0 3px ${view.color}26` : undefined }}
      />
      <span data-riffrec-live-indicator-label="" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {compact ? view.short : view.label}
      </span>
    </span>
  );
}

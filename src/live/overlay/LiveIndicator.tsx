import type { CSSProperties } from "react";
import type { MicState } from "../contract";
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
}

export interface IndicatorView {
  state: IndicatorState;
  label: string;
  /** Short form for the collapsed pill. */
  short: string;
  color: string;
  pulse: boolean;
}

export interface LiveIndicatorProps extends IndicatorInput {
  onToggleMute?: () => void;
  onTogglePause?: () => void;
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

function isRunning(status: LiveSessionStatus): boolean {
  switch (status) {
    case "connecting":
    case "live":
    case "live_novoice":
    case "buffering":
    case "reconnecting":
    case "incompatible":
      return true;
    case "idle":
    case "consenting":
    case "ended":
    case "error":
      return false;
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
    case "novoice":
      return {
        state,
        label: host ? `Live · no voice · streaming to ${host}` : "Live · no voice · saving locally",
        short: "Live · no voice",
        color: "#12b76a",
        pulse: true
      };
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
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#101828",
  minWidth: 0
};

const dotStyle: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "50%",
  flex: "none"
};

const iconButtonStyle: CSSProperties = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "3px 8px",
  cursor: "pointer"
};

const iconButtonPressedStyle: CSSProperties = {
  ...iconButtonStyle,
  background: "#344054",
  borderColor: "#344054",
  color: "#ffffff"
};

export function LiveIndicator({ onToggleMute, onTogglePause, compact = false, ...input }: LiveIndicatorProps) {
  const view = describeIndicator(input);
  const running = isRunning(input.status);
  const micDenied = input.mic === "denied";
  const showControls = !compact && running && (onToggleMute || onTogglePause);

  return (
    <span data-riffrec-live-indicator={view.state} aria-live="polite" style={rootStyle}>
      <span aria-hidden="true" style={{ ...dotStyle, background: view.color, boxShadow: view.pulse ? `0 0 0 3px ${view.color}33` : undefined }} />
      <span data-riffrec-live-indicator-label="" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {compact ? view.short : view.label}
      </span>
      {showControls ? (
        <span style={{ display: "inline-flex", gap: 6, marginLeft: 4 }}>
          {onToggleMute ? (
            <button
              type="button"
              data-riffrec-live-mute=""
              aria-pressed={input.muted}
              aria-label={input.muted ? "Unmute microphone" : "Mute microphone"}
              disabled={micDenied}
              title={micDenied ? "Microphone was denied" : undefined}
              style={input.muted ? iconButtonPressedStyle : iconButtonStyle}
              onClick={onToggleMute}
            >
              {input.muted ? "Unmute" : "Mute"}
            </button>
          ) : null}
          {onTogglePause ? (
            <button
              type="button"
              data-riffrec-live-pause=""
              aria-pressed={input.paused ?? false}
              aria-label={input.paused ? "Resume frame and stream capture" : "Pause frame and stream capture"}
              style={input.paused ? iconButtonPressedStyle : iconButtonStyle}
              onClick={onTogglePause}
            >
              {input.paused ? "Resume" : "Pause"}
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

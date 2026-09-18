import type { CSSProperties } from "react";

/** What the endpoint behind the remembered link said it can do (`GET /session`). */
export type NextSessionState = "ready" | "draining";

export interface NextSession {
  state: NextSessionState;
  /** Endpoint origin from the remembered link. */
  endpoint: string;
}

export interface NextSessionLauncherProps {
  next: NextSession;
  onStart: () => void;
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 6px 6px 12px",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #eaecf0",
  borderRadius: 999,
  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.06)",
  fontFamily: FONT,
  fontSize: 13
};

const dotStyle = (color: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: 999,
  background: color,
  flex: "none"
});

export const startButtonStyle: CSSProperties = {
  border: "1px solid #101828",
  borderRadius: 999,
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  fontSize: 12,
  fontWeight: 500,
  padding: "5px 12px",
  cursor: "pointer",
  whiteSpace: "nowrap"
};

export const startButtonDisabledStyle: CSSProperties = {
  ...startButtonStyle,
  borderColor: "#e4e7ec",
  background: "#f2f4f7",
  color: "#667085",
  cursor: "default"
};

export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/**
 * Shown while no session runs but the link this browser last opened still
 * reaches its endpoint: after a Done, a dismissed ended card, or a reload once
 * the fragment is gone. Hidden entirely when there is no remembered link or the
 * endpoint is gone, so a plain visit never sees it.
 */
export function NextSessionLauncher({ next, onStart }: NextSessionLauncherProps) {
  const ready = next.state === "ready";
  return (
    <div role="status" aria-live="polite" data-riffrec-next-session={next.state} style={pillStyle}>
      <span aria-hidden="true" style={dotStyle(ready ? "#12b76a" : "#f79009")} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontWeight: 500 }}>{ready ? "Endpoint ready" : "Agent is wrapping up"}</span>
        <span style={{ fontSize: 11, color: "#667085" }}>{endpointHost(next.endpoint)}</span>
      </span>
      <button
        type="button"
        data-riffrec-next-session-start=""
        disabled={!ready}
        style={ready ? startButtonStyle : startButtonDisabledStyle}
        onClick={onStart}
      >
        Start live session
      </button>
    </div>
  );
}

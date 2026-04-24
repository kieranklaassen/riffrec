import { useContext, useState, type CSSProperties, type ReactNode } from "react";
import { RiffrecContext } from "./RiffrecProvider";
import type { SessionResult } from "./types";

export interface RiffrecRecorderProps {
  className?: string;
  startLabel?: string;
  stopLabel?: string;
  disabledLabel?: string;
  consentTitle?: string;
  consentDescription?: ReactNode;
  consentLabel?: string;
  onSessionComplete?: (result: SessionResult | null) => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(12, 18, 28, 0.56)",
  padding: 16
};

const dialogStyle: CSSProperties = {
  width: "min(520px, 100%)",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 24px 80px rgba(16, 24, 40, 0.28)",
  padding: 24,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const buttonStyle: CSSProperties = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "9px 14px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#b42318",
  borderColor: "#b42318"
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  cursor: "not-allowed",
  opacity: 0.56
};

const indicatorStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginLeft: 10,
  color: "#b42318",
  fontSize: 14,
  fontWeight: 600
};

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#f04438"
};

const defaultConsentDescription = (
  <>
    <p style={{ margin: "0 0 12px" }}>
      Riffrec will ask your browser for screen and microphone access, then save a local session
      with:
    </p>
    <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
      <li>screen video and microphone audio</li>
      <li>clicks, navigation, network URLs and statuses</li>
      <li>console errors and stack traces</li>
    </ul>
    <p style={{ margin: 0 }}>
      Password and hidden input text is omitted from DOM events, but anything visible on screen
      can appear in the video, and anything spoken near the microphone can appear in the audio.
    </p>
  </>
);

function useRiffrecContext() {
  const context = useContext(RiffrecContext);
  if (!context) {
    throw new Error("RiffrecRecorder must be used within RiffrecProvider");
  }
  return context;
}

export function RiffrecRecorder({
  className,
  startLabel = "Record feedback",
  stopLabel = "Stop recording",
  disabledLabel = "Recording unavailable",
  consentTitle = "Start recording?",
  consentDescription = defaultConsentDescription,
  consentLabel = "I understand and consent to this recording",
  onSessionComplete
}: RiffrecRecorderProps): React.ReactElement {
  const { start, stop, status, isEnabled } = useRiffrecContext();
  const [isConsentOpen, setConsentOpen] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isBusy, setBusy] = useState(false);

  const handleStop = async () => {
    setBusy(true);
    try {
      const result = await stop();
      onSessionComplete?.(result);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await start();
      setConsentOpen(false);
      setHasConsented(false);
    } catch {
      // Provider-level onError receives the concrete error. Keep the consent dialog open.
    } finally {
      setBusy(false);
    }
  };

  const isRecording = status === "recording" || status === "stopping";

  return (
    <span className={className}>
      <button
        type="button"
        disabled={!isEnabled || isBusy}
        style={!isEnabled || isBusy ? disabledButtonStyle : isRecording ? dangerButtonStyle : buttonStyle}
        onClick={isRecording ? handleStop : () => setConsentOpen(true)}
      >
        {isRecording ? stopLabel : isEnabled ? startLabel : disabledLabel}
      </button>
      {isRecording ? (
        <span aria-live="polite" style={indicatorStyle}>
          <span aria-hidden="true" style={dotStyle} />
          Recording
        </span>
      ) : null}
      {isConsentOpen ? (
        <div style={overlayStyle}>
          <div role="dialog" aria-modal="true" aria-label={consentTitle} style={dialogStyle}>
            <h2 style={{ margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }}>{consentTitle}</h2>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{consentDescription}</div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }}>
              <input
                type="checkbox"
                checked={hasConsented}
                onChange={(event) => setHasConsented(event.currentTarget.checked)}
              />
              <span>{consentLabel}</span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setConsentOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasConsented || isBusy}
                style={!hasConsented || isBusy ? disabledButtonStyle : buttonStyle}
                onClick={handleStart}
              >
                Start recording
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}

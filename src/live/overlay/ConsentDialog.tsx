import { useRef, useState, type CSSProperties } from "react";
import { buildConsentCopy, type ConsentCopyInput } from "./consentCopy";

export type ConsentMicOutcome = "granted" | "denied";

export interface ConsentResult {
  /** The single microphone stream every consumer clones from (KTD21); null when denied. */
  stream: MediaStream | null;
  mic: ConsentMicOutcome;
}

export interface ConsentDialogProps extends ConsentCopyInput {
  onAccept: (result: ConsentResult) => void;
  onDecline: () => void;
  /** Injectable for tests; defaults to `navigator.mediaDevices.getUserMedia`. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  zIndex?: number;
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(12, 18, 28, 0.56)",
  padding: 16
};

const dialogStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 24px 80px rgba(16, 24, 40, 0.28)",
  padding: 24,
  fontFamily: FONT,
  fontSize: 14,
  lineHeight: 1.5
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

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  cursor: "not-allowed",
  opacity: 0.56
};

const noticeStyle: CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 6,
  background: "#fffaeb",
  border: "1px solid #fedf89",
  color: "#7a2e0e"
};

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("Microphone access is not available in this browser."));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** `DOMException` is not an `Error` in every realm, so read `message` structurally. */
function errorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = (error as { message: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

type Stage = "reading" | "requesting" | "denied";

/**
 * Consent for a live session (R22, R26): names what streams where, derived from
 * the evidence profile and the endpoint, then acquires the one microphone stream
 * the session shares (KTD21). A denied microphone is reported as such and the
 * riffer may continue with drawing and the board only.
 */
export function ConsentDialog({
  onAccept,
  onDecline,
  getUserMedia = defaultGetUserMedia,
  zIndex = 2147483647,
  ...copyInput
}: ConsentDialogProps) {
  const copy = buildConsentCopy(copyInput);
  const [checked, setChecked] = useState(false);
  const [stage, setStage] = useState<Stage>("reading");
  const [denialReason, setDenialReason] = useState<string | null>(null);

  // A ref, not state: a second Accept click before React re-renders must not acquire a second stream (KTD21).
  const requestInFlight = useRef(false);
  const accept = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setStage("requesting");
    try {
      const stream = await getUserMedia({ audio: true });
      onAccept({ stream, mic: "granted" });
    } catch (error) {
      setDenialReason(errorMessage(error) ?? "Microphone access was denied.");
      setStage("denied");
    } finally {
      requestInFlight.current = false;
    }
  };

  const busy = stage === "requesting";

  return (
    <div data-riffrec-consent="" style={{ ...backdropStyle, zIndex }}>
      <div role="dialog" aria-modal="true" aria-label={copy.title} style={dialogStyle}>
        <h2 style={{ margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }}>{copy.title}</h2>
        <p style={{ margin: "0 0 12px" }}>{copy.intro}</p>
        {copy.destinations.map((destination) => (
          <div key={destination.id} data-riffrec-consent-destination={destination.id} style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>To {destination.to}:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {destination.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {copy.retention ? (
          <p data-riffrec-consent-retention="" style={{ margin: "0 0 12px" }}>
            {copy.retention}
          </p>
        ) : null}
        <p style={{ margin: "0 0 12px" }}>{copy.noExclusions}</p>
        <p style={{ margin: 0 }}>{copy.microphone}</p>

        {stage === "denied" ? (
          <div role="status" data-riffrec-consent-mic-denied="" style={noticeStyle}>
            <strong>Microphone unavailable.</strong> {denialReason} You can continue with drawing and the board; the
            interviewer will not run.
          </div>
        ) : null}

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(event) => setChecked(event.currentTarget.checked)}
          />
          <span>I understand what is streamed and to whom, and I consent to this live session.</span>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" data-riffrec-consent-decline="" style={secondaryButtonStyle} disabled={busy} onClick={onDecline}>
            {copy.declineLabel}
          </button>
          {stage === "denied" ? (
            <button
              type="button"
              data-riffrec-consent-continue-novoice=""
              style={checked ? buttonStyle : disabledButtonStyle}
              disabled={!checked}
              onClick={() => onAccept({ stream: null, mic: "denied" })}
            >
              Continue without microphone
            </button>
          ) : (
            <button
              type="button"
              data-riffrec-consent-accept=""
              style={!checked || busy ? disabledButtonStyle : buttonStyle}
              disabled={!checked || busy}
              onClick={accept}
            >
              {busy ? "Requesting microphone…" : copy.acceptLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState, type CSSProperties } from "react";

export interface SendControlProps {
  /** The session's `send` checkpoint; resolves with whether a checkpoint left the page. */
  onSend: () => Promise<boolean>;
  /** Opens the confirmation pass; the overlay emits `final` once it completes (KTD9, KTD22). */
  onDone: () => void;
  /** Units and forwarded withdrawals the next checkpoint would release. */
  heldCount?: number;
  disabled?: boolean;
  /** Pill form: icon-sized Send, no Done. */
  compact?: boolean;
}

const buttonStyle: CSSProperties = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "5px 12px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};

const disabledStyle: CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.56
};

const noteStyle: CSSProperties = {
  fontSize: 11,
  color: "#667085",
  marginLeft: 6
};

/**
 * Send releases the held batch now (R12); Done starts the session-end flow
 * (R43). Send is a no-op checkpoint when nothing is held and says so.
 */
export function SendControl({ onSend, onDone, heldCount = 0, disabled = false, compact = false }: SendControlProps) {
  const [sending, setSending] = useState(false);
  const [lastSend, setLastSend] = useState<"sent" | "nothing" | null>(null);

  // A ref, not state: a second Send click before React re-renders must not emit a second checkpoint.
  const sendInFlight = useRef(false);
  const send = async () => {
    if (sendInFlight.current) return;
    sendInFlight.current = true;
    setSending(true);
    setLastSend(null);
    try {
      const emitted = await onSend();
      setLastSend(emitted ? "sent" : "nothing");
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  };

  const busy = disabled || sending;

  return (
    <span data-riffrec-send-control="" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        data-riffrec-send=""
        aria-label={heldCount > 0 ? `Send ${heldCount} held ${heldCount === 1 ? "unit" : "units"} now` : "Send now"}
        title="Release held units to the agent now"
        disabled={busy}
        style={busy ? { ...buttonStyle, ...disabledStyle } : buttonStyle}
        onClick={send}
      >
        {sending ? "Sending…" : heldCount > 0 ? `Send (${heldCount})` : "Send"}
      </button>
      {!compact ? (
        <button
          type="button"
          data-riffrec-done=""
          title="Confirm each unit, then end the session"
          disabled={disabled}
          style={disabled ? { ...secondaryButtonStyle, ...disabledStyle } : secondaryButtonStyle}
          onClick={onDone}
        >
          Done
        </button>
      ) : null}
      {!compact && lastSend === "nothing" && heldCount === 0 ? (
        <span data-riffrec-send-note="nothing" role="status" style={noteStyle}>
          Nothing held
        </span>
      ) : null}
    </span>
  );
}

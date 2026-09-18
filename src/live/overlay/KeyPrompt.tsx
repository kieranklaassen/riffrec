import { useState, type CSSProperties, type FormEvent } from "react";
import type { VoiceUnavailableReason } from "../realtime/interviewer";
import { clearStoredOpenAIKey, readStoredOpenAIKey, storeOpenAIKey } from "../realtime/openaiKey";

export interface KeyPromptProps {
  reason: VoiceUnavailableReason | null;
  /** Re-mints with the key now in storage. */
  onRetry: () => void;
}

/** Voice is off for want of a usable OpenAI key: the endpoint has none, or OpenAI rejected the one sent. */
export function needsOpenAIKey(reason: VoiceUnavailableReason | null): boolean {
  if (reason?.kind !== "refused") return false;
  return reason.reason === "no_key" || (reason.reason === "openai_error" && reason.upstreamStatus === 401);
}

const wrapStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: 10,
  border: "1px solid #fedf89",
  borderRadius: 8,
  background: "#fffaeb",
  color: "#101828"
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #e4e7ec",
  borderRadius: 7,
  padding: "5px 8px",
  font: "inherit",
  fontSize: 12
};

const buttonStyle: CSSProperties = {
  border: "1px solid #101828",
  borderRadius: 7,
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  fontSize: 12,
  fontWeight: 500,
  padding: "5px 10px",
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const linkButtonStyle: CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  color: "#475467",
  font: "inherit",
  fontSize: 11,
  textDecoration: "underline",
  cursor: "pointer"
};

/**
 * Lets the riffer paste an OpenAI key so voice can start. The key stays in this
 * browser's `localStorage` and rides each mint, so a reload reconnects on its own.
 */
export function KeyPrompt({ reason, onRetry }: KeyPromptProps) {
  const [value, setValue] = useState("");
  const [stored, setStored] = useState(() => readStoredOpenAIKey() !== null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const key = value.trim();
    if (!key) return;
    storeOpenAIKey(key);
    setStored(true);
    setValue("");
    onRetry();
  };

  const handleForget = () => {
    clearStoredOpenAIKey();
    setStored(false);
  };

  return (
    <form data-riffrec-live-key-prompt="" style={wrapStyle} onSubmit={handleSubmit}>
      <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.4 }}>
        {stored && reason?.kind === "refused" && reason.reason === "openai_error"
          ? "OpenAI rejected the saved key. Paste a different one to turn voice on."
          : "Paste an OpenAI API key to turn voice on. It is kept in this browser and sent only to the endpoint."}
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="password"
          data-riffrec-live-key-input=""
          aria-label="OpenAI API key"
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={inputStyle}
        />
        <button type="submit" data-riffrec-live-key-save="" disabled={!value.trim()} style={buttonStyle}>
          Save and retry
        </button>
      </div>
      {stored ? (
        <button type="button" data-riffrec-live-key-forget="" style={{ ...linkButtonStyle, marginTop: 6 }} onClick={handleForget}>
          Forget saved key
        </button>
      ) : null}
    </form>
  );
}

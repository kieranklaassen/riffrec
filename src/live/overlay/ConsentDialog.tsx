import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EXECUTION_MODES, type ExecutionMode } from "../contract";
import { Kbd, Wordmark } from "./Kbd";
import { MODE_LABELS, MODE_SUMMARIES } from "./ModeSwitch";
import { buildConsentCopy, resolveConsentProfile, type ConsentCopyInput } from "./consentCopy";
import { isPlainKey } from "./shortcuts";

export type ConsentMicOutcome = "granted" | "denied";

export interface ConsentResult {
  /** The single microphone stream every consumer clones from (KTD21); null when denied or voice was turned off. */
  stream: MediaStream | null;
  mic: ConsentMicOutcome;
  /** The execution mode picked in step 1; seeds the session mode. */
  mode: ExecutionMode;
  /** Whether screenshots may leave the page; false once the riffer turned them off. */
  frames: boolean;
}

export interface ConsentDialogProps extends ConsentCopyInput {
  onAccept: (result: ConsentResult) => void;
  onDecline: () => void;
  /** Starting selection for the mode cards. Defaults to `smart`. */
  mode?: ExecutionMode;
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
  background: "rgba(16, 24, 40, 0.28)",
  padding: 16
};

const dialogStyle: CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "calc(100% - 32px)",
  display: "flex",
  flexDirection: "column",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #eaecf0",
  borderRadius: 14,
  boxShadow: "0 12px 32px rgba(16, 24, 40, 0.12)",
  fontFamily: FONT,
  fontSize: 13,
  lineHeight: 1.5,
  outline: "none",
  overflow: "hidden"
};

const closeButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "#667085",
  font: "inherit",
  fontSize: 15,
  lineHeight: 1,
  cursor: "pointer"
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#667085"
};

const rowButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e7ec",
  borderRadius: 8,
  background: "#ffffff",
  color: "#101828",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer"
};

const boxStyle: CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #eaecf0",
  borderRadius: 8
};

const chipStyle: CSSProperties = {
  fontSize: 11,
  color: "#667085",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f2f4f7"
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  background: "transparent",
  padding: "6px 8px",
  marginLeft: -8,
  borderRadius: 6,
  color: "#475467",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer"
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  padding: "0 10px 0 14px",
  border: "1px solid #101828",
  borderRadius: 8,
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const primaryBlockedStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#f2f4f7",
  color: "#98a2b3",
  borderColor: "#e4e7ec",
  cursor: "not-allowed"
};

const shortcutLegend: [string, string][] = [
  ["D", "Draw tool"],
  ["N", "Pin tool"],
  ["V", "Cursor (use the page normally)"],
  ["M", "Mute mic"],
  ["P", "Pause capture"],
  ["S", "Send to agent"],
  ["C", "Collapse panel"],
  ["E", "End session"]
];

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

type Step = 1 | 2 | 3;
type MicStage = "idle" | "asking" | "denied";

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        flex: "none",
        width: 30,
        height: 18,
        borderRadius: 999,
        background: on ? "#101828" : "#e4e7ec",
        transition: "background 120ms"
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 14 : 2,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: "#ffffff",
          boxShadow: "0 1px 2px rgba(16, 24, 40, 0.15)",
          transition: "left 120ms"
        }}
      />
    </span>
  );
}

function SwitchRow({
  on,
  onToggle,
  name,
  shortcut,
  children,
  attribute
}: {
  on: boolean;
  onToggle: () => void;
  name: string;
  shortcut: string;
  children: ReactNode;
  attribute: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} {...{ [attribute]: on ? "on" : "off" }} style={rowButtonStyle} onClick={onToggle}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
          {name}
          <Kbd>{shortcut}</Kbd>
        </span>
        <span style={{ display: "block", fontSize: 12, color: "#475467" }}>{children}</span>
      </span>
      <Switch on={on} />
    </button>
  );
}

function Stepper({ step, voice }: { step: Step; voice: boolean }) {
  const steps: Step[] = [1, 2, 3];
  const names: Record<Step, string> = { 1: "Set up", 2: "What's shared", 3: voice ? "Microphone" : "Ready" };
  return (
    <ol
      aria-label="Steps"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: 0,
        padding: "16px 20px",
        listStyle: "none",
        borderBottom: "1px solid #f2f4f7",
        fontSize: 12
      }}
    >
      {steps.map((item) => {
        const done = item < step;
        const active = item === step;
        return (
          <li key={item} aria-current={active ? "step" : undefined} style={{ display: "contents" }}>
            {item > 1 ? <span aria-hidden="true" style={{ flex: 1, minWidth: 12, height: 1, background: "#eaecf0" }} /> : null}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  boxSizing: "border-box",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  ...(active
                    ? { background: "#101828", color: "#ffffff" }
                    : done
                      ? { background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" }
                      : { background: "#ffffff", color: "#98a2b3", border: "1px solid #e4e7ec" })
                }}
              >
                {done ? "✓" : item}
              </span>
              <span style={active ? { color: "#101828", fontWeight: 500 } : { color: done ? "#475467" : "#98a2b3" }}>
                {names[item]}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The three-step start of a live session (R22, R26): set up the mode and what
 * is captured, read exactly what is shared with whom (recomputed from those
 * choices) and consent, then acquire the one microphone stream the session
 * shares (KTD21). A denied microphone, or voice turned off, still starts a
 * session with drawing and the board.
 */
export function ConsentDialog({
  onAccept,
  onDecline,
  mode: initialMode = "smart",
  getUserMedia = defaultGetUserMedia,
  zIndex = 2147483647,
  ...copyInput
}: ConsentDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<ExecutionMode>(initialMode);
  const [voiceOn, setVoiceOn] = useState(true);
  const [framesOn, setFramesOn] = useState(() => resolveConsentProfile(copyInput.profile).frames);
  const [agreed, setAgreed] = useState(false);
  const [mic, setMic] = useState<MicStage>("idle");
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const copy = buildConsentCopy({
    ...copyInput,
    profile: { ...copyInput.profile, frames: framesOn },
    microphone: voiceOn
  });

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // A ref, not state: a second Start before React re-renders must not acquire a second stream (KTD21).
  const requestInFlight = useRef(false);
  const requestMic = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setMic("asking");
    try {
      const stream = await getUserMedia({ audio: true });
      onAccept({ stream, mic: "granted", mode, frames: framesOn });
    } catch (error) {
      setDenialReason(errorMessage(error) ?? "Microphone access was denied.");
      setMic("denied");
    } finally {
      requestInFlight.current = false;
    }
  };

  const withoutVoice = !voiceOn || mic === "denied";
  const blocked = step === 2 && !agreed;

  const next = () => {
    if (step === 1) setStep(2);
    else if (step === 2) {
      if (agreed) setStep(3);
    } else if (withoutVoice) {
      onAccept({ stream: null, mic: "denied", mode, frames: framesOn });
    } else if (mic !== "asking") {
      void requestMic();
    }
  };

  const back = () => {
    if (mic === "asking") return;
    if (step === 1) {
      onDecline();
      return;
    }
    setStep((current) => (current - 1) as Step);
    setMic("idle");
  };

  const change = () => {
    if (mic === "asking") return;
    setStep(1);
    setMic("idle");
  };

  const actions = useRef({ next, back, setMode, setVoiceOn, setFramesOn, setAgreed, step });
  actions.current = { next, back, setMode, setVoiceOn, setFramesOn, setAgreed, step };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPlainKey(event)) return;
      const key = event.key.toLowerCase();
      const onControl = event.target instanceof HTMLButtonElement;
      // Enter and Space on a focused control keep their native meaning: activate that control.
      if (onControl && (key === "enter" || key === " ")) return;
      const current = actions.current;
      let handled = true;
      if (key === "enter") current.next();
      else if (key === "escape") current.back();
      else if (current.step === 1 && (key === "1" || key === "2" || key === "3")) current.setMode(EXECUTION_MODES[Number(key) - 1]);
      else if (current.step === 1 && key === "v") current.setVoiceOn((on) => !on);
      else if (current.step === 1 && key === "f") current.setFramesOn((on) => !on);
      else if (current.step === 2 && key === " ") current.setAgreed((on) => !on);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const primaryLabel =
    step < 3
      ? "Continue"
      : !voiceOn
        ? "Start session"
        : mic === "denied"
          ? "Start without voice"
          : mic === "asking"
            ? "Waiting…"
            : copy.acceptLabel;
  const primaryAttribute =
    step < 3 ? "data-riffrec-consent-next" : withoutVoice ? "data-riffrec-consent-continue-novoice" : "data-riffrec-consent-accept";

  return (
    <div data-riffrec-consent="" style={{ ...backdropStyle, zIndex }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1} style={dialogStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 12px 0 20px" }}>
          <Wordmark />
          <button
            type="button"
            data-riffrec-consent-close=""
            aria-label="Not now"
            title="Not now (Esc)"
            disabled={mic === "asking"}
            style={closeButtonStyle}
            onClick={onDecline}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "10px 20px 0" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{copy.title}</h2>
          <p style={{ margin: "4px 0 0", color: "#475467" }}>{copy.intro}</p>
        </div>
        <Stepper step={step} voice={voiceOn} />

        <div data-riffrec-consent-step={step} style={{ padding: "16px 20px", overflowY: "auto", minHeight: 0 }}>
          {step === 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={sectionLabelStyle}>When the agent applies changes</span>
              <div role="radiogroup" aria-label="Execution mode" style={{ display: "flex", gap: 8 }}>
                {EXECUTION_MODES.map((option, index) => {
                  const selected = option === mode;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-riffrec-consent-mode={option}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: selected ? "1.5px solid #101828" : "1px solid #e4e7ec",
                        background: "#ffffff",
                        color: "#101828",
                        font: "inherit",
                        textAlign: "left",
                        cursor: "pointer"
                      }}
                      onClick={() => setMode(option)}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontWeight: 500 }}>
                        {MODE_LABELS[option]}
                        <Kbd>{index + 1}</Kbd>
                      </span>
                      <span style={{ fontSize: 11, lineHeight: 1.4, color: "#475467" }}>{MODE_SUMMARIES[option]}</span>
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 11, color: "#667085" }}>You can change this later from the panel footer.</span>
              <span style={{ ...sectionLabelStyle, marginTop: 8 }}>Capture</span>
              <SwitchRow
                on={voiceOn}
                onToggle={() => setVoiceOn((on) => !on)}
                name="Voice interviewer"
                shortcut="V"
                attribute="data-riffrec-consent-voice"
              >
                Talk instead of type. It listens and asks follow-ups. Needs your microphone.
              </SwitchRow>
              <SwitchRow
                on={framesOn}
                onToggle={() => setFramesOn((on) => !on)}
                name="Screenshots of the page"
                shortcut="F"
                attribute="data-riffrec-consent-frames"
              >
                Taken when you point at something, so the agent sees what you see.
              </SwitchRow>
            </div>
          ) : null}

          {step === 2 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {copy.destinations.map((destination) => (
                <div key={destination.id} data-riffrec-consent-destination={destination.id} style={boxStyle}>
                  <p style={{ margin: "0 0 6px", fontWeight: 500 }}>To {destination.to}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#475467" }}>
                    {destination.items.map((item) => (
                      <li key={item} style={{ margin: "0 0 3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {destination.id === "endpoint" && copy.retention ? (
                    <p data-riffrec-consent-retention="" style={{ margin: "8px 0 0", fontSize: 12, color: "#667085" }}>
                      {copy.retention}
                    </p>
                  ) : null}
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 12, color: "#475467" }}>{copy.noExclusions}</p>
              <button
                type="button"
                role="checkbox"
                aria-checked={agreed}
                data-riffrec-consent-agree={agreed ? "on" : "off"}
                style={{ ...rowButtonStyle, gap: 10, alignItems: "flex-start", borderColor: agreed ? "#101828" : "#e4e7ec" }}
                onClick={() => setAgreed((on) => !on)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    boxSizing: "border-box",
                    borderRadius: 4,
                    background: agreed ? "#101828" : "#ffffff",
                    border: agreed ? "none" : "1px solid #d0d5dd",
                    color: "#ffffff",
                    fontSize: 11
                  }}
                >
                  {agreed ? "✓" : null}
                </span>
                <span style={{ flex: 1 }}>I understand what is shared and with whom, and I consent to this live session.</span>
                <Kbd>Space</Kbd>
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {mic === "asking" ? (
                <div style={{ ...boxStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: "#f79009" }} />
                  Waiting for your browser's microphone prompt…
                </div>
              ) : mic === "denied" ? (
                <div
                  role="status"
                  data-riffrec-consent-mic-denied=""
                  style={{ ...boxStyle, background: "#fffaeb", borderColor: "#fedf89", color: "#7a2e0e" }}
                >
                  <strong style={{ fontWeight: 600 }}>Microphone unavailable.</strong> {denialReason} You can still start with
                  drawing and the board. The voice interviewer won't run.
                </div>
              ) : (
                <p style={{ margin: 0 }}>{copy.microphone}</p>
              )}
              <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f9fafb" }}>
                <span style={sectionLabelStyle}>Once you're live</span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px 16px",
                    marginTop: 8,
                    fontSize: 12,
                    color: "#344054"
                  }}
                >
                  {shortcutLegend.map(([key, label]) => (
                    <span key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Kbd>{key}</Kbd>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div data-riffrec-consent-summary="" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={chipStyle}>{MODE_LABELS[mode]} mode</span>
                <span style={chipStyle}>{!voiceOn ? "Voice off" : mic === "denied" ? "Voice unavailable" : "Voice on"}</span>
                <span style={chipStyle}>{framesOn ? "Screenshots on" : "Screenshots off"}</span>
                <button
                  type="button"
                  data-riffrec-consent-change=""
                  disabled={mic === "asking"}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: "2px 4px",
                    color: "#475467",
                    font: "inherit",
                    fontSize: 11,
                    textDecoration: "underline",
                    cursor: "pointer"
                  }}
                  onClick={change}
                >
                  Change
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px 12px 20px",
            borderTop: "1px solid #f2f4f7"
          }}
        >
          {step === 1 ? (
            <button type="button" data-riffrec-consent-decline="" style={ghostButtonStyle} onClick={onDecline}>
              {copy.declineLabel}
              <Kbd>Esc</Kbd>
            </button>
          ) : (
            <button type="button" data-riffrec-consent-back="" disabled={mic === "asking"} style={ghostButtonStyle} onClick={back}>
              ← Back
              <Kbd>Esc</Kbd>
            </button>
          )}
          <button
            type="button"
            {...{ [primaryAttribute]: "" }}
            disabled={blocked || mic === "asking"}
            title={blocked ? "Tick the consent box first" : undefined}
            style={blocked ? primaryBlockedStyle : primaryButtonStyle}
            onClick={next}
          >
            {primaryLabel}
            {blocked ? null : <Kbd dark>↵</Kbd>}
          </button>
        </div>
      </div>
    </div>
  );
}

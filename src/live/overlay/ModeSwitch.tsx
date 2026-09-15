import type { CSSProperties } from "react";
import { EXECUTION_MODES, type ExecutionMode } from "../contract";

export interface ModeSwitchProps {
  mode: ExecutionMode;
  /**
   * The mode the endpoint has not acted on yet (KTD12). Rendered from session
   * state so the hint survives a reload; cleared by the session when a batch
   * stamped with the new mode is acknowledged.
   */
  pendingMode: ExecutionMode | null;
  onChange: (mode: ExecutionMode) => void;
  disabled?: boolean;
}

export const MODE_LABELS: Record<ExecutionMode, string> = {
  instant: "Instant",
  smart: "Smart",
  collect: "Collect"
};

export const MODE_DESCRIPTIONS: Record<ExecutionMode, string> = {
  instant: "Applies everything it can at each checkpoint, guessing on ambiguous units and noting the guess.",
  smart: "Applies clear bounded edits, asks about ambiguous ones, sends anything larger to the residual list.",
  collect: "Applies nothing during the riff; the accepted batch lands as one pass when you say done."
};

export const PENDING_MODE_HINT = "Pending until next checkpoint";

const groupStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  overflow: "hidden",
  background: "#ffffff"
};

const optionStyle: CSSProperties = {
  border: "none",
  borderRight: "1px solid #d0d5dd",
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 10px",
  cursor: "pointer"
};

const optionSelectedStyle: CSSProperties = {
  ...optionStyle,
  background: "#101828",
  color: "#ffffff"
};

const hintStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 11,
  color: "#b54708"
};

/** The Instant / Smart / Collect switch (R37, KTD11). */
export function ModeSwitch({ mode, pendingMode, onChange, disabled = false }: ModeSwitchProps) {
  return (
    <div data-riffrec-mode-switch="" style={{ display: "inline-block" }}>
      <div role="radiogroup" aria-label="Execution mode" style={{ ...groupStyle, opacity: disabled ? 0.56 : 1 }}>
        {EXECUTION_MODES.map((option, index) => {
          const selected = option === mode;
          const last = index === EXECUTION_MODES.length - 1;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              data-riffrec-mode-option={option}
              title={MODE_DESCRIPTIONS[option]}
              disabled={disabled}
              style={{ ...(selected ? optionSelectedStyle : optionStyle), ...(last ? { borderRight: "none" } : {}) }}
              onClick={() => {
                if (!selected) onChange(option);
              }}
            >
              {MODE_LABELS[option]}
            </button>
          );
        })}
      </div>
      {pendingMode !== null ? (
        <span data-riffrec-mode-pending={pendingMode} role="status" style={hintStyle}>
          {MODE_LABELS[pendingMode]}: {PENDING_MODE_HINT.toLowerCase()}
        </span>
      ) : null}
    </div>
  );
}

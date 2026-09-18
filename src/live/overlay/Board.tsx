import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ExecutionMode, LiveUnit, LiveUnitConfirmation, UnitStatus } from "../contract";
import type { UnitQuestion } from "../units";

export interface BoardProps {
  units: readonly LiveUnit[];
  /** Open and answered questions; the board shows the open one inline (R11). */
  questions?: readonly UnitQuestion[];
  /** Instant-mode guesses, by unit id (AE15). */
  guesses?: Readonly<Record<string, string>>;
  /** Agent notes (a blocked reason, an applied summary), by unit id. */
  notes?: Readonly<Record<string, string>>;
  /** Whether the endpoint has released the unit; withdraw is offered only before release. */
  isReleased?: (unitId: string) => boolean;
  mode: ExecutionMode;
  /** Typed reply is primary when no interviewer can voice the answer (`live_novoice`). */
  voice?: boolean;
  onWithdraw?: (unitId: string) => void;
  onAnswer?: (unitId: string, text: string) => void;
}

export const STATUS_LABELS: Record<UnitStatus, string> = {
  initial: "Heard",
  triaging: "Triaging",
  accepted: "Accepted",
  needs_info: "Needs info",
  working: "Working",
  applied: "Applied",
  blocked: "Blocked",
  withdrawn: "Withdrawn"
};

const STATUS_COLORS: Record<UnitStatus, string> = {
  initial: "#667085",
  triaging: "#b54708",
  accepted: "#175cd3",
  needs_info: "#c11574",
  working: "#6941c6",
  applied: "#027a48",
  blocked: "#b42318",
  withdrawn: "#98a2b3"
};

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: FONT,
  fontSize: 13,
  color: "#101828"
};

const itemStyle: CSSProperties = {
  border: "1px solid #eaecf0",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#ffffff"
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 500,
  padding: "1px 6px",
  borderRadius: 4,
  color: "#ffffff",
  marginRight: 6,
  verticalAlign: "middle"
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #e4e7ec",
  borderRadius: 7,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "3px 8px",
  cursor: "pointer"
};

const primaryButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  background: "#101828",
  borderColor: "#101828",
  color: "#ffffff",
  fontWeight: 500
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #e4e7ec",
  borderRadius: 7,
  padding: "4px 8px",
  font: "inherit",
  fontSize: 12
};

const noteStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#475467"
};

const emptyStyle: CSSProperties = {
  ...itemStyle,
  color: "#667085",
  borderStyle: "dashed",
  fontSize: 12,
  textAlign: "center"
};

/** Finished units fold into one summary row a few seconds after they finish, so the board reads like a feed. */
const FOLDED_STATUSES: readonly UnitStatus[] = ["applied", "withdrawn"];
export const SETTLE_MS = 4000;

const foldedToggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "6px 10px",
  border: "1px dashed #e4e7ec",
  borderRadius: 8,
  background: "transparent",
  color: "#667085",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer"
};

/** Ids of applied or withdrawn units that finished at least `SETTLE_MS` ago; ones finished before mount count as settled. */
function useSettled(units: readonly LiveUnit[]): ReadonlySet<string> {
  const finishedAt = useRef<Map<string, number> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const map = (finishedAt.current ??= new Map(units.filter((unit) => FOLDED_STATUSES.includes(unit.status)).map((unit) => [unit.id, 0])));
  for (const unit of units) {
    if (FOLDED_STATUSES.includes(unit.status)) {
      if (!map.has(unit.id)) map.set(unit.id, Date.now());
    } else map.delete(unit.id);
  }
  const pending = [...map.values()].filter((at) => now - at < SETTLE_MS);
  const next = pending.length > 0 ? Math.min(...pending) + SETTLE_MS - now : null;
  useEffect(() => {
    if (next === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next) + 20);
    return () => clearTimeout(timer);
  }, [next]);
  return new Set([...map].filter(([, at]) => now - at >= SETTLE_MS).map(([id]) => id));
}

export function describeAnchor(unit: LiveUnit): string | null {
  const anchor = unit.anchors[0];
  if (!anchor) return null;
  const target = anchor.component ? `${anchor.component} (${anchor.selector})` : anchor.selector;
  return `${target} on ${anchor.route}`;
}

interface ReplyFieldProps {
  unitId: string;
  primary: boolean;
  onAnswer: (unitId: string, text: string) => void;
}

function ReplyField({ unitId, primary, onAnswer }: ReplyFieldProps) {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAnswer(unitId, trimmed);
    setText("");
  };
  return (
    <form data-riffrec-unit-reply="" onSubmit={submit} style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <input
        type="text"
        aria-label="Type your answer"
        placeholder={primary ? "Type your answer" : "Or type your answer"}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        style={inputStyle}
      />
      <button type="submit" disabled={text.trim().length === 0} style={primary ? primaryButtonStyle : smallButtonStyle}>
        Reply
      </button>
    </form>
  );
}

/**
 * The optimistic units board (R11, R12): every unit with its current status,
 * the open question inline with a typed reply, strike-through for withdrawn,
 * the Instant guess note, and withdraw on units not yet released.
 */
export function Board({
  units,
  questions = [],
  guesses = {},
  notes = {},
  isReleased = () => false,
  mode,
  voice = true,
  onWithdraw,
  onAnswer
}: BoardProps) {
  const openQuestion = (unitId: string) => questions.find((question) => question.unit_id === unitId && !question.answered) ?? null;
  const settled = useSettled(units);
  const [showFolded, setShowFolded] = useState(false);

  if (units.length === 0) {
    return (
      <ul data-riffrec-board="" data-riffrec-board-mode={mode} style={listStyle}>
        <li data-riffrec-board-empty="" style={emptyStyle}>
          Say what should change, or draw on the page.
        </li>
      </ul>
    );
  }

  const row = (unit: LiveUnit, compact: boolean) => {
        const withdrawn = unit.status === "withdrawn";
        // Settled rows (in the folded group) keep only their badge and title.
        const collapsed = compact;
        const question = openQuestion(unit.id);
        const guess = guesses[unit.id];
        const note = notes[unit.id];
        const canWithdraw = onWithdraw && unit.status === "initial" && !isReleased(unit.id);
        const anchor = describeAnchor(unit);
        return (
          <li key={unit.id} data-riffrec-unit={unit.id} data-riffrec-unit-status={unit.status} style={itemStyle}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    ...badgeStyle,
                    background: STATUS_COLORS[unit.status],
                    ...(unit.status === "working" || unit.status === "triaging"
                      ? { animation: "riffrec-live-pulse 1.4s ease-in-out infinite" }
                      : {})
                  }}
                >{STATUS_LABELS[unit.status]}</span>
                <span
                  data-riffrec-unit-statement=""
                  style={withdrawn ? { textDecoration: "line-through", color: "#98a2b3" } : undefined}
                >
                  {unit.statement}
                </span>
              </span>
              {canWithdraw ? (
                <button
                  type="button"
                  data-riffrec-unit-withdraw=""
                  aria-label={`Withdraw: ${unit.statement}`}
                  style={smallButtonStyle}
                  onClick={() => onWithdraw(unit.id)}
                >
                  Withdraw
                </button>
              ) : null}
            </div>
            {anchor && !withdrawn && !collapsed ? (
              <p data-riffrec-unit-anchor="" style={{ ...noteStyle, color: "#667085" }}>
                {anchor}
              </p>
            ) : null}
            {guess && !collapsed ? (
              <p data-riffrec-unit-guess="" style={noteStyle}>
                <strong>Guess:</strong> {guess}
              </p>
            ) : null}
            {note && !collapsed ? (
              <p data-riffrec-unit-note="" style={noteStyle}>
                {note}
              </p>
            ) : null}
            {question ? (
              <div data-riffrec-unit-question="" style={{ marginTop: 6 }}>
                <p style={{ ...noteStyle, margin: 0, color: "#c11574" }}>
                  <strong>Agent asks:</strong> {question.question}
                </p>
                {onAnswer ? <ReplyField unitId={unit.id} primary={!voice} onAnswer={onAnswer} /> : null}
              </div>
            ) : null}
          </li>
        );
  };

  const active = units.filter((unit) => !settled.has(unit.id));
  const folded = units.filter((unit) => settled.has(unit.id));
  const foldedSummary = FOLDED_STATUSES.map((status) => {
    const count = folded.filter((unit) => unit.status === status).length;
    return count > 0 ? `${count} ${STATUS_LABELS[status].toLowerCase()}` : null;
  })
    .filter(Boolean)
    .join(" · ");

  return (
    <ul data-riffrec-board="" data-riffrec-board-mode={mode} style={listStyle}>
      {active.map((unit) => row(unit, false))}
      {folded.length > 0 ? (
        <li style={{ listStyle: "none" }}>
          <button
            type="button"
            data-riffrec-board-folded={folded.length}
            aria-expanded={showFolded}
            style={foldedToggleStyle}
            onClick={() => setShowFolded((open) => !open)}
          >
            <span>{foldedSummary}</span>
            <span aria-hidden="true" style={{ fontSize: 10 }}>
              {showFolded ? "▾" : "▸"}
            </span>
          </button>
        </li>
      ) : null}
      {showFolded ? folded.map((unit) => row(unit, true)) : null}
    </ul>
  );
}

export type ConfirmationMap = Record<string, LiveUnitConfirmation>;

export interface ConfirmationPassProps {
  /** Units to confirm; withdrawn units are skipped by the overlay. */
  units: readonly LiveUnit[];
  onComplete: (confirmations: ConfirmationMap) => void;
  onCancel: () => void;
  busy?: boolean;
}

function defaultConfirmation(unit: LiveUnit): LiveUnitConfirmation {
  return unit.confirmed ?? { element: true, change: true };
}

/**
 * KTD22: at Done, the riffer confirms per unit whether the intended element
 * and the intended change were captured. The overlay emits one `unit_update`
 * per unit from the result before the `final` checkpoint leaves the page.
 */
export function ConfirmationPass({ units, onComplete, onCancel, busy = false }: ConfirmationPassProps) {
  // Only the riffer's edits live in state; a unit that arrives while the pass is open reads its default.
  const [edits, setEdits] = useState<ConfirmationMap>({});
  const confirmationFor = (unit: LiveUnit): LiveUnitConfirmation => edits[unit.id] ?? defaultConfirmation(unit);

  const toggle = (unit: LiveUnit, field: keyof LiveUnitConfirmation, value: boolean) => {
    setEdits((current) => ({ ...current, [unit.id]: { ...confirmationFor(unit), [field]: value } }));
  };

  const complete = () => {
    const confirmations: ConfirmationMap = {};
    for (const unit of units) confirmations[unit.id] = confirmationFor(unit);
    onComplete(confirmations);
  };

  return (
    <div data-riffrec-confirmation="" style={{ fontFamily: FONT, fontSize: 13, color: "#101828" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 500 }}>Before you go: did we get each one right?</p>
      {units.length === 0 ? (
        <p style={{ ...noteStyle, marginBottom: 8 }}>No units this session. Finishing releases anything the agent still holds.</p>
      ) : (
        <ul style={listStyle}>
          {units.map((unit) => {
            const confirmation = confirmationFor(unit);
            const anchor = describeAnchor(unit);
            return (
              <li key={unit.id} data-riffrec-confirm-unit={unit.id} style={itemStyle}>
                <div>{unit.statement}</div>
                {anchor ? <p style={{ ...noteStyle, marginTop: 2 }}>{anchor}</p> : null}
                <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12 }}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      data-riffrec-confirm-element=""
                      checked={confirmation.element}
                      onChange={(event) => toggle(unit, "element", event.currentTarget.checked)}
                    />
                    Right element
                  </label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      data-riffrec-confirm-change=""
                      checked={confirmation.change}
                      onChange={(event) => toggle(unit, "change", event.currentTarget.checked)}
                    />
                    Right change
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button type="button" data-riffrec-confirm-cancel="" disabled={busy} style={smallButtonStyle} onClick={onCancel}>
          Keep riffing
        </button>
        <button
          type="button"
          data-riffrec-confirm-finish=""
          disabled={busy}
          style={busy ? { ...primaryButtonStyle, opacity: 0.56, cursor: "not-allowed" } : primaryButtonStyle}
          onClick={complete}
        >
          {busy ? "Finishing…" : "Finish session"}
        </button>
      </div>
    </div>
  );
}

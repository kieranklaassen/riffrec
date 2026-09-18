import type { CSSProperties } from "react";
import { UNIT_STATUSES, type LiveUnit, type UnitStatus } from "../contract";
import { STATUS_LABELS } from "./Board";
import { startButtonDisabledStyle, startButtonStyle, type NextSessionState } from "./NextSessionLauncher";

export interface EndedCardProps {
  units: readonly LiveUnit[];
  /** Why the endpoint ended the session (`session_ended.reason`), when it said. */
  reason?: string | null;
  /** Where the consumer wrote the residual list; a generic pointer when unknown. */
  residualHint?: string;
  onDismiss?: () => void;
  /** The remembered link can open another session; `draining` while the agent finishes this one. */
  next?: NextSessionState | null;
  onStartNext?: () => void;
}

export type EndedCounts = Record<UnitStatus, number>;

export const RESIDUAL_STATUSES: readonly UnitStatus[] = ["needs_info", "blocked"];

export function countByStatus(units: readonly LiveUnit[]): EndedCounts {
  const counts = Object.fromEntries(UNIT_STATUSES.map((status) => [status, 0])) as EndedCounts;
  for (const unit of units) counts[unit.status] += 1;
  return counts;
}

export function residualCount(counts: EndedCounts): number {
  return RESIDUAL_STATUSES.reduce((total, status) => total + counts[status], 0);
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const cardStyle: CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  color: "#101828",
  background: "#ffffff",
  border: "1px solid #eaecf0",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.06)",
  padding: 16,
  width: 300
};

const countsStyle: CSSProperties = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  rowGap: 4,
  columnGap: 12
};

const buttonStyle: CSSProperties = {
  border: "1px solid #e4e7ec",
  borderRadius: 7,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "5px 10px",
  cursor: "pointer"
};

/**
 * Replaces the zip download notice when the endpoint ended the session
 * (`session_ended`): the delivery already happened as a stream, so the card
 * reports counts by final status and points at the residual list (R43).
 */
export function EndedCard({ units, reason, residualHint, onDismiss, next, onStartNext }: EndedCardProps) {
  const counts = countByStatus(units);
  const residuals = residualCount(counts);
  const shown = UNIT_STATUSES.filter((status) => counts[status] > 0);

  return (
    <div role="status" data-riffrec-ended-card="" style={cardStyle}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Live session ended</p>
      <p style={{ margin: "4px 0 0", color: "#475467" }}>
        {units.length === 0
          ? "No units were recorded. Everything you streamed is in the endpoint's session log."
          : `${units.length} ${units.length === 1 ? "unit" : "units"} streamed to the endpoint as they happened; the session log is there.`}
      </p>
      {shown.length > 0 ? (
        <ul data-riffrec-ended-counts="" style={countsStyle}>
          {shown.map((status) => (
            <li key={status} data-riffrec-ended-count={status} style={{ display: "contents" }}>
              <span>{STATUS_LABELS[status]}</span>
              <span style={{ fontWeight: 500, textAlign: "right" }}>{counts[status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p data-riffrec-ended-residual="" style={{ margin: "10px 0 0", color: "#475467" }}>
        {residuals > 0
          ? `${residuals} ${residuals === 1 ? "unit needs" : "units need"} follow-up. ${residualHint ?? "Your agent's residual list has them, ready to hand to planning."}`
          : residualHint ?? "Anything beyond this session is in your agent's residual list."}
      </p>
      {reason && reason !== "riffer_done" ? (
        <p data-riffrec-ended-reason="" style={{ margin: "6px 0 0", fontSize: 12, color: "#667085" }}>
          Ended by the endpoint: {reason}
        </p>
      ) : null}
      {onDismiss || (next && onStartNext) ? (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }}>
          {next && onStartNext ? (
            <button
              type="button"
              data-riffrec-ended-start-next={next}
              disabled={next !== "ready"}
              title={next === "ready" ? undefined : "The agent is still finishing this session"}
              style={next === "ready" ? startButtonStyle : startButtonDisabledStyle}
              onClick={onStartNext}
            >
              {next === "ready" ? "Start another session" : "Agent wrapping up…"}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" data-riffrec-ended-dismiss="" style={buttonStyle} onClick={onDismiss}>
              Close
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

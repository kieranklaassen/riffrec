import { Board } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};

// The board sits in the 320px overlay panel body; the panel supplies the font.
const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      width: 320,
      padding: 12,
      background: "#ffffff",
      border: "1px solid #eaecf0",
      borderRadius: 10,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 13,
      color: "#101828",
      boxSizing: "border-box"
    }}
  >
    {children}
  </div>
);

type Status = "initial" | "triaging" | "accepted" | "needs_info" | "applied" | "blocked" | "withdrawn";

const unit = (id: string, statement: string, status: Status, component: string, selector: string, route = "/settings/billing") => ({
  id,
  statement,
  transcript_excerpt: statement,
  anchors: [{ route, selector, component, rect: { x: 320, y: 184, width: 240, height: 40 }, t: 4200 }],
  evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 3800, t_end: 6100 } },
  status
});

const smartUnits = [
  unit("unit_0001", "Make the upgrade button stand out more", "applied", "PlanCard", "main > section.plan-card button"),
  unit("unit_0002", "The invoice table is too cramped on the right", "accepted", "InvoiceTable", "table.invoices"),
  unit("unit_0003", "Move the seat count next to the price", "needs_info", "PlanCard", "main > section.plan-card"),
  unit("unit_0004", "Rename 'Danger zone' to something calmer", "blocked", "SettingsNav", "nav a[href='#danger']"),
  unit("unit_0005", "Actually, keep the old header color", "withdrawn", "AppHeader", "header")
];

export const SmartMode = () => (
  <Panel>
    <Board
      units={smartUnits}
      mode="smart"
      questions={[{ unit_id: "unit_0003", question: "Before or after the per-seat price?", t: 7200, answered: false }]}
      notes={{
        unit_0001: "Switched to the primary style and bumped the size.",
        unit_0004: "The label comes from the shared nav config; out of scope for this page."
      }}
      isReleased={(id) => id !== "unit_0003"}
      onWithdraw={noop}
      onAnswer={noop}
    />
  </Panel>
);

export const InstantGuesses = () => (
  <Panel>
    <Board
      units={[
        unit("unit_0001", "The empty state feels sad", "initial", "ProjectList", "section.projects .empty"),
        unit("unit_0002", "Card shadows are too heavy", "triaging", "ProjectCard", "li.project-card")
      ]}
      mode="instant"
      guesses={{
        unit_0001: "Adds an illustration and a 'Create project' button.",
        unit_0002: "Drops the shadow to the small elevation token."
      }}
      onWithdraw={noop}
    />
  </Panel>
);

export const TypedReply = () => (
  <Panel>
    <Board
      units={[unit("unit_0001", "This chart needs a legend", "needs_info", "UsageChart", "figure.usage-chart", "/analytics")]}
      mode="smart"
      voice={false}
      questions={[{ unit_id: "unit_0001", question: "Should the legend sit above the chart or to its right?", t: 5100, answered: false }]}
      isReleased={() => true}
      onAnswer={noop}
    />
  </Panel>
);

export const Empty = () => (
  <Panel>
    <Board units={[]} mode="collect" />
  </Panel>
);

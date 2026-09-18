import { ConfirmationPass } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};

const Panel = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 320, padding: 12, background: "#ffffff", border: "1px solid #eaecf0", borderRadius: 10, boxSizing: "border-box" }}>
    {children}
  </div>
);

const unit = (id: string, statement: string, component: string, selector: string, confirmed?: { element: boolean; change: boolean }) => ({
  id,
  statement,
  transcript_excerpt: statement,
  anchors: [{ route: "/settings/billing", selector, component, rect: { x: 320, y: 184, width: 240, height: 40 }, t: 4200 }],
  evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 3800, t_end: 6100 } },
  status: "applied" as const,
  ...(confirmed ? { confirmed } : {})
});

const units = [
  unit("unit_0001", "Make the upgrade button stand out more", "PlanCard", "main > section.plan-card button"),
  unit("unit_0002", "The invoice table is too cramped on the right", "InvoiceTable", "table.invoices", { element: true, change: false }),
  unit("unit_0003", "Move the seat count next to the price", "PlanCard", "main > section.plan-card", { element: false, change: true })
];

export const Reviewing = () => (
  <Panel>
    <ConfirmationPass units={units} onComplete={noop} onCancel={noop} />
  </Panel>
);

export const Finishing = () => (
  <Panel>
    <ConfirmationPass units={units.slice(0, 1)} onComplete={noop} onCancel={noop} busy />
  </Panel>
);

export const NoUnits = () => (
  <Panel>
    <ConfirmationPass units={[]} onComplete={noop} onCancel={noop} />
  </Panel>
);

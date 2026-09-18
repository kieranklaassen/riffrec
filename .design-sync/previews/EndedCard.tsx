import { EndedCard } from "riffrec";

const noop = () => {};

const rect = { x: 320, y: 184, width: 240, height: 40 };

function unit(id: string, statement: string, status: "applied" | "needs_info" | "blocked" | "withdrawn" | "accepted") {
  return {
    id,
    statement,
    transcript_excerpt: statement,
    anchors: [{ route: "/settings/billing", selector: "main > section.plan-card", component: "PlanCard", rect, t: 12.4 }],
    evidence: { frame_ids: [`f-${id}`], annotation_ids: [], transcript_span: { t_start: 10.2, t_end: 14.8 } },
    status
  };
}

const units = [
  unit("u1", "Make the upgrade button the primary action on the plan card", "applied"),
  unit("u2", "The invoice table header should stick when scrolling", "applied"),
  unit("u3", "Trial countdown text is too faint against the banner", "applied"),
  unit("u4", "Seats field should explain what counts as a seat", "needs_info"),
  unit("u5", "Move billing history into its own tab", "blocked"),
  unit("u6", "Rename 'Workspace' to 'Team' everywhere", "withdrawn")
];

export const StartAnother = () => (
  <EndedCard units={units} reason="riffer_done" next="ready" onStartNext={noop} onDismiss={noop} />
);

export const AgentWrappingUp = () => (
  <EndedCard units={units} reason="riffer_done" next="draining" onStartNext={noop} onDismiss={noop} />
);

export const EndedByEndpoint = () => (
  <EndedCard
    units={units.slice(0, 3)}
    reason="agent_stopped"
    residualHint="The residual list is at .context/polish/residual.md."
    onDismiss={noop}
  />
);

export const NoUnits = () => <EndedCard units={[]} reason="riffer_done" onDismiss={noop} />;

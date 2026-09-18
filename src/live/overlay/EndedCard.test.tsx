// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveUnit, UnitStatus } from "../contract";
import { EndedCard, countByStatus, residualCount, type EndedCardProps } from "./EndedCard";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

function unit(id: string, status: UnitStatus): LiveUnit {
  return {
    id,
    statement: `Change ${id}`,
    transcript_excerpt: "",
    anchors: [],
    evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } },
    status
  };
}

const UNITS = [unit("a", "applied"), unit("b", "applied"), unit("c", "blocked"), unit("d", "needs_info"), unit("e", "withdrawn")];

describe("EndedCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<EndedCardProps> = {}) => {
    await act(async () => {
      root.render(<EndedCard units={UNITS} {...props} />);
    });
  };

  const count = (status: UnitStatus) => container.querySelector(`[data-riffrec-ended-count="${status}"]`);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("counts units by final status", () => {
    const counts = countByStatus(UNITS);
    expect(counts).toEqual({ initial: 0, triaging: 0, accepted: 0, needs_info: 1, applied: 2, blocked: 1, withdrawn: 1 });
    expect(residualCount(counts)).toBe(2);
  });

  it("shows the counts, points at the residual list, and never mentions a zip download", async () => {
    await render();
    expect(count("applied")!.textContent).toBe("Applied2");
    expect(count("blocked")!.textContent).toBe("Blocked1");
    expect(count("needs_info")!.textContent).toBe("Needs info1");
    expect(count("withdrawn")!.textContent).toBe("Withdrawn1");
    expect(count("initial")).toBeNull();
    expect(container.querySelector("[data-riffrec-ended-residual]")!.textContent).toMatch(/2 units need follow-up.*residual list/);
    expect(container.textContent).not.toMatch(/zip|download/i);
  });

  it("uses the consumer's residual hint and reports an endpoint-initiated end", async () => {
    await render({ residualHint: "See docs/residuals/2026-09-15.md.", reason: "owner_stopped" });
    expect(container.querySelector("[data-riffrec-ended-residual]")!.textContent).toContain("See docs/residuals/2026-09-15.md.");
    expect(container.querySelector("[data-riffrec-ended-reason]")!.textContent).toBe("Ended by the endpoint: owner_stopped");
  });

  it("hides the reason line for the riffer's own Done and dismisses on request", async () => {
    const onDismiss = vi.fn();
    await render({ units: [], reason: "riffer_done", onDismiss });
    expect(container.querySelector("[data-riffrec-ended-reason]")).toBeNull();
    expect(container.textContent).toMatch(/No units were recorded/);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-ended-dismiss]")!.click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("offers another session when the link can take one, and waits while the agent drains", async () => {
    const onStartNext = vi.fn();
    await render({ next: "draining", onStartNext });
    const button = () => container.querySelector<HTMLButtonElement>("[data-riffrec-ended-start-next]")!;
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe("Agent wrapping up…");

    await render({ next: "ready", onStartNext });
    expect(button().disabled).toBe(false);
    await act(async () => button().click());
    expect(onStartNext).toHaveBeenCalledTimes(1);

    await render({ next: null, onStartNext });
    expect(container.querySelector("[data-riffrec-ended-start-next]")).toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionMode } from "../contract";
import { ModeSwitch, PENDING_MODE_HINT, type ModeSwitchProps } from "./ModeSwitch";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("ModeSwitch", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<ModeSwitchProps> = {}) => {
    await act(async () => {
      root.render(<ModeSwitch mode="smart" pendingMode={null} onChange={() => {}} {...props} />);
    });
  };

  const option = (mode: ExecutionMode) => container.querySelector<HTMLButtonElement>(`[data-riffrec-mode-option="${mode}"]`)!;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the three positions with Smart checked by default (KTD11)", async () => {
    await render();
    expect(container.querySelectorAll("[role=radio]")).toHaveLength(3);
    expect(option("smart").getAttribute("aria-checked")).toBe("true");
    expect(option("instant").getAttribute("aria-checked")).toBe("false");
    expect(option("collect").getAttribute("aria-checked")).toBe("false");
  });

  it("reports a change once per new position and ignores clicks on the current one", async () => {
    const onChange = vi.fn();
    await render({ onChange });
    await act(async () => option("smart").click());
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => option("collect").click());
    expect(onChange).toHaveBeenCalledWith("collect");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows the pending-until-next-checkpoint hint from session state and clears it when the session does", async () => {
    await render({ mode: "collect", pendingMode: "collect" });
    const hint = container.querySelector("[data-riffrec-mode-pending]")!;
    expect(hint.getAttribute("data-riffrec-mode-pending")).toBe("collect");
    expect(hint.textContent).toBe(`Collect: ${PENDING_MODE_HINT.toLowerCase()}`);

    await render({ mode: "collect", pendingMode: null });
    expect(container.querySelector("[data-riffrec-mode-pending]")).toBeNull();
  });

  it("disables every position when the session is not running", async () => {
    const onChange = vi.fn();
    await render({ disabled: true, onChange });
    await act(async () => option("instant").click());
    expect(onChange).not.toHaveBeenCalled();
    expect(option("instant").disabled).toBe(true);
  });
});

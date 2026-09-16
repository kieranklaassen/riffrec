// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveUnit, UnitStatus } from "../contract";
import type { UnitQuestion } from "../units";
import { Board, ConfirmationPass, STATUS_LABELS, describeAnchor, type BoardProps, type ConfirmationPassProps } from "./Board";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

function unit(id: string, status: UnitStatus, statement = `Change ${id}`): LiveUnit {
  return {
    id,
    statement,
    transcript_excerpt: statement.toLowerCase(),
    anchors: [{ route: "/settings", selector: "button.save", component: "SaveButton", rect: { x: 1, y: 2, width: 3, height: 4 }, t: 10 }],
    evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 10 } },
    status
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Board", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<BoardProps> = {}) => {
    await act(async () => {
      root.render(<Board units={[]} mode="smart" {...props} />);
    });
  };

  const item = (id: string) => container.querySelector<HTMLLIElement>(`[data-riffrec-unit="${id}"]`)!;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows an empty prompt when no unit exists yet", async () => {
    await render();
    expect(container.querySelector("[data-riffrec-board-empty]")).not.toBeNull();
  });

  it("lists every unit with its current status label and first anchor", async () => {
    await render({ units: [unit("u1", "initial"), unit("u2", "triaging"), unit("u3", "accepted"), unit("u4", "blocked")] });
    for (const [id, status] of [
      ["u1", "initial"],
      ["u2", "triaging"],
      ["u3", "accepted"],
      ["u4", "blocked"]
    ] as const) {
      expect(item(id).getAttribute("data-riffrec-unit-status")).toBe(status);
      expect(item(id).textContent).toContain(STATUS_LABELS[status]);
    }
    expect(item("u1").querySelector("[data-riffrec-unit-anchor]")!.textContent).toBe("SaveButton (button.save) on /settings");
    expect(describeAnchor({ ...unit("x", "initial"), anchors: [] })).toBeNull();
  });

  it("covers AE2 and AE15: a Collect accepted unit has no applied marker; an Instant applied unit shows its guess", async () => {
    await render({ units: [unit("u1", "accepted")], mode: "collect" });
    expect(item("u1").getAttribute("data-riffrec-unit-status")).toBe("accepted");
    expect(item("u1").textContent).not.toContain(STATUS_LABELS.applied);
    expect(item("u1").querySelector("[data-riffrec-unit-guess]")).toBeNull();

    await render({ units: [unit("u2", "applied", "Make the header nicer")], mode: "instant", guesses: { u2: "Tightened spacing and used the brand accent." } });
    expect(item("u2").getAttribute("data-riffrec-unit-status")).toBe("applied");
    expect(item("u2").querySelector("[data-riffrec-unit-guess]")!.textContent).toContain("Tightened spacing and used the brand accent.");
  });

  it("covers AE3: a blocked unit shows the agent's reason", async () => {
    await render({ units: [unit("u1", "blocked", "Rethink the onboarding flow")], notes: { u1: "Beyond polish: sent to the residual list." } });
    expect(item("u1").querySelector("[data-riffrec-unit-note]")!.textContent).toBe("Beyond polish: sent to the residual list.");
  });

  it("strikes through withdrawn units and hides their anchor", async () => {
    await render({ units: [unit("u1", "withdrawn")] });
    const statement = item("u1").querySelector<HTMLElement>("[data-riffrec-unit-statement]")!;
    expect(statement.style.textDecoration).toBe("line-through");
    expect(item("u1").querySelector("[data-riffrec-unit-anchor]")).toBeNull();
  });

  it("offers withdraw on initial units only before release, and reports the id", async () => {
    const onWithdraw = vi.fn();
    await render({
      units: [unit("u1", "initial"), unit("u2", "initial"), unit("u3", "triaging")],
      isReleased: (id) => id === "u2",
      onWithdraw
    });
    expect(item("u1").querySelector("[data-riffrec-unit-withdraw]")).not.toBeNull();
    expect(item("u2").querySelector("[data-riffrec-unit-withdraw]")).toBeNull();
    expect(item("u3").querySelector("[data-riffrec-unit-withdraw]")).toBeNull();

    await act(async () => item("u1").querySelector<HTMLButtonElement>("[data-riffrec-unit-withdraw]")!.click());
    expect(onWithdraw).toHaveBeenCalledWith("u1");
  });

  it("shows the open question inline and emits a typed answer, primary when no voice runs", async () => {
    const onAnswer = vi.fn();
    const questions: UnitQuestion[] = [
      { unit_id: "u1", question: "Which header variant?", t: 100, answered: false },
      { unit_id: "u2", question: "Old one", t: 50, answered: true }
    ];
    await render({ units: [unit("u1", "needs_info"), unit("u2", "accepted")], questions, onAnswer, voice: false });

    expect(item("u1").querySelector("[data-riffrec-unit-question]")!.textContent).toContain("Which header variant?");
    expect(item("u2").querySelector("[data-riffrec-unit-question]")).toBeNull();

    const form = item("u1").querySelector<HTMLFormElement>("[data-riffrec-unit-reply]")!;
    const input = form.querySelector<HTMLInputElement>("input")!;
    expect(input.placeholder).toBe("Type your answer");
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(submit.disabled).toBe(true);

    await act(async () => setInputValue(input, "  the compact one "));
    expect(submit.disabled).toBe(false);
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(onAnswer).toHaveBeenCalledWith("u1", "the compact one");
    expect(input.value).toBe("");
  });
});

describe("ConfirmationPass", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<ConfirmationPassProps> = {}) => {
    await act(async () => {
      root.render(<ConfirmationPass units={[]} onComplete={() => {}} onCancel={() => {}} {...props} />);
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("defaults every unit to confirmed and reports the edited map on finish", async () => {
    const onComplete = vi.fn();
    await render({ units: [unit("u1", "applied"), unit("u2", "accepted")], onComplete });

    const u2 = container.querySelector(`[data-riffrec-confirm-unit="u2"]`)!;
    await act(async () => u2.querySelector<HTMLInputElement>("[data-riffrec-confirm-change]")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-confirm-finish]")!.click());

    expect(onComplete).toHaveBeenCalledWith({
      u1: { element: true, change: true },
      u2: { element: true, change: false }
    });
  });

  it("keeps working when a unit arrives while the pass is open and confirms it by default", async () => {
    const onComplete = vi.fn();
    await render({ units: [unit("u1", "applied")], onComplete });
    await act(async () => container.querySelector<HTMLInputElement>(`[data-riffrec-confirm-unit="u1"] [data-riffrec-confirm-element]`)!.click());

    await render({ units: [unit("u1", "applied"), unit("u2", "initial")], onComplete });
    const late = container.querySelector(`[data-riffrec-confirm-unit="u2"]`)!;
    expect(late).not.toBeNull();
    expect(late.querySelector<HTMLInputElement>("[data-riffrec-confirm-element]")!.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>(`[data-riffrec-confirm-unit="u1"] [data-riffrec-confirm-element]`)!.checked).toBe(false);

    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-confirm-finish]")!.click());
    expect(onComplete).toHaveBeenCalledWith({
      u1: { element: false, change: true },
      u2: { element: true, change: true }
    });
  });

  it("lets the riffer keep riffing instead", async () => {
    const onCancel = vi.fn();
    await render({ units: [unit("u1", "initial")], onCancel });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-confirm-cancel]")!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("finishes with nothing to confirm and disables the buttons while busy", async () => {
    const onComplete = vi.fn();
    await render({ units: [], onComplete });
    expect(container.textContent).toMatch(/No units this session/);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-confirm-finish]")!.click());
    expect(onComplete).toHaveBeenCalledWith({});

    await render({ units: [], busy: true });
    expect(container.querySelector<HTMLButtonElement>("[data-riffrec-confirm-finish]")!.disabled).toBe(true);
  });
});

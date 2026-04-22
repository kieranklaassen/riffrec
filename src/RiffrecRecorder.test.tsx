// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiffrecContext } from "./RiffrecProvider";
import { RiffrecRecorder } from "./RiffrecRecorder";
import type { RiffrecContextValue } from "./types";

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("RiffrecRecorder", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("requires consent before starting recording", async () => {
    const start = vi.fn(async () => {});
    const context: RiffrecContextValue = {
      start,
      stop: vi.fn(async () => null),
      status: "idle",
      isEnabled: true
    };

    await act(async () => {
      root.render(
        <RiffrecContext.Provider value={context}>
          <RiffrecRecorder />
        </RiffrecContext.Provider>
      );
    });

    await act(async () => {
      getButton("Record feedback").click();
    });

    expect(document.body.textContent).toContain("Start recording?");
    expect(getButton("Start recording").hasAttribute("disabled")).toBe(true);

    await act(async () => {
      const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
      checkbox!.click();
    });

    await act(async () => {
      getButton("Start recording").click();
    });

    expect(start).toHaveBeenCalledTimes(1);
  });
});

function getButton(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name
  );

  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }

  return button;
}

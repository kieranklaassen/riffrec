// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAI_KEY_STORAGE_KEY } from "../realtime/openaiKey";
import { KeyPrompt, needsOpenAIKey } from "./KeyPrompt";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("needsOpenAIKey", () => {
  it.each([
    [{ kind: "refused", reason: "no_key", status: 503 }, true],
    [{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 401 }, true],
    [{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 429 }, false],
    [{ kind: "refused", reason: "unauthorized", status: 401 }, false],
    [{ kind: "exhausted", reason: "network_error" }, false],
    [null, false]
  ] as const)("%j → %s", (reason, expected) => {
    expect(needsOpenAIKey(reason)).toBe(expected);
  });
});

describe("KeyPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  const type = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>("[data-riffrec-live-key-input]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("stores the pasted key and retries, then offers to forget it", async () => {
    const onRetry = vi.fn();
    await act(async () => root.render(<KeyPrompt reason={{ kind: "refused", reason: "no_key", status: 503 }} onRetry={onRetry} />));
    expect(container.querySelector("[data-riffrec-live-key-forget]")).toBeNull();

    await type("  sk-pasted  ");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-live-key-save]")!.click());
    expect(window.localStorage.getItem(OPENAI_KEY_STORAGE_KEY)).toBe("sk-pasted");
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-live-key-forget]")!.click());
    expect(window.localStorage.getItem(OPENAI_KEY_STORAGE_KEY)).toBeNull();
  });

  it("says the saved key was rejected when OpenAI refused it", async () => {
    window.localStorage.setItem(OPENAI_KEY_STORAGE_KEY, "sk-bad");
    await act(async () =>
      root.render(<KeyPrompt reason={{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 401 }} onRetry={vi.fn()} />)
    );
    expect(container.textContent).toContain("OpenAI rejected the saved key");
  });
});

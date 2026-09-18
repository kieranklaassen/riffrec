// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextSessionLauncher, type NextSessionLauncherProps } from "./NextSessionLauncher";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("NextSessionLauncher", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: NextSessionLauncherProps) => {
    await act(async () => root.render(<NextSessionLauncher {...props} />));
  };
  const button = () => container.querySelector<HTMLButtonElement>("[data-riffrec-next-session-start]")!;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("names the endpoint host and starts a session when it is ready", async () => {
    const onStart = vi.fn();
    await render({ next: { state: "ready", endpoint: "https://tunnel.example.com" }, onStart });

    expect(container.textContent).toContain("Endpoint ready");
    expect(container.textContent).toContain("tunnel.example.com");
    await act(async () => button().click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("holds the start while the agent finishes the last session", async () => {
    const onStart = vi.fn();
    await render({ next: { state: "draining", endpoint: "http://127.0.0.1:4321" }, onStart });

    expect(container.querySelector("[data-riffrec-next-session]")!.getAttribute("data-riffrec-next-session")).toBe("draining");
    expect(container.textContent).toContain("Agent is wrapping up");
    expect(button().disabled).toBe(true);
  });
});

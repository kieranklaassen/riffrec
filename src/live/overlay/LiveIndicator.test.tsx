// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionStatus } from "../session";
import { LiveIndicator, describeIndicator, deriveIndicatorState, type IndicatorState, type LiveIndicatorProps } from "./LiveIndicator";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

/** Every state of the KTD16 machine and the label the riffer reads for it. */
const MACHINE_STATES: Array<{ status: LiveSessionStatus; state: IndicatorState; label: RegExp }> = [
  { status: "idle", state: "idle", label: /Not live/ },
  { status: "consenting", state: "consenting", label: /Waiting for consent/ },
  { status: "connecting", state: "connecting", label: /Connecting/ },
  { status: "live", state: "streaming", label: /Live · streaming to polish\.local:4321/ },
  { status: "live_novoice", state: "novoice", label: /Live · no voice/ },
  { status: "buffering", state: "buffering", label: /Buffering locally · endpoint unreachable/ },
  { status: "reconnecting", state: "reconnecting", label: /Reconnecting/ },
  { status: "incompatible", state: "incompatible", label: /Incompatible endpoint · expects live\/2/ },
  { status: "ended", state: "ended", label: /Session ended/ },
  { status: "error", state: "error", label: /Error · The endpoint rejected the page token\./ }
];

describe("LiveIndicator", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<LiveIndicatorProps> = {}) => {
    await act(async () => {
      root.render(
        <LiveIndicator
          status="live"
          muted={false}
          endpoint="http://polish.local:4321"
          expectedSchemaVersion="live/2"
          error={{ reason: "unauthorized", message: "The endpoint rejected the page token." }}
          {...props}
        />
      );
    });
  };

  const label = () => container.querySelector("[data-riffrec-live-indicator-label]")!.textContent;
  const state = () => container.querySelector("[data-riffrec-live-indicator]")!.getAttribute("data-riffrec-live-indicator");

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders every state in the session machine with its label copy", async () => {
    for (const entry of MACHINE_STATES) {
      await render({ status: entry.status });
      expect(state(), entry.status).toBe(entry.state);
      expect(label(), entry.status).toMatch(entry.label);
      expect(describeIndicator({ status: entry.status, muted: false, endpoint: "http://polish.local:4321", expectedSchemaVersion: "live/2", error: null }).state).toBe(
        entry.state
      );
    }
  });

  it("layers muted, paused, and a denied microphone over a running session", () => {
    expect(deriveIndicatorState({ status: "live", muted: true })).toBe("muted");
    expect(deriveIndicatorState({ status: "live_novoice", muted: false, mic: "denied" })).toBe("muted");
    expect(deriveIndicatorState({ status: "live", muted: true, paused: true })).toBe("paused");
    expect(deriveIndicatorState({ status: "buffering", muted: true })).toBe("buffering");
    expect(deriveIndicatorState({ status: "buffering", muted: false, paused: true })).toBe("paused");
    expect(deriveIndicatorState({ status: "incompatible", muted: true, paused: true })).toBe("incompatible");
    expect(deriveIndicatorState({ status: "ended", muted: true, paused: true })).toBe("ended");
  });

  it("toggles mute through the control and flips the label back", async () => {
    const onToggleMute = vi.fn();
    await render({ muted: false, onToggleMute });
    expect(state()).toBe("streaming");

    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-live-mute]")!.click());
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    await render({ muted: true, onToggleMute });
    expect(state()).toBe("muted");
    expect(label()).toMatch(/Microphone muted/);
    expect(container.querySelector("[data-riffrec-live-mute]")!.getAttribute("aria-pressed")).toBe("true");

    await render({ muted: false, onToggleMute });
    expect(state()).toBe("streaming");
  });

  it("offers pause only while running and reports it as capture paused", async () => {
    const onTogglePause = vi.fn();
    await render({ paused: false, onTogglePause });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-riffrec-live-pause]")!.click());
    expect(onTogglePause).toHaveBeenCalledTimes(1);

    await render({ paused: true, onTogglePause });
    expect(state()).toBe("paused");
    expect(label()).toMatch(/Capture paused/);

    await render({ status: "ended", onTogglePause, onToggleMute: vi.fn() });
    expect(container.querySelector("[data-riffrec-live-pause]")).toBeNull();
    expect(container.querySelector("[data-riffrec-live-mute]")).toBeNull();
  });

  it("disables the mute control when the microphone was denied", async () => {
    await render({ status: "live_novoice", mic: "denied", onToggleMute: vi.fn() });
    expect(container.querySelector<HTMLButtonElement>("[data-riffrec-live-mute]")!.disabled).toBe(true);
  });

  it("uses the short label in compact form and hides the controls", async () => {
    await render({ compact: true, onToggleMute: vi.fn() });
    expect(label()).toBe("Live");
    expect(container.querySelector("[data-riffrec-live-mute]")).toBeNull();
  });
});

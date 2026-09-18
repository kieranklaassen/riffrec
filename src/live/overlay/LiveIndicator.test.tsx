// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionStatus } from "../session";
import { LiveIndicator, describeIndicator, deriveIndicatorState, voiceUnavailableCause, type IndicatorState, type LiveIndicatorProps } from "./LiveIndicator";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

/** Every state of the KTD16 machine and the label the riffer reads for it. */
const MACHINE_STATES: Array<{ status: LiveSessionStatus; state: IndicatorState; label: RegExp }> = [
  { status: "idle", state: "idle", label: /Not live/ },
  { status: "consenting", state: "consenting", label: /Waiting for consent/ },
  { status: "connecting", state: "connecting", label: /Connecting/ },
  { status: "live", state: "streaming", label: /Live · streaming to polish\.local:4321/ },
  { status: "live_novoice", state: "novoice", label: /Voice off · streaming to polish\.local:4321/ },
  { status: "buffering", state: "buffering", label: /Buffering locally · endpoint unreachable/ },
  { status: "reconnecting", state: "reconnecting", label: /Reconnecting/ },
  { status: "incompatible", state: "incompatible", label: /Incompatible endpoint · expects live\/2/ },
  { status: "ended", state: "ended", label: /Session ended/ },
  { status: "error", state: "error", label: /Error · The endpoint rejected the page token\./ }
];

describe("voiceUnavailableCause", () => {
  it.each([
    [{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 401 }, "OpenAI rejected the API key"],
    [{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 429 }, "OpenAI rate limit or quota reached"],
    [{ kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 500 }, "OpenAI returned an error (500)"],
    [{ kind: "refused", reason: "openai_error", status: 502 }, "couldn't reach OpenAI"],
    [{ kind: "refused", reason: "no_key", status: 503 }, "the endpoint has no OpenAI key"],
    [{ kind: "refused", reason: "unauthorized", status: 401 }, "the endpoint rejected this page's token"],
    [{ kind: "exhausted", reason: "network_error" }, "couldn't reach the endpoint"],
    [{ kind: "connect_failed", message: "ice failed" }, "couldn't connect to OpenAI Realtime"]
  ] as const)("names %j as %s", (reason, cause) => {
    expect(voiceUnavailableCause(reason)).toBe(cause);
  });

  it("puts the cause in the label and keeps the streaming note in the tooltip", () => {
    const view = describeIndicator({
      status: "live_novoice",
      muted: false,
      endpoint: "http://localhost:49169",
      voiceUnavailable: { kind: "refused", reason: "openai_error", status: 502, upstreamStatus: 401 }
    });
    expect(view.label).toBe("Voice off · OpenAI rejected the API key");
    expect(view.detail).toContain("still stream to localhost:49169");
  });
});

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

  it("labels muted and paused states on the running session", async () => {
    await render({ muted: false });
    expect(state()).toBe("streaming");

    await render({ muted: true });
    expect(state()).toBe("muted");
    expect(label()).toMatch(/Microphone muted/);

    await render({ paused: true });
    expect(state()).toBe("paused");
    expect(label()).toMatch(/Capture paused/);
  });

  it("uses the short label in compact form", async () => {
    await render({ compact: true });
    expect(label()).toBe("Live");
  });
});

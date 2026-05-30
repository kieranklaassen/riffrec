import { describe, expect, it, vi } from "vitest";
import { CaptureSession } from "../src/session/capture-session";

function createCapture() {
  return new CaptureSession({
    initialState: {
      url: "https://example.test/start",
      title: "Start",
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      canRecord: true
    },
    options: { microphone: false, captureClicks: true },
    outcomes: { screen: "captured", microphone: "disabled" },
    appVersion: "0.1.0",
    electronVersion: "42.3.0",
    viewport: { width: 1024, height: 768, device_pixel_ratio: 2, zoom_factor: 1 }
  });
}

describe("CaptureSession", () => {
  it("aligns existing event variants and native markers into exported evidence", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1500);
    const session = createCapture();
    session.addNavigation("https://example.test/checkout?token=secret");
    session.addConsoleError("checkout failed", "at pay.js:12");
    session.addMarker("Payment spinner remained visible");

    const result = session.complete(new Date(session.startedAt.getTime() + 2000));

    expect(result.eventsJson.events.map((event) => event.type)).toEqual([
      "navigation",
      "console_error"
    ]);
    expect(result.eventsJson.events[0]).toMatchObject({
      to: "https://example.test/checkout?token=[redacted]"
    });
    expect(result.contextJson.markers[0]?.label).toBe("Payment spinner remained visible");
    expect(result.eventsJson.url).toBe("https://example.test/checkout?token=[redacted]");
    expect(result.contextJson.viewport.width).toBe(1024);
    expect(result.contextJson.capture_outcomes.microphone).toBe("disabled");
    expect(result.contextJson.unavailable_signals).toContain("activity in external browser windows");
    vi.restoreAllMocks();
  });

  it("does not emit a network event when completion has no observed recording start", () => {
    const session = createCapture();
    session.completeNetwork(99, 200);

    expect(session.complete().eventsJson.events).toEqual([]);
  });

  it("redacts credentials in hash-routed final and observed URLs", () => {
    const session = createCapture();
    session.addNavigation("https://example.test/#/callback?access_token=secret&state=ok");
    session.beginNetwork(1, "GET", "https://api.example.test/#/fetch?token=secret", 1);
    session.completeNetwork(1, 200, 2);

    const completed = session.complete();
    expect(completed.eventsJson.url).toContain("access_token=[redacted]");
    expect(completed.eventsJson.events[0]).toMatchObject({
      to: "https://example.test/#/callback?access_token=[redacted]&state=ok"
    });
    expect(completed.eventsJson.events[1]).toMatchObject({
      url: "https://api.example.test/#/fetch?token=[redacted]"
    });
  });

  it("bounds outstanding request observations from untrusted pages", () => {
    const session = createCapture();
    for (let id = 0; id < 1002; id += 1) {
      session.beginNetwork(id, "GET", `https://example.test/${id}`);
    }
    const completed = session.complete();

    expect(completed.contextJson.warnings).toContain(
      "Concurrent network observation limit reached; some requests were omitted."
    );
  });
});

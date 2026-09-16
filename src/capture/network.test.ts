// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RiffrecEvent } from "../types";
import { NetworkCapture, redactUrl } from "./network";

describe("redactUrl", () => {
  it("redacts credential-like query parameters", () => {
    expect(redactUrl("/api/orders?token=abc123&client_secret=secret&safe=1")).toBe(
      "/api/orders?token=[redacted]&client_secret=[redacted]&safe=1"
    );
  });

  it("preserves absolute URLs while redacting credentials", () => {
    expect(redactUrl("https://example.com/a?api_key=abc")).toBe(
      "https://example.com/a?api_key=[redacted]"
    );
  });

  it("strips the live bootstrap keys from a fragment (KTD3)", () => {
    expect(redactUrl("https://app.test/settings#riffrec_live=pt_secret&endpoint=http%3A%2F%2F127.0.0.1%3A4310")).toBe(
      "https://app.test/settings"
    );
    expect(redactUrl("/settings?tab=a#riffrec_live=pt_secret&endpoint=http://x&section=billing")).toBe(
      "/settings?tab=a#section=billing"
    );
  });

  it("keeps unrelated fragments", () => {
    expect(redactUrl("/docs#install")).toBe("/docs#install");
  });

  it("strips the live keys even when the URL does not parse", () => {
    expect(redactUrl("http://[::1/a?token=abc#riffrec_live=pt&endpoint=http://x&keep=1")).toBe(
      "http://[::1/a?token=[redacted]#keep=1"
    );
  });
});

describe("NetworkCapture exclusions (KTD17)", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("records host requests but not the endpoint origin or api.openai.com", async () => {
    window.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    const events: RiffrecEvent[] = [];
    const capture = new NetworkCapture();
    capture.start(Date.now(), (event) => events.push(event), ["http://127.0.0.1:4310", "https://api.openai.com"]);

    await window.fetch("http://127.0.0.1:4310/events", { method: "POST" });
    await window.fetch("https://api.openai.com/v1/realtime/calls", { method: "POST" });
    await window.fetch("/api/orders?token=abc#riffrec_live=pt&endpoint=http://other.test");
    capture.stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "network_request", method: "GET", url: "/api/orders?token=[redacted]" });
  });
});

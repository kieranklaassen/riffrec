import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl, redactUrl, sanitizeClickObservation } from "../src/session/privacy";

describe("normalizeWebsiteUrl", () => {
  it("defaults ordinary hosts to https and permits local HTTP development", () => {
    expect(normalizeWebsiteUrl("example.com/checkout")).toBe("https://example.com/checkout");
    expect(normalizeWebsiteUrl("http://localhost:3000/cart")).toBe("http://localhost:3000/cart");
  });

  it("rejects insecure remote and privileged schemes", () => {
    expect(() => normalizeWebsiteUrl("http://example.com")).toThrow(/HTTPS/);
    expect(() => normalizeWebsiteUrl("file:///tmp/private")).toThrow(/HTTPS/);
    expect(() => normalizeWebsiteUrl("javascript:alert(1)")).toThrow(/HTTPS/);
  });
});

describe("redactUrl", () => {
  it("masks credential-like parameters without discarding ordinary query context", () => {
    expect(
      redactUrl("https://app.example.test/callback?code=secret&filter=open&ACCESS_TOKEN=abc")
    ).toBe(
      "https://app.example.test/callback?code=[redacted]&filter=open&ACCESS_TOKEN=[redacted]"
    );
  });
});

describe("sanitizeClickObservation", () => {
  it("bounds page-controlled text and rejects malformed messages", () => {
    const click = sanitizeClickObservation({
      component: "CheckoutButton",
      element: {
        tag: "BUTTON",
        text: "x".repeat(240),
        id: "submit",
        selector: "main > form > button"
      }
    });

    expect(click?.element.tag).toBe("button");
    expect(click?.element.text?.length).toBe(200);
    expect(sanitizeClickObservation({ element: { tag: true } })).toBeNull();
  });
});

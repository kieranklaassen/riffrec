import { describe, expect, it } from "vitest";
import {
  isAllowedWebsiteUrl,
  normalizeWebsiteUrl,
  redactUrl,
  sanitizeClickObservation,
  sanitizeConsoleMessage
} from "../src/session/privacy";

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

  it("applies the same allowlist to navigations and server redirects", () => {
    expect(isAllowedWebsiteUrl("https://shop.example.test/next")).toBe(true);
    expect(isAllowedWebsiteUrl("http://localhost:4173/callback")).toBe(true);
    expect(isAllowedWebsiteUrl("http://credential-harvest.test/redirect")).toBe(false);
    expect(isAllowedWebsiteUrl("file:///tmp/export")).toBe(false);
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

  it("masks user information and OAuth-style credential fragments", () => {
    expect(redactUrl("https://alice:password@app.example.test/#access_token=secret&state=ok")).toBe(
      "https://[redacted]:[redacted]@app.example.test/#access_token=[redacted]&state=ok"
    );
    expect(redactUrl("https://app.example.test/#/callback?access_token=secret&state=ok")).toBe(
      "https://app.example.test/#/callback?access_token=[redacted]&state=ok"
    );
  });

  it("masks OIDC and signed asset credentials while keeping non-secret URL context", () => {
    expect(
      redactUrl(
        "https://assets.example.test/file?id_token=jwt&X-Amz-Signature=sig&X-Amz-Credential=cred&key=api-key&file=logo"
      )
    ).toBe(
      "https://assets.example.test/file?id_token=[redacted]&X-Amz-Signature=[redacted]&X-Amz-Credential=[redacted]&key=[redacted]&file=logo"
    );
  });
});

describe("sanitizeConsoleMessage", () => {
  it("redacts credential parameters included in page-controlled error messages", () => {
    expect(
      sanitizeConsoleMessage(
        "failed https://bob:password@app.example.test/#access_token=secret&state=ok"
      )
    ).toBe("failed https://[redacted]:[redacted]@app.example.test/#access_token=[redacted]&state=ok");
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

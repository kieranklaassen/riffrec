import { describe, expect, it } from "vitest";
import { redactUrl } from "./network";

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
});

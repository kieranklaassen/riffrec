import { describe, expect, it } from "vitest";
import { findAuthorizedWindowSource } from "../src/session/capture-source";

describe("findAuthorizedWindowSource", () => {
  it("accepts the authoritative source or stable window identifier", () => {
    const sources = [{ id: "window:92:0" }, { id: "window:44:0" }];

    expect(findAuthorizedWindowSource(sources, "window:92:0")).toEqual({ id: "window:92:0" });
    expect(findAuthorizedWindowSource(sources, "window:44:7")).toEqual({ id: "window:44:0" });
  });

  it("fails closed when only an unrelated same-title source exists", () => {
    const sources = [{ id: "window:8:0", name: "Riffrec" }];

    expect(findAuthorizedWindowSource(sources, "window:42:0")).toBeNull();
  });
});

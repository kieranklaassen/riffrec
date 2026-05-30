import { describe, expect, it } from "vitest";
import { resolveAddressDisplay } from "../src/address-display";

describe("resolveAddressDisplay", () => {
  it("preserves a focused address while the user is typing", () => {
    expect(
      resolveAddressDisplay("https://typed.example/new", "https://current.example", true, true)
    ).toEqual({ value: "https://typed.example/new", dirty: true });
  });

  it("applies the redacted confirmed URL after submission even if the input remains focused", () => {
    expect(
      resolveAddressDisplay(
        "https://typed.example/?token=secret",
        "https://typed.example/?token=[redacted]",
        true,
        false
      )
    ).toEqual({ value: "https://typed.example/?token=[redacted]", dirty: false });
  });
});

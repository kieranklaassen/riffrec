import { describe, expect, it } from "vitest";
import { downloadSessionArchive } from "./noop";

describe("node entrypoint", () => {
  it("exports the browser download helper without using browser globals", () => {
    expect(() => downloadSessionArchive("riffrec.zip", new Blob())).toThrow(
      "Browser download APIs are not available."
    );
  });
});

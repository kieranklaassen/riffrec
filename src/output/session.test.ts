import { describe, expect, it } from "vitest";
import { createSessionDirName } from "./session";

describe("createSessionDirName", () => {
  it("uses the documented riffrec date-time prefix", () => {
    const name = createSessionDirName(new Date("2026-04-22T08:45:00"));

    expect(name).toMatch(/^riffrec-2026-04-22-0845-[a-zA-Z0-9-]{6}$/);
  });
});

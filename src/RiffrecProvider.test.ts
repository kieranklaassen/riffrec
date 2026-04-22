// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isEnabledByUrlParam } from "./RiffrecProvider";

describe("isEnabledByUrlParam", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("requires explicit provider opt-in", () => {
    window.history.replaceState(null, "", "/?riffrec=1");

    expect(isEnabledByUrlParam(undefined)).toBe(false);
    expect(isEnabledByUrlParam(false)).toBe(false);
  });

  it("uses the default riffrec param when enabled with true", () => {
    window.history.replaceState(null, "", "/?riffrec=1");

    expect(isEnabledByUrlParam(true)).toBe(true);
  });

  it("supports custom param names", () => {
    window.history.replaceState(null, "", "/?recordingDebug=yes");

    expect(isEnabledByUrlParam("recordingDebug")).toBe(true);
  });

  it("does not enable for falsey param values", () => {
    window.history.replaceState(null, "", "/?riffrec=false");

    expect(isEnabledByUrlParam(true)).toBe(false);
  });
});

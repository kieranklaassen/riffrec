// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_BOOTSTRAP_STORAGE_KEY,
  bootstrapLiveToken,
  clearStoredBootstrap,
  parseLiveFragment,
  readStoredBootstrap,
  stripLiveFragment
} from "./tokenBootstrap";

describe("parseLiveFragment", () => {
  it("reads the token and endpoint origin and leaves other params", () => {
    const parsed = parseLiveFragment("#tab=2&riffrec_live=tok_123&endpoint=http%3A%2F%2F127.0.0.1%3A4321%2F");

    expect(parsed.bootstrap).toEqual({ token: "tok_123", endpoint: "http://127.0.0.1:4321" });
    expect(parsed.rest).toBe("tab=2");
  });

  it("returns null without both keys or with a non-http endpoint", () => {
    expect(parseLiveFragment("#riffrec_live=tok").bootstrap).toBeNull();
    expect(parseLiveFragment("#endpoint=http://x").bootstrap).toBeNull();
    expect(parseLiveFragment("#riffrec_live=tok&endpoint=javascript:alert(1)").bootstrap).toBeNull();
    expect(parseLiveFragment("").bootstrap).toBeNull();
  });

  it("strips the live keys from a URL", () => {
    expect(stripLiveFragment("https://app.test/settings#riffrec_live=t&endpoint=http://e")).toBe(
      "https://app.test/settings"
    );
    expect(stripLiveFragment("https://app.test/settings#keep=1&riffrec_live=t&endpoint=http://e")).toBe(
      "https://app.test/settings#keep=1"
    );
    expect(stripLiveFragment("https://app.test/settings")).toBe("https://app.test/settings");
  });
});

describe("bootstrapLiveToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, "", "/settings?x=1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("reads the fragment, strips it before any history entry, and stores the credentials", () => {
    history.replaceState(null, "", "/settings?x=1#riffrec_live=tok_abc&endpoint=http://localhost:4321");
    const pushState = vi.spyOn(history, "pushState");
    const lengthBefore = history.length;

    const bootstrap = bootstrapLiveToken();

    expect(bootstrap).toEqual({ token: "tok_abc", endpoint: "http://localhost:4321" });
    expect(location.hash).toBe("");
    expect(location.href).toBe("http://localhost:3000/settings?x=1");
    expect(history.length).toBe(lengthBefore);
    expect(pushState).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(LIVE_BOOTSTRAP_STORAGE_KEY)!)).toEqual(bootstrap);
  });

  it("uses the unpatched replaceState even when the instance method is wrapped", () => {
    history.replaceState(null, "", "/settings#riffrec_live=tok&endpoint=http://localhost:4321");
    const patched = vi.fn();
    const original = history.replaceState;
    history.replaceState = patched as typeof history.replaceState;

    try {
      bootstrapLiveToken();
    } finally {
      history.replaceState = original;
    }

    expect(patched).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });

  it("keeps unrelated fragment params", () => {
    history.replaceState(null, "", "/settings#section=billing&riffrec_live=tok&endpoint=http://localhost:4321");

    bootstrapLiveToken();

    expect(location.hash).toBe("#section=billing");
  });

  it("falls back to stored credentials on a reload without a fragment", () => {
    sessionStorage.setItem(LIVE_BOOTSTRAP_STORAGE_KEY, JSON.stringify({ token: "stored", endpoint: "http://e.test" }));

    expect(bootstrapLiveToken()).toEqual({ token: "stored", endpoint: "http://e.test" });
    expect(readStoredBootstrap()).toEqual({ token: "stored", endpoint: "http://e.test" });

    clearStoredBootstrap();
    expect(bootstrapLiveToken()).toBeNull();
  });
});

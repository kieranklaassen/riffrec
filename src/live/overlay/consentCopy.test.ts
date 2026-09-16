import { describe, expect, it } from "vitest";
import { DEFAULT_CONSENT_PROFILE, OPENAI_DESTINATION, buildConsentCopy, describeEndpoint, resolveConsentProfile } from "./consentCopy";

const ORIGIN = "https://polish.tail1234.ts.net";

function endpointItems(copy: ReturnType<typeof buildConsentCopy>): string[] {
  return copy.destinations.find((destination) => destination.id === "endpoint")?.items ?? [];
}

describe("consentCopy", () => {
  it("names audio clips going to the endpoint only when the profile enables them", () => {
    const withClips = buildConsentCopy({ endpoint: ORIGIN, profile: { audio_clip: true } });
    const withoutClips = buildConsentCopy({ endpoint: ORIGIN });

    expect(endpointItems(withClips).some((item) => /audio clips/.test(item))).toBe(true);
    expect(endpointItems(withoutClips).some((item) => /audio clips/.test(item))).toBe(false);
  });

  it("names telemetry windows only when enabled and always lists anchors", () => {
    const copy = buildConsentCopy({ endpoint: ORIGIN, profile: { telemetry_window: true, transcript: false, frames: false } });
    const items = endpointItems(copy);
    expect(items.some((item) => /telemetry/.test(item))).toBe(true);
    expect(items.some((item) => /transcript/.test(item))).toBe(false);
    expect(items.some((item) => /screenshots/.test(item))).toBe(false);
    expect(items.some((item) => /element it points at/.test(item))).toBe(true);
  });

  it("names the fragment-supplied origin, the owner, and the log retention sentence", () => {
    const copy = buildConsentCopy({ endpoint: ORIGIN, endpointOwner: "ce-polish on Kieran's Mac mini" });
    const endpoint = copy.destinations.find((destination) => destination.id === "endpoint")!;
    expect(endpoint.to).toBe(`ce-polish on Kieran's Mac mini (${ORIGIN})`);
    expect(copy.retention).toContain(ORIGIN);
    expect(copy.retention).toMatch(/local session log .* until you delete it/);
  });

  it("names OpenAI Realtime as the microphone destination when voice can run", () => {
    const copy = buildConsentCopy({ endpoint: ORIGIN });
    const openai = copy.destinations.find((destination) => destination.id === "openai")!;
    expect(openai.to).toBe(OPENAI_DESTINATION);
    expect(openai.items.some((item) => /microphone audio/.test(item))).toBe(true);
    expect(openai.items.some((item) => /session brief/.test(item))).toBe(true);
  });

  it("omits OpenAI when the consumer says no voice runs", () => {
    const copy = buildConsentCopy({ endpoint: ORIGIN, voice: false });
    expect(copy.destinations.map((destination) => destination.id)).toEqual(["endpoint"]);
  });

  it("describes the local-archive shape when no endpoint is configured", () => {
    const copy = buildConsentCopy({ endpoint: null });
    expect(copy.destinations.map((destination) => destination.id)).toEqual(["local"]);
    expect(copy.retention).toBeNull();
    expect(copy.intro).toMatch(/nothing streams/);
  });

  it("says screenshots exclude nothing and that capture can be paused (R25)", () => {
    const copy = buildConsentCopy({ endpoint: ORIGIN });
    expect(copy.noExclusions).toMatch(/exclude nothing automatically/);
    expect(copy.noExclusions).toMatch(/pause/);
  });

  it("resolves partial profiles over the R19 default", () => {
    expect(resolveConsentProfile()).toEqual(DEFAULT_CONSENT_PROFILE);
    expect(resolveConsentProfile({ audio_clip: true })).toEqual({ ...DEFAULT_CONSENT_PROFILE, audio_clip: true });
    expect(describeEndpoint(null)).toBe("no endpoint");
    expect(describeEndpoint(ORIGIN)).toBe(ORIGIN);
    expect(describeEndpoint(null, "the dashboard")).toBe("the dashboard");
  });
});

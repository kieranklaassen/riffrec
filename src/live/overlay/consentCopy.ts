/**
 * Consent copy derived from the active evidence profile, the resolved endpoint
 * origin, and who owns it (R22, R25, R26). Pure data so the dialog and the
 * tests share one source of truth.
 *
 * The profile shape here is the consent-relevant view of the evidence profile
 * U6 declares per session: which optional artifacts leave the page. Anchors
 * are part of every unit regardless of profile and are always listed.
 */

export interface ConsentEvidenceProfile {
  transcript: boolean;
  strokes: boolean;
  frames: boolean;
  audio_clip: boolean;
  telemetry_window: boolean;
}

/** R19 starting default: transcript excerpt, anchors, structured strokes, one composited frame. */
export const DEFAULT_CONSENT_PROFILE: ConsentEvidenceProfile = {
  transcript: true,
  strokes: true,
  frames: true,
  audio_clip: false,
  telemetry_window: false
};

export interface ConsentCopyInput {
  profile?: Partial<ConsentEvidenceProfile>;
  /** Resolved endpoint origin (fragment or `live.endpoint`); null when nothing streams. */
  endpoint: string | null;
  /** Named owner of the endpoint (R26); defaults to the origin itself. */
  endpointOwner?: string;
  /** Whether a voice interviewer runs (an endpoint exists to mint its secret, and the riffer left voice on). */
  voice?: boolean;
  /** Whether the microphone is asked for at all; false once the riffer turned voice off. Defaults to true. */
  microphone?: boolean;
}

export interface ConsentDestination {
  /** Stable key for tests and rendering. */
  id: "openai" | "endpoint" | "local";
  to: string;
  items: string[];
}

export interface ConsentCopy {
  title: string;
  intro: string;
  destinations: ConsentDestination[];
  retention: string | null;
  noExclusions: string;
  microphone: string;
  acceptLabel: string;
  declineLabel: string;
}

export const OPENAI_DESTINATION = "OpenAI, for the voice interviewer";

export function resolveConsentProfile(profile?: Partial<ConsentEvidenceProfile>): ConsentEvidenceProfile {
  return { ...DEFAULT_CONSENT_PROFILE, ...(profile ?? {}) };
}

export function describeEndpoint(endpoint: string | null, owner?: string): string {
  if (owner && endpoint) return `${owner} (${endpoint})`;
  if (owner) return owner;
  return endpoint ?? "no endpoint";
}

function endpointItems(profile: ConsentEvidenceProfile, voice: boolean): string[] {
  const items: string[] = ["each change you ask for, with the element it points at"];
  if (profile.transcript && voice) items.push("the transcript of what you say");
  items.push("clicks, navigation, network URLs and statuses, console errors");
  if (profile.strokes) items.push("your drawings and pins");
  if (profile.frames) items.push("screenshots and annotated frames");
  if (profile.audio_clip && voice) items.push("short audio clips of each request");
  if (profile.telemetry_window) items.push("network and console telemetry around each request");
  return items;
}

export function buildConsentCopy(input: ConsentCopyInput): ConsentCopy {
  const profile = resolveConsentProfile(input.profile);
  const streams = input.endpoint !== null;
  const microphone = input.microphone ?? true;
  const voice = (input.voice ?? streams) && streams && microphone;
  const endpointName = describeEndpoint(input.endpoint, input.endpointOwner);
  const destinations: ConsentDestination[] = [];

  if (voice) {
    const items = ["your microphone audio while live", "the session brief about this app", "what you click, draw and pin"];
    if (profile.frames) items.push("screenshots when you point at something");
    destinations.push({ id: "openai", to: OPENAI_DESTINATION, items });
  }

  if (streams) {
    destinations.push({ id: "endpoint", to: endpointName, items: endpointItems(profile, voice) });
  } else {
    destinations.push({
      id: "local",
      to: "a local archive on this device",
      items: [
        microphone ? "screen recording and microphone audio" : "screen recording",
        "clicks, navigation, network URLs and statuses, console errors",
        "your drawings and pins"
      ]
    });
  }

  return {
    title: "Start a live session",
    intro: streams
      ? "Talk through what you want changed and point at it. The agent picks it up as you go."
      : "No endpoint is configured, so nothing streams: the session is saved as a local archive when you stop.",
    destinations,
    retention: streams ? `Kept in a local session log at ${endpointName} until you delete it.` : null,
    noExclusions: profile.frames
      ? "Screenshots don't blur anything: whatever is visible can appear. Press P any time to pause capture."
      : "Press P any time to pause capture.",
    microphone: voice
      ? "Your browser will ask for microphone access. Say no and the session still runs with drawing and the board; the interviewer just won't listen."
      : microphone
        ? "Your browser will ask for microphone access for the local recording. Say no and the session still runs with drawing and the board."
        : "Voice is off, so no microphone needed. You'll draw and pin; the board collects what you ask for.",
    acceptLabel: microphone ? "Allow microphone & start" : "Start session",
    declineLabel: "Not now"
  };
}

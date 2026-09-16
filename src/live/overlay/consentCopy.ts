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
  /** Whether a voice interviewer can run (an endpoint exists to mint its secret). */
  voice?: boolean;
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

export const OPENAI_DESTINATION = "OpenAI Realtime (the voice interviewer)";

export function resolveConsentProfile(profile?: Partial<ConsentEvidenceProfile>): ConsentEvidenceProfile {
  return { ...DEFAULT_CONSENT_PROFILE, ...(profile ?? {}) };
}

export function describeEndpoint(endpoint: string | null, owner?: string): string {
  if (owner && endpoint) return `${owner} (${endpoint})`;
  if (owner) return owner;
  return endpoint ?? "no endpoint";
}

function endpointItems(profile: ConsentEvidenceProfile): string[] {
  const items: string[] = [];
  if (profile.transcript) items.push("the transcript of what you say");
  items.push("units: each change you ask for, with the element it points at");
  items.push("clicks, navigation, network URLs and statuses, console errors");
  if (profile.strokes) items.push("your drawings and pins, with the element under them");
  if (profile.frames) items.push("screenshots and annotated frames of the page");
  if (profile.audio_clip) items.push("short audio clips of each request");
  if (profile.telemetry_window) items.push("network and console telemetry around each request");
  return items;
}

export function buildConsentCopy(input: ConsentCopyInput): ConsentCopy {
  const profile = resolveConsentProfile(input.profile);
  const streams = input.endpoint !== null;
  const voice = input.voice ?? streams;
  const endpointName = describeEndpoint(input.endpoint, input.endpointOwner);
  const destinations: ConsentDestination[] = [];

  if (voice && streams) {
    destinations.push({
      id: "openai",
      to: OPENAI_DESTINATION,
      items: ["microphone audio while the session is live", "the session brief the endpoint wrote about this app"]
    });
  }

  if (streams) {
    destinations.push({ id: "endpoint", to: endpointName, items: endpointItems(profile) });
  } else {
    destinations.push({
      id: "local",
      to: "a local archive on this device",
      items: ["screen recording and microphone audio", "clicks, navigation, network URLs and statuses, console errors", "your drawings and pins"]
    });
  }

  return {
    title: "Start a live session?",
    intro: streams
      ? "While the session is live, riffrec streams what you say and do on this page as it happens."
      : "No endpoint is configured, so nothing streams: the session is saved as a local archive when you stop.",
    destinations,
    retention: streams
      ? `${endpointName} keeps a local session log with everything listed above until you delete it.`
      : null,
    noExclusions:
      "Screenshots and frames exclude nothing automatically: anything visible on the page can appear in them. You can pause frame and stream capture at any time from the live indicator.",
    microphone: voice
      ? "Accepting asks your browser for microphone access. If you decline the microphone, the session continues with drawing and the board only."
      : "Accepting asks your browser for microphone access for the local recording. If you decline the microphone, the session continues with drawing and the board only.",
    acceptLabel: "Accept and start",
    declineLabel: "Not now"
  };
}

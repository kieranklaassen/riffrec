import type { FrameKind, LiveUnit } from "../contract";

/**
 * The evidence profile (R19, R21): what a unit carries on the wire. Anchors
 * and the transcript span are always present; everything else is declared per
 * session by the consumer. The archive and `/session/end` keep full evidence
 * regardless (KTD22), so the profile shapes only the `unit` and `frame`
 * envelopes the session posts.
 */

/**
 * Which frames leave the page:
 * - `none`: no `frame` envelope is posted and units ship with empty `frame_ids`.
 * - `one`: a unit carries one frame — its first composite when it has one,
 *   otherwise the gesture frame nearest its first anchor — and only frames a
 *   unit references (plus every composite) are posted.
 * - `all`: every buffered frame is posted and units keep every reference.
 */
export type EvidenceFrames = "none" | "one" | "all";

export interface EvidenceProfile {
  transcript_excerpt: boolean;
  /** Structured strokes and pins (`annotation_ids`). */
  strokes: boolean;
  frames: EvidenceFrames;
  telemetry_window: boolean;
  audio_clip: boolean;
}

export type EvidenceProfileName = "anchors_transcript_only" | "default" | "full";

export const EVIDENCE_PROFILE_NAMES: readonly EvidenceProfileName[] = ["anchors_transcript_only", "default", "full"];

export const ANCHORS_TRANSCRIPT_ONLY_PROFILE: EvidenceProfile = {
  transcript_excerpt: true,
  strokes: false,
  frames: "none",
  telemetry_window: false,
  audio_clip: false
};

/** R19's starting default: transcript excerpt, anchors, structured strokes, one composited frame. */
export const DEFAULT_EVIDENCE_PROFILE: EvidenceProfile = {
  transcript_excerpt: true,
  strokes: true,
  frames: "one",
  telemetry_window: false,
  audio_clip: false
};

export const FULL_EVIDENCE_PROFILE: EvidenceProfile = {
  transcript_excerpt: true,
  strokes: true,
  frames: "all",
  telemetry_window: true,
  audio_clip: true
};

export const EVIDENCE_PROFILES: Readonly<Record<EvidenceProfileName, EvidenceProfile>> = {
  anchors_transcript_only: ANCHORS_TRANSCRIPT_ONLY_PROFILE,
  default: DEFAULT_EVIDENCE_PROFILE,
  full: FULL_EVIDENCE_PROFILE
};

export type EvidenceProfileInput = EvidenceProfileName | Partial<EvidenceProfile> | null | undefined;

export function isEvidenceProfileName(value: unknown): value is EvidenceProfileName {
  return typeof value === "string" && (EVIDENCE_PROFILE_NAMES as readonly string[]).includes(value);
}

/** A name picks a preset; a partial overlays the default; nothing yields the default. */
export function resolveEvidenceProfile(input: EvidenceProfileInput): EvidenceProfile {
  if (!input) return { ...DEFAULT_EVIDENCE_PROFILE };
  if (typeof input === "string") return { ...EVIDENCE_PROFILES[input] };
  return { ...DEFAULT_EVIDENCE_PROFILE, ...input };
}

/** What `addFrame` does with a frame of this kind under the profile. */
export type FrameWirePolicy = "post" | "hold" | "never";

export function frameWirePolicy(kind: FrameKind, profile: EvidenceProfile): FrameWirePolicy {
  switch (profile.frames) {
    case "none":
      return "never";
    case "all":
      return "post";
    case "one":
      return kind === "composite" ? "post" : "hold";
    default: {
      const exhaustive: never = profile.frames;
      return exhaustive;
    }
  }
}

/** Frames a unit references, in wire order; the first is the one a `one` profile keeps. */
export function selectUnitFrames(
  frameIds: readonly string[],
  profile: EvidenceProfile,
  frameKind: (frameId: string) => FrameKind | null
): string[] {
  switch (profile.frames) {
    case "none":
      return [];
    case "all":
      return [...frameIds];
    case "one": {
      const composite = frameIds.find((id) => frameKind(id) === "composite");
      const chosen = composite ?? frameIds[0];
      return chosen ? [chosen] : [];
    }
    default: {
      const exhaustive: never = profile.frames;
      return exhaustive;
    }
  }
}

/**
 * The unit as it leaves the page. The local unit keeps full evidence; this
 * copy drops what the profile does not enable.
 */
export function applyEvidenceProfile(
  unit: LiveUnit,
  profile: EvidenceProfile,
  frameKind: (frameId: string) => FrameKind | null = () => null
): LiveUnit {
  const { telemetry_window, audio_clip_id, ...evidence } = unit.evidence;
  return {
    ...unit,
    transcript_excerpt: profile.transcript_excerpt ? unit.transcript_excerpt : "",
    evidence: {
      ...evidence,
      frame_ids: selectUnitFrames(unit.evidence.frame_ids, profile, frameKind),
      annotation_ids: profile.strokes ? [...unit.evidence.annotation_ids] : [],
      ...(profile.telemetry_window && telemetry_window ? { telemetry_window } : {}),
      ...(profile.audio_clip && audio_clip_id ? { audio_clip_id } : {})
    }
  };
}

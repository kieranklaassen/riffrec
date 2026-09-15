import { describe, expect, it } from "vitest";
import type { LiveUnit } from "../contract";
import {
  ANCHORS_TRANSCRIPT_ONLY_PROFILE,
  DEFAULT_EVIDENCE_PROFILE,
  FULL_EVIDENCE_PROFILE,
  applyEvidenceProfile,
  frameWirePolicy,
  isEvidenceProfileName,
  resolveEvidenceProfile,
  selectUnitFrames
} from "./profile";

const unit: LiveUnit = {
  id: "unit_0001",
  statement: "Move the toggle into the header",
  transcript_excerpt: "this toggle should live up in the header",
  anchors: [{ route: "/settings", selector: "button.toggle", component: "Toggle", rect: { x: 1, y: 2, width: 3, height: 4 }, t: 100 }],
  evidence: {
    frame_ids: ["frame_gesture", "frame_composite", "frame_periodic"],
    annotation_ids: ["ann_0001", "ann_0002"],
    transcript_span: { t_start: 100, t_end: 2400 },
    telemetry_window: { t_start: 0, t_end: 12400, events: [] },
    audio_clip_id: "clip_0001"
  },
  status: "initial"
};

const kinds: Record<string, "gesture" | "composite" | "periodic"> = {
  frame_gesture: "gesture",
  frame_composite: "composite",
  frame_periodic: "periodic"
};
const frameKind = (id: string) => kinds[id] ?? null;

describe("resolveEvidenceProfile", () => {
  it("returns the R19 default for nothing, a preset for a name, and overlays a partial", () => {
    expect(resolveEvidenceProfile(undefined)).toEqual(DEFAULT_EVIDENCE_PROFILE);
    expect(resolveEvidenceProfile(null)).toEqual(DEFAULT_EVIDENCE_PROFILE);
    expect(resolveEvidenceProfile("full")).toEqual(FULL_EVIDENCE_PROFILE);
    expect(resolveEvidenceProfile("anchors_transcript_only")).toEqual(ANCHORS_TRANSCRIPT_ONLY_PROFILE);
    expect(resolveEvidenceProfile({ audio_clip: true })).toEqual({ ...DEFAULT_EVIDENCE_PROFILE, audio_clip: true });
  });

  it("returns copies so callers cannot mutate the presets", () => {
    const profile = resolveEvidenceProfile("default");
    profile.strokes = false;
    expect(DEFAULT_EVIDENCE_PROFILE.strokes).toBe(true);
  });

  it("recognises profile names", () => {
    expect(isEvidenceProfileName("default")).toBe(true);
    expect(isEvidenceProfileName("everything")).toBe(false);
    expect(isEvidenceProfileName(3)).toBe(false);
  });
});

describe("applyEvidenceProfile", () => {
  it("anchors_transcript_only serializes a unit without frames or strokes", () => {
    const wire = applyEvidenceProfile(unit, ANCHORS_TRANSCRIPT_ONLY_PROFILE, frameKind);

    expect(wire.transcript_excerpt).toBe(unit.transcript_excerpt);
    expect(wire.anchors).toEqual(unit.anchors);
    expect(wire.evidence.frame_ids).toEqual([]);
    expect(wire.evidence.annotation_ids).toEqual([]);
    expect(wire.evidence.telemetry_window).toBeUndefined();
    expect(wire.evidence.audio_clip_id).toBeUndefined();
    expect(wire.evidence.transcript_span).toEqual(unit.evidence.transcript_span);
  });

  it("the default profile includes one composite and the strokes, no clip or telemetry", () => {
    const wire = applyEvidenceProfile(unit, DEFAULT_EVIDENCE_PROFILE, frameKind);

    expect(wire.evidence.frame_ids).toEqual(["frame_composite"]);
    expect(wire.evidence.annotation_ids).toEqual(["ann_0001", "ann_0002"]);
    expect(wire.evidence.telemetry_window).toBeUndefined();
    expect(wire.evidence.audio_clip_id).toBeUndefined();
  });

  it("falls back to the first buffered frame under the default profile when a unit has no composite", () => {
    const noComposite: LiveUnit = { ...unit, evidence: { ...unit.evidence, frame_ids: ["frame_gesture", "frame_periodic"] } };

    expect(applyEvidenceProfile(noComposite, DEFAULT_EVIDENCE_PROFILE, frameKind).evidence.frame_ids).toEqual(["frame_gesture"]);
  });

  it("the full profile keeps everything, and an audio clip only when enabled", () => {
    const wire = applyEvidenceProfile(unit, FULL_EVIDENCE_PROFILE, frameKind);

    expect(wire).toEqual(unit);
    expect(applyEvidenceProfile(unit, { ...FULL_EVIDENCE_PROFILE, audio_clip: false }, frameKind).evidence.audio_clip_id).toBeUndefined();
  });

  it("does not mutate the local unit", () => {
    const before = JSON.stringify(unit);
    applyEvidenceProfile(unit, ANCHORS_TRANSCRIPT_ONLY_PROFILE, frameKind);
    expect(JSON.stringify(unit)).toBe(before);
  });

  it("blanks the transcript excerpt when the profile disables it", () => {
    expect(applyEvidenceProfile(unit, { ...DEFAULT_EVIDENCE_PROFILE, transcript_excerpt: false }).transcript_excerpt).toBe("");
  });
});

describe("frame policies", () => {
  it("frameWirePolicy posts composites at once and holds gesture frames under `one`", () => {
    expect(frameWirePolicy("composite", DEFAULT_EVIDENCE_PROFILE)).toBe("post");
    expect(frameWirePolicy("gesture", DEFAULT_EVIDENCE_PROFILE)).toBe("hold");
    expect(frameWirePolicy("periodic", DEFAULT_EVIDENCE_PROFILE)).toBe("hold");
    expect(frameWirePolicy("gesture", FULL_EVIDENCE_PROFILE)).toBe("post");
    expect(frameWirePolicy("composite", ANCHORS_TRANSCRIPT_ONLY_PROFILE)).toBe("never");
  });

  it("selectUnitFrames keeps every reference under `all` and none under `none`", () => {
    expect(selectUnitFrames(unit.evidence.frame_ids, FULL_EVIDENCE_PROFILE, frameKind)).toEqual(unit.evidence.frame_ids);
    expect(selectUnitFrames(unit.evidence.frame_ids, ANCHORS_TRANSCRIPT_ONLY_PROFILE, frameKind)).toEqual([]);
    expect(selectUnitFrames([], DEFAULT_EVIDENCE_PROFILE, frameKind)).toEqual([]);
  });
});

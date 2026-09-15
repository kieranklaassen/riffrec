import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveAnnotation } from "../contract";
import { ATTACH_LOOKBACK_MS, AnnotationAttacher, DRAWING_ONLY_AFTER_SPEECH_MS } from "./attach";

function stroke(id: string): LiveAnnotation {
  return {
    id,
    kind: "stroke",
    points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
    bbox: { x: 0, y: 0, width: 5, height: 5 },
    anchor: { route: "/", selector: ".card", rect: { x: 0, y: 0, width: 5, height: 5 }, t: 0 }
  };
}

function harness() {
  let clock = 0;
  let units = 0;
  const drawingOnly: string[] = [];
  const created: Array<{ unitId: string; claimed: string[] }> = [];
  const attacher = new AnnotationAttacher({
    now: () => clock,
    onHeldExpired: (annotation) => {
      const unitId = `unit_draw_${++units}`;
      drawingOnly.push(`${annotation.id}->${unitId}`);
      return unitId;
    }
  });
  return {
    attacher,
    drawingOnly,
    created,
    advance(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    recordUnit(id: string): string[] {
      let claimedIds: string[] = [];
      attacher.unitExtracted((claimed) => {
        claimedIds = claimed.map((annotation) => annotation.id);
        created.push({ unitId: id, claimed: claimedIds });
        return id;
      });
      return claimedIds;
    }
  };
}

describe("AnnotationAttacher (KTD10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers AE4: a stroke 2 s after a unit attaches to it; one 6 s after is a drawing-only unit", () => {
    const h = harness();
    h.recordUnit("unit_1");

    h.advance(2000);
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "attached", unitId: "unit_1" });

    h.advance(4000);
    expect(h.attacher.annotationCompleted(stroke("ann_2"))).toEqual({ kind: "drawing_only" });
    expect(h.drawingOnly).toEqual([]);
  });

  it("the look-back boundary is inclusive at 4 s", () => {
    const h = harness();
    h.recordUnit("unit_1");
    h.advance(ATTACH_LOOKBACK_MS);
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "attached", unitId: "unit_1" });
    h.advance(1);
    expect(h.attacher.annotationCompleted(stroke("ann_2"))).toEqual({ kind: "drawing_only" });
  });

  it("with no unit ever extracted a stroke in silence is a drawing-only unit", () => {
    const h = harness();
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "drawing_only" });
  });

  it("covers R16: a stroke completed mid-utterance is held and claimed by that utterance's record_unit", () => {
    const h = harness();
    h.attacher.speechStarted();
    h.advance(800);
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "held" });
    expect(h.attacher.heldAnnotations().map((annotation) => annotation.id)).toEqual(["ann_1"]);
    h.advance(1200);
    h.attacher.speechStopped();
    h.advance(900);

    expect(h.recordUnit("unit_1")).toEqual(["ann_1"]);
    expect(h.attacher.heldAnnotations()).toEqual([]);
    expect(h.attacher.isUtteranceOpen).toBe(false);
    expect(h.drawingOnly).toEqual([]);
    h.advance(DRAWING_ONLY_AFTER_SPEECH_MS);
    expect(h.drawingOnly).toEqual([]);
  });

  it("covers R16: the hold wins over an earlier unit still inside the look-back window", () => {
    const h = harness();
    h.recordUnit("unit_earlier");
    h.advance(1000);
    h.attacher.speechStarted();
    h.advance(1000);
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "held" });
    h.advance(500);
    h.attacher.speechStopped();
    h.advance(700);

    expect(h.recordUnit("unit_current")).toEqual(["ann_1"]);
    expect(h.created).toEqual([
      { unitId: "unit_earlier", claimed: [] },
      { unitId: "unit_current", claimed: ["ann_1"] }
    ]);
  });

  it("covers R16: a held stroke with no unit within 4 s of speech_stopped opens a drawing-only unit", () => {
    const h = harness();
    h.attacher.speechStarted();
    h.attacher.annotationCompleted(stroke("ann_1"));
    h.attacher.speechStopped();

    h.advance(DRAWING_ONLY_AFTER_SPEECH_MS - 1);
    expect(h.drawingOnly).toEqual([]);
    h.advance(1);
    expect(h.drawingOnly).toEqual(["ann_1->unit_draw_1"]);
    expect(h.attacher.isUtteranceOpen).toBe(false);
    expect(h.attacher.lastUnitId).toBe("unit_draw_1");

    h.advance(1000);
    expect(h.attacher.annotationCompleted(stroke("ann_2"))).toEqual({ kind: "attached", unitId: "unit_draw_1" });
  });

  it("a stroke completed in the gap between speech_stopped and record_unit is still held", () => {
    const h = harness();
    h.attacher.speechStarted();
    h.attacher.speechStopped();
    h.advance(1500);
    expect(h.attacher.annotationCompleted(stroke("ann_1"))).toEqual({ kind: "held" });
    expect(h.recordUnit("unit_1")).toEqual(["ann_1"]);
  });

  it("speech starting again cancels the drawing-only timer; the record_unit claims strokes from ended utterances only", () => {
    const h = harness();
    h.attacher.speechStarted();
    h.attacher.annotationCompleted(stroke("ann_first"));
    h.attacher.speechStopped();
    h.advance(3000);
    h.attacher.speechStarted();
    h.attacher.annotationCompleted(stroke("ann_second"));
    h.advance(2000);
    expect(h.drawingOnly).toEqual([]);

    expect(h.recordUnit("unit_first")).toEqual(["ann_first"]);
    expect(h.attacher.heldAnnotations().map((annotation) => annotation.id)).toEqual(["ann_second"]);
    expect(h.attacher.isUtteranceOpen).toBe(true);

    h.attacher.speechStopped();
    expect(h.recordUnit("unit_second")).toEqual(["ann_second"]);
  });

  it("dispose drops held strokes and stops timers", () => {
    const h = harness();
    h.attacher.speechStarted();
    h.attacher.annotationCompleted(stroke("ann_1"));
    h.attacher.speechStopped();
    h.attacher.dispose();
    h.advance(DRAWING_ONLY_AFTER_SPEECH_MS * 2);

    expect(h.drawingOnly).toEqual([]);
    expect(h.attacher.heldAnnotations()).toEqual([]);
    expect(h.attacher.annotationCompleted(stroke("ann_2"))).toEqual({ kind: "drawing_only" });
  });
});

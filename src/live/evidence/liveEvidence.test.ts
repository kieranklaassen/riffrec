// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiffrecEvent } from "../../types";
import { MemoryFrameStore } from "../buffer";
import type { LiveAnnotation, LiveEnvelope } from "../contract";
import { LiveSession } from "../session";
import { createFakeEndpoint } from "../testing/fakeEndpoint";
import type { ClipRecorderLike } from "./audioClip";
import type { CompositeDrawer } from "./composite";
import type { EvidenceProfileInput } from "./profile";
import { LiveEvidence, RECENT_FRAME_MS, describeAnnotation } from "./liveEvidence";

class FakeRecorder implements ClipRecorderLike {
  state: ClipRecorderLike["state"] = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ClipRecorderLike["ondataavailable"] = null;
  onstop: ClipRecorderLike["onstop"] = null;
  onerror: ClipRecorderLike["onerror"] = null;

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["pcm"], { type: this.mimeType }) });
    this.onstop?.(undefined);
  }
}

function stroke(id: string, t: number): LiveAnnotation {
  return {
    id,
    kind: "stroke",
    points: [{ x: 10, y: 10 }, { x: 60, y: 40 }],
    bbox: { x: 10, y: 10, width: 50, height: 30 },
    anchor: { route: "/settings", selector: ".card", component: "Card", rect: { x: 0, y: 0, width: 100, height: 80 }, t }
  };
}

interface HarnessOptions {
  profile?: EvidenceProfileInput;
  display?: boolean;
  mic?: boolean;
  events?: RiffrecEvent[];
  draw?: CompositeDrawer;
}

function harness(options: HarnessOptions = {}) {
  const endpoint = createFakeEndpoint();
  const started = 1_000_000;
  let clock = started;
  const now = () => clock - started;
  let grabs = 0;
  const grabber = vi.fn(async () => `jpeg-${++grabs}`);
  const session = LiveSession.create({
    bootstrap: { token: endpoint.pageToken, endpoint: endpoint.baseUrl },
    storage: null,
    frameStore: new MemoryFrameStore(),
    fetch: endpoint.fetch,
    schedule: (callback) => queueMicrotask(callback),
    route: () => "/settings",
    pageHideTarget: null,
    now: () => clock,
    sessionId: "sess_evidence",
    backoffMs: [5, 5, 5],
    evidenceProfile: options.profile
  });
  session.start();
  const events = options.events ?? [];
  const evidence = new LiveEvidence({
    session,
    now,
    route: () => "/settings",
    recentEvents: () => events,
    gestureTarget: null,
    grabber: options.display === false ? null : grabber,
    micStream: options.mic ? ({} as MediaStream) : null,
    createRecorder: () => new FakeRecorder(),
    draw:
      options.draw ??
      (async ({ base, annotations }) => `composite(${base.id}+${annotations.map((annotation) => annotation.id).join("+")})`)
  });
  return {
    endpoint,
    session,
    evidence,
    grabber,
    now,
    advance(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    async settled() {
      await vi.waitFor(() => expect(session.sequence.queueLength).toBe(0));
    },
    wire<T extends LiveEnvelope["type"]>(type: T): Array<LiveEnvelope<T>> {
      return endpoint.received.filter((envelope): envelope is LiveEnvelope<T> => envelope.type === type);
    }
  };
}

describe("LiveEvidence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("attaches the frame buffered at the click, not a frame captured when the tool call resolves", async () => {
    const h = harness();
    h.advance(1000);
    const clickFrame = await h.evidence.gesture();
    expect(clickFrame?.t).toBe(1000);
    h.advance(3000);

    const unit = h.evidence.recordUnit({
      statement: "Make the card red",
      transcript_excerpt: "make this red",
      anchors: [{ route: "/settings", selector: ".card", rect: { x: 0, y: 0, width: 1, height: 1 }, t: 1000 }]
    });

    expect(unit.evidence.frame_ids).toEqual([clickFrame!.id]);
    expect(h.session.frameMetadata()).toEqual([{ id: clickFrame!.id, t: 1000, route: "/settings", kind: "gesture" }]);
    expect(h.grabber).toHaveBeenCalledTimes(1);
    await h.settled();
    expect(h.wire("frame").map((envelope) => envelope.payload.id)).toEqual([clickFrame!.id]);
  });

  it("a unit extracted before re-share has empty frame_ids and no composite; capture resumes after the re-share hook", async () => {
    const h = harness({ display: false });
    expect(await h.evidence.gesture()).toBeNull();
    expect(await h.evidence.annotationCompleted(stroke("ann_1", 0))).toEqual({ kind: "drawing_only" });
    const drawn = h.session.allUnits()[0];
    expect(drawn.evidence.frame_ids).toEqual([]);
    expect(h.session.allAnnotations()[0].composite_frame_id).toBeUndefined();

    const spoken = h.evidence.recordUnit({ statement: "Move it", transcript_excerpt: "move it", anchors: [] });
    expect(spoken.evidence.frame_ids).toEqual([]);

    h.evidence.setFrameGrabber(h.grabber);
    expect(h.evidence.hasDisplay).toBe(true);
    const frame = await h.evidence.gesture();
    expect(frame).not.toBeNull();
    const later = h.evidence.recordUnit({ statement: "Now", transcript_excerpt: "now", anchors: [] });
    expect(later.evidence.frame_ids).toEqual([frame!.id]);
    expect(h.evidence.frames.isPeriodicRunning).toBe(true);
  });

  it("a stroke in silence with no recent unit opens a drawing-only unit with the drawing as statement, cross-referenced with its composite", async () => {
    const h = harness({ profile: "default" });
    await h.evidence.gesture();
    const annotation = stroke("ann_1", 200);

    await h.evidence.annotationCompleted(annotation);

    const [unit] = h.session.allUnits();
    expect(unit.statement).toBe("Drawing on Card (.card)");
    expect(unit.transcript_excerpt).toBe("");
    expect(unit.anchors).toEqual([annotation.anchor]);
    expect(unit.evidence.annotation_ids).toEqual(["ann_1"]);
    const [posted] = h.session.allAnnotations();
    expect(posted.unit_id).toBe(unit.id);
    expect(posted.composite_frame_id).toBeDefined();
    expect(unit.evidence.frame_ids).toEqual([posted.composite_frame_id]);
    expect(h.session.frameMetadata().map((frame) => frame.kind)).toEqual(["gesture", "composite"]);

    await h.settled();
    const wireUnit = h.wire("unit")[0].payload;
    expect(wireUnit.evidence.frame_ids).toEqual([posted.composite_frame_id]);
    expect(wireUnit.evidence.annotation_ids).toEqual(["ann_1"]);
    expect(h.wire("annotation")[0].payload).toMatchObject({ id: "ann_1", unit_id: unit.id, composite_frame_id: posted.composite_frame_id });
    expect(h.wire("frame").map((envelope) => envelope.payload.kind)).toEqual(["composite"]);
  });

  it("a composite that does not render falls back to the base view, so no unit references a missing frame", async () => {
    const h = harness({ profile: "default", draw: async () => null });
    const base = await h.evidence.gesture();

    await h.evidence.annotationCompleted(stroke("ann_1", 200));

    const [unit] = h.session.allUnits();
    const [composite] = unit.evidence.frame_ids;
    expect(h.session.allAnnotations()[0].composite_frame_id).toBe(composite);
    expect(h.session.frameMetadata().map((frame) => frame.id)).toEqual([base!.id, composite]);
    await h.settled();
    expect(h.wire("frame").map((envelope) => envelope.payload.id)).toEqual([composite]);
  });

  it("two strokes completing 10 ms apart in silence form one drawing-only unit with two composites", async () => {
    const h = harness({ profile: "default" });
    await h.evidence.gesture();
    const first = h.evidence.annotationCompleted(stroke("ann_1", 100));
    h.advance(10);
    const second = h.evidence.annotationCompleted(stroke("ann_2", 110));

    expect(await first).toEqual({ kind: "drawing_only" });
    const [unit] = h.session.allUnits();
    expect(await second).toEqual({ kind: "attached", unitId: unit.id });
    expect(h.session.allUnits()).toHaveLength(1);
    expect(h.session.unit(unit.id)?.evidence.annotation_ids).toEqual(["ann_1", "ann_2"]);
    const composites = h.session.allAnnotations().map((annotation) => annotation.composite_frame_id);
    expect(new Set(composites).size).toBe(2);
    expect(h.session.frameMetadata().filter((frame) => frame.kind === "composite").map((frame) => frame.id)).toEqual(composites);
    await h.settled();
    expect(h.wire("unit")[0].payload.evidence.frame_ids).toEqual([composites[0]]);
    expect(h.wire("annotation").map((envelope) => envelope.payload.unit_id)).toEqual([unit.id, unit.id]);
  });

  it("a stroke in silence within 4 s of a unit attaches to it and posts the annotation with unit_id", async () => {
    const h = harness();
    const unit = h.evidence.recordUnit({ statement: "Make it red", transcript_excerpt: "make it red", anchors: [] });
    h.advance(2000);

    expect(await h.evidence.annotationCompleted(stroke("ann_1", 2000))).toEqual({ kind: "attached", unitId: unit.id });

    expect(h.session.unit(unit.id)?.evidence.annotation_ids).toEqual(["ann_1"]);
    expect(h.session.allUnits()).toHaveLength(1);
    await h.settled();
    expect(h.wire("annotation")[0].payload.unit_id).toBe(unit.id);
  });

  it("a stroke completed mid-utterance is claimed by that utterance's record_unit and rides in its annotation_ids", async () => {
    const h = harness({ profile: "default" });
    await h.evidence.gesture();
    h.evidence.speechStarted();
    h.advance(700);
    expect(await h.evidence.annotationCompleted(stroke("ann_1", 700))).toEqual({ kind: "held" });
    h.advance(900);
    h.evidence.speechStopped();
    h.advance(600);

    const unit = h.evidence.recordUnit({ statement: "Move the card", transcript_excerpt: "move this", anchors: [] });

    expect(unit.evidence.annotation_ids).toEqual(["ann_1"]);
    const composite = h.session.allAnnotations()[0].composite_frame_id;
    expect(unit.evidence.frame_ids[0]).toBe(composite);
    expect(h.session.allAnnotations()[0].unit_id).toBe(unit.id);
    expect(h.session.allUnits()).toHaveLength(1);
    await h.settled();
    expect(h.wire("unit")[0].payload.evidence).toMatchObject({ annotation_ids: ["ann_1"], frame_ids: [composite] });
  });

  it("a held stroke whose utterance produced no unit becomes a drawing-only unit 4 s after speech_stopped", async () => {
    const h = harness();
    h.evidence.speechStarted();
    await h.evidence.annotationCompleted(stroke("ann_1", 100));
    h.evidence.speechStopped();
    expect(h.session.allUnits()).toEqual([]);

    h.advance(4000);

    const [unit] = h.session.allUnits();
    expect(unit.statement).toBe(describeAnnotation(stroke("ann_1", 100)));
    expect(unit.evidence.annotation_ids).toEqual(["ann_1"]);
    expect(h.session.allAnnotations()[0].unit_id).toBe(unit.id);
  });

  it("an utterance produces one clip attached to its unit; the default profile keeps it off the wire, `full` serializes it", async () => {
    const h = harness({ mic: true, profile: "default" });
    h.evidence.speechStarted();
    h.advance(1500);
    h.evidence.speechStopped();
    const unit = h.evidence.recordUnit({ statement: "Rename it", transcript_excerpt: "rename it", anchors: [] });

    expect(unit.evidence.audio_clip_id).toBe(h.evidence.clips.all()[0].id);
    expect(h.evidence.clips.all()).toHaveLength(1);
    expect(Object.keys(h.session.archiveInputs().clips ?? {})).toEqual([`${unit.evidence.audio_clip_id}.webm`]);
    await h.settled();
    expect(h.wire("unit")[0].payload.evidence.audio_clip_id).toBeUndefined();

    const full = harness({ mic: true, profile: "full" });
    full.evidence.speechStarted();
    full.evidence.speechStopped();
    const fullUnit = full.evidence.recordUnit({ statement: "Rename it", transcript_excerpt: "rename it", anchors: [] });
    await full.settled();
    expect(full.wire("unit")[0].payload.evidence.audio_clip_id).toBe(fullUnit.evidence.audio_clip_id);
    expect(full.evidence.recordUnit({ statement: "Again", transcript_excerpt: "again", anchors: [] }).evidence.audio_clip_id).toBeUndefined();
  });

  it("pause: no new frames, composites, or frame envelopes while paused; resume restores them", async () => {
    const h = harness({ profile: "full" });
    h.evidence.pause();

    expect(await h.evidence.gesture()).toBeNull();
    await h.evidence.annotationCompleted(stroke("ann_1", 10));
    expect(h.session.frameMetadata()).toEqual([]);
    expect(h.session.allAnnotations()[0].composite_frame_id).toBeUndefined();
    await h.settled();
    expect(h.wire("frame")).toEqual([]);
    expect(h.wire("annotation")).toHaveLength(1);

    h.evidence.resume();
    expect(await h.evidence.gesture()).not.toBeNull();
    await h.evidence.annotationCompleted(stroke("ann_2", 20));
    expect(h.session.frameMetadata().map((frame) => frame.kind)).toEqual(["gesture", "composite"]);
  });

  it("builds the ±10 s telemetry window from network and console events; only `full` puts it on the wire", async () => {
    const events: RiffrecEvent[] = [
      { type: "network_request", t: 500, url: "/api", method: "GET", status: 500, duration_ms: 3 },
      { type: "console_error", t: 20_500, message: "late", stack: null, component: null },
      { type: "navigation", t: 600, from: "/", to: "/settings" }
    ];
    const h = harness({ profile: "default", events });
    h.advance(2000);
    const unit = h.evidence.recordUnit({ statement: "Fix it", transcript_excerpt: "fix it", anchors: [], evidence: { transcript_span: { t_start: 1000, t_end: 2000 } } });

    expect(unit.evidence.telemetry_window).toEqual({ t_start: 0, t_end: 12_000, events: [events[0]] });
    await h.settled();
    expect(h.wire("unit")[0].payload.evidence.telemetry_window).toBeUndefined();
  });

  it("under the default profile a gesture frame reaches the wire only when a unit references it", async () => {
    const h = harness({ profile: "default" });
    const first = await h.evidence.gesture();
    h.advance(5000);
    const second = await h.evidence.gesture();
    await h.settled();
    expect(h.wire("frame")).toEqual([]);

    h.evidence.recordUnit({ statement: "This", transcript_excerpt: "this", anchors: [{ ...stroke("x", 5000).anchor }] });
    await h.settled();
    expect(h.wire("frame").map((envelope) => envelope.payload.id)).toEqual([second!.id]);
    expect(h.wire("frame")[0].seq).toBeLessThan(h.wire("unit")[0].seq);
    expect(h.session.frameMetadata().map((frame) => frame.id)).toEqual([first!.id, second!.id]);
  });

  it("lookAtScreen grabs a fresh frame the next unit attaches to, and a frame shown to the interviewer leaves the page under `one`", async () => {
    const h = harness({ profile: "default" });
    h.advance(1000);
    const look = await h.evidence.lookAtScreen();
    expect(look).toEqual({ frame: expect.objectContaining({ kind: "gesture", t: 1000, route: "/settings" }), fresh: true });
    await h.settled();
    expect(h.wire("frame")).toEqual([]);

    h.session.releaseFrame(look!.frame.id);
    await h.settled();
    expect(h.wire("frame").map((envelope) => envelope.payload.id)).toEqual([look!.frame.id]);
    h.session.releaseFrame(look!.frame.id);
    await h.settled();
    expect(h.wire("frame")).toHaveLength(1);

    h.advance(500);
    const unit = h.evidence.recordUnit({ statement: "This", transcript_excerpt: "this", anchors: [{ ...stroke("x", 1200).anchor }] });
    expect(unit.evidence.frame_ids).toEqual([look!.frame.id]);
  });

  it("lookAtScreen reuses a gesture frame grabbed a moment ago instead of encoding the screen twice", async () => {
    const h = harness();
    const atClick = await h.evidence.gesture();
    h.advance(RECENT_FRAME_MS);
    expect(await h.evidence.lookAtScreen()).toEqual({ frame: atClick, fresh: true });
    expect(h.grabber).toHaveBeenCalledTimes(1);

    h.advance(1);
    const look = await h.evidence.lookAtScreen();
    expect(look!.frame.id).not.toBe(atClick!.id);
    expect(h.grabber).toHaveBeenCalledTimes(2);
  });

  it("lookAtScreen falls back to the latest buffered frame when the grab yields nothing, and to null while paused or without a display", async () => {
    const h = harness();
    const buffered = await h.evidence.gesture();
    h.advance(RECENT_FRAME_MS + 1);
    h.grabber.mockResolvedValueOnce(null as never);
    expect(await h.evidence.lookAtScreen()).toEqual({ frame: buffered, fresh: false });

    h.evidence.pause();
    expect(await h.evidence.lookAtScreen()).toBeNull();
    h.evidence.resume();

    const dark = harness({ display: false });
    expect(await dark.evidence.lookAtScreen()).toBeNull();
    expect(dark.session.framesLeavePage).toBe(true);
    expect(harness({ profile: "anchors_transcript_only" }).session.framesLeavePage).toBe(false);
  });

  it("releaseFrame under `none` posts nothing", async () => {
    const h = harness({ profile: "anchors_transcript_only" });
    const look = await h.evidence.lookAtScreen();
    h.session.releaseFrame(look!.frame.id);
    await h.settled();
    expect(h.wire("frame")).toEqual([]);
  });

  it("dispose stops gestures, composites, and clips", async () => {
    const h = harness({ mic: true });
    h.evidence.dispose();
    expect(await h.evidence.gesture()).toBeNull();
    expect(await h.evidence.annotationCompleted(stroke("ann_1", 0))).toEqual({ kind: "drawing_only" });
    expect(h.session.allUnits()).toEqual([]);
    h.evidence.speechStarted();
    expect(h.evidence.clips.isRecording).toBe(false);
  });
});

describe("describeAnnotation", () => {
  it("names the target and, for pins, the note", () => {
    expect(describeAnnotation(stroke("a", 0))).toBe("Drawing on Card (.card)");
    expect(describeAnnotation({ ...stroke("a", 0), kind: "pin", text: "too small" })).toBe("Pin on Card (.card): too small");
    expect(describeAnnotation({ ...stroke("a", 0), kind: "pin", anchor: { ...stroke("a", 0).anchor, component: null } })).toBe("Pin on .card");
  });
});

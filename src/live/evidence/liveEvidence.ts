import type { RiffrecEvent } from "../../types";
import type { LiveAnnotation, LiveFrame, LiveTelemetryWindow, LiveUnit } from "../contract";
import type { RecordUnitInput } from "../session";
import { AnnotationAttacher, type AnnotationResolution } from "./attach";
import { AudioClipRecorder, type ClipRecorderFactory } from "./audioClip";
import { CompositeRenderer, type CompositeDrawer } from "./composite";
import { FrameBuffer, type DisplayGrabberOptions, type FrameGrabber } from "./frames";

/**
 * The evidence coordinator U7 wires between the provider, the drawing layer,
 * the voice client, and the live session. It owns the frame ring buffer, the
 * composite queue, the utterance clip recorder, and the attachment rules, and
 * it is the one place that decides what evidence a unit is recorded with.
 *
 * Wiring (U7):
 * - `setDisplayStream(screen.displayStream)` after every share; `null` when
 *   the track ends. This is the re-share hook: until it is called again after
 *   a reload, no frames or composites are produced (KTD10).
 * - `setMicStream(clone)` with a clone of the consent microphone (KTD21).
 * - `speechStarted()` / `speechStopped()` from the Realtime speech events, the
 *   same signal the session's checkpoint emitter consumes.
 * - `annotationCompleted` as the drawing layer's `onAnnotation`; the layer's
 *   `now` and `route` must be the clock and route passed here.
 * - `recordUnit` in place of `session.recordUnit` for `record_unit` tool calls.
 * - `pause()` / `resume()` from the indicator's pause control (R25).
 */

/** The session surface the coordinator needs; `LiveSession` satisfies it. */
export interface EvidenceSession {
  recordUnit(input: RecordUnitInput): LiveUnit;
  addAnnotation(annotation: LiveAnnotation): LiveAnnotation;
  attachAnnotation(annotationId: string, unitId: string): boolean;
  addFrame(frame: LiveFrame): void;
  addClip(id: string, blob: Blob): void;
  mintId(prefix: string): string;
}

export const TELEMETRY_WINDOW_MS = 10_000;

export interface LiveEvidenceOptions {
  session: EvidenceSession;
  /** Milliseconds since session start — the same clock the drawing layer stamps on anchors. */
  now: () => number;
  route?: () => string;
  /** Classic events captured so far, for the R21 telemetry window. */
  recentEvents?: () => readonly RiffrecEvent[];
  displayStream?: MediaStream | null;
  micStream?: MediaStream | null;
  /** Where anchor gestures (pointer down) are observed; null disables. Defaults to `document`. */
  gestureTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  periodicMs?: number;
  lookbackMs?: number;
  drawingOnlyMs?: number;
  displayGrabber?: DisplayGrabberOptions;
  /** Test seams. */
  grabber?: FrameGrabber | null;
  draw?: CompositeDrawer;
  createRecorder?: ClipRecorderFactory;
  onError?: (error: unknown) => void;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

/** The statement of a drawing-only unit (R16): the drawing itself, in words. */
export function describeAnnotation(annotation: LiveAnnotation): string {
  const target = annotation.anchor.component ? `${annotation.anchor.component} (${annotation.anchor.selector})` : annotation.anchor.selector;
  switch (annotation.kind) {
    case "stroke":
      return `Drawing on ${target}`;
    case "pin":
      return annotation.text ? `Pin on ${target}: ${annotation.text}` : `Pin on ${target}`;
    default: {
      const exhaustive: never = annotation.kind;
      return exhaustive;
    }
  }
}

export class LiveEvidence {
  readonly frames: FrameBuffer;
  readonly composites: CompositeRenderer;
  readonly clips: AudioClipRecorder;
  readonly attacher: AnnotationAttacher;

  private readonly session: EvidenceSession;
  private readonly now: () => number;
  private readonly recentEvents: () => readonly RiffrecEvent[];
  private readonly gestureTarget: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  private readonly displayGrabber: DisplayGrabberOptions;
  private readonly onPointerDown = (): void => {
    void this.gesture();
  };
  /** Composite frame id per annotation, for units opened after the composite settled. */
  private readonly compositeIds = new Map<string, string>();
  /** Units that claimed an annotation before its post settled. */
  private readonly claimedBy = new Map<string, string>();
  private paused = false;
  private disposed = false;

  constructor(options: LiveEvidenceOptions) {
    this.session = options.session;
    this.now = options.now;
    const route = options.route ?? currentRoute;
    this.recentEvents = options.recentEvents ?? (() => []);
    this.displayGrabber = options.displayGrabber ?? {};
    const timers = { setTimeout: options.setTimeout, clearTimeout: options.clearTimeout };
    const onError = options.onError ?? (() => {});

    this.frames = new FrameBuffer({
      now: this.now,
      route,
      createId: () => this.session.mintId("frame"),
      periodicMs: options.periodicMs,
      grabber: options.grabber ?? null,
      onFrame: (frame) => this.session.addFrame(frame),
      onError,
      ...timers
    });
    this.composites = new CompositeRenderer({
      now: this.now,
      route,
      createId: () => this.session.mintId("frame"),
      draw: options.draw,
      onError
    });
    this.clips = new AudioClipRecorder({
      now: this.now,
      createId: () => this.session.mintId("clip"),
      stream: options.micStream ?? null,
      createRecorder: options.createRecorder,
      onClip: (clip) => {
        if (clip.blob) this.session.addClip(clip.id, clip.blob);
      },
      onError
    });
    this.attacher = new AnnotationAttacher({
      now: this.now,
      onHeldExpired: (annotation) => this.openDrawingOnlyUnit(annotation),
      lookbackMs: options.lookbackMs,
      drawingOnlyMs: options.drawingOnlyMs,
      ...timers
    });

    this.gestureTarget =
      options.gestureTarget === undefined
        ? typeof document !== "undefined"
          ? document
          : null
        : options.gestureTarget;
    this.gestureTarget?.addEventListener("pointerdown", this.onPointerDown, true);

    if (options.displayStream) this.setDisplayStream(options.displayStream);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get hasDisplay(): boolean {
    return this.frames.hasSource;
  }

  /** Re-share hook: a fresh display stream resumes frames; null stops them until the next share. */
  setDisplayStream(stream: MediaStream | null): void {
    if (this.disposed) return;
    this.frames.setDisplayStream(stream, this.displayGrabber);
    if (stream) this.frames.startPeriodic();
  }

  /** Test seam mirroring `setDisplayStream` without a `MediaStream`. */
  setFrameGrabber(grabber: FrameGrabber | null): void {
    if (this.disposed) return;
    this.frames.setGrabber(grabber);
    if (grabber) this.frames.startPeriodic();
  }

  setMicStream(stream: MediaStream | null): void {
    this.clips.setStream(stream);
  }

  speechStarted(): void {
    this.attacher.speechStarted();
    this.clips.speechStarted();
  }

  speechStopped(): void {
    this.attacher.speechStopped();
    this.clips.speechStopped();
  }

  /** An anchor gesture (click, stroke start, pin): buffer a frame now (KTD10). */
  gesture(t: number = this.now()): Promise<LiveFrame | null> {
    if (this.paused) return Promise.resolve(null);
    return this.frames.capture("gesture", t);
  }

  /** R25: stop frames and composites; the screen recording and the clip recorder keep running. */
  pause(): void {
    this.paused = true;
    this.frames.pause();
  }

  resume(): void {
    this.paused = false;
    this.frames.resume();
  }

  /**
   * The drawing layer's `onAnnotation`. The attachment is resolved and any
   * drawing-only unit opened synchronously at completion time (so a second
   * stroke a moment later looks back at that unit); the composite frame id is
   * reserved up front, rendered through the queue, and the annotation posts
   * once with `composite_frame_id` and `unit_id` filled as far as known. A
   * reserved id a unit already carries always gets a frame: when the composite
   * does not render, the base view stands in for it.
   */
  async annotationCompleted(annotation: LiveAnnotation): Promise<AnnotationResolution> {
    if (this.disposed) return { kind: "drawing_only" };
    const resolution = this.attacher.annotationCompleted(annotation);
    const base = this.paused ? null : this.frames.latest();
    const compositeId = base ? this.session.mintId("frame") : null;
    if (compositeId) this.compositeIds.set(annotation.id, compositeId);
    const referenced = compositeId ? { ...annotation, composite_frame_id: compositeId } : annotation;

    let unitId: string | null = null;
    switch (resolution.kind) {
      case "held":
        break;
      case "attached":
        unitId = resolution.unitId;
        break;
      case "drawing_only":
        unitId = this.attacher.unitExtracted(() => this.createDrawingOnlyUnit(referenced, compositeId));
        break;
      default: {
        const exhaustive: never = resolution;
        return exhaustive;
      }
    }

    const composite = compositeId ? await this.composites.render(referenced, base, compositeId) : null;
    if (this.disposed) return resolution;
    if (composite) {
      this.session.addFrame(composite.frame);
    } else if (base && compositeId) {
      this.session.addFrame({ ...base, id: compositeId, kind: "composite" });
    }
    if (resolution.kind === "held") {
      unitId = this.claimedBy.get(annotation.id) ?? null;
      this.claimedBy.delete(annotation.id);
    }
    this.session.addAnnotation(unitId ? { ...referenced, unit_id: unitId } : referenced);
    return resolution;
  }

  /**
   * `record_unit`: claims held annotations, picks the buffered frame nearest
   * the first anchor, takes the utterance's clip, and builds the telemetry
   * window. The profile decides what of this leaves the page.
   */
  recordUnit(input: RecordUnitInput): LiveUnit {
    let unit: LiveUnit | null = null;
    this.attacher.unitExtracted((claimed) => {
      const claimedIds = claimed.map((annotation) => annotation.id);
      const compositeIds = claimed
        .map((annotation) => this.compositeIds.get(annotation.id))
        .filter((id): id is string => typeof id === "string");
      const firstAnchorT = input.anchors[0]?.t;
      const gestureFrame = firstAnchorT === undefined ? this.frames.latest() : this.frames.nearest(firstAnchorT);
      const span = input.evidence?.transcript_span ?? { t_start: firstAnchorT ?? this.now(), t_end: this.now() };
      const clipId = this.clips.pendingClipId();
      const telemetry = this.telemetryWindow(span.t_start, span.t_end);
      unit = this.session.recordUnit({
        ...input,
        evidence: {
          ...input.evidence,
          transcript_span: span,
          frame_ids: dedupe([...(input.evidence?.frame_ids ?? []), ...compositeIds, ...(gestureFrame ? [gestureFrame.id] : [])]),
          annotation_ids: dedupe([...(input.evidence?.annotation_ids ?? []), ...claimedIds]),
          ...(telemetry ? { telemetry_window: telemetry } : {}),
          ...(clipId ? { audio_clip_id: clipId } : {})
        }
      });
      if (clipId) this.clips.claim(unit.id);
      for (const annotation of claimed) {
        if (!this.session.attachAnnotation(annotation.id, unit.id)) this.claimedBy.set(annotation.id, unit.id);
      }
      return unit.id;
    });
    return unit!;
  }

  dispose(): void {
    this.disposed = true;
    this.gestureTarget?.removeEventListener("pointerdown", this.onPointerDown, true);
    this.frames.dispose();
    this.composites.dispose();
    this.clips.dispose();
    this.attacher.dispose();
  }

  /** A held annotation whose utterance produced no unit: it becomes its own unit (R16). */
  private openDrawingOnlyUnit(annotation: LiveAnnotation): string | null {
    if (this.disposed) return null;
    const unitId = this.createDrawingOnlyUnit(annotation, this.compositeIds.get(annotation.id) ?? null);
    if (!this.session.attachAnnotation(annotation.id, unitId)) this.claimedBy.set(annotation.id, unitId);
    return unitId;
  }

  private createDrawingOnlyUnit(annotation: LiveAnnotation, compositeId: string | null): string {
    return this.session.recordUnit({
      statement: describeAnnotation(annotation),
      transcript_excerpt: "",
      anchors: [annotation.anchor],
      evidence: {
        frame_ids: compositeId ? [compositeId] : [],
        annotation_ids: [annotation.id],
        transcript_span: { t_start: annotation.anchor.t, t_end: this.now() }
      }
    }).id;
  }

  /** R21: network and console events within ±10 s of the utterance; null when there are none. */
  private telemetryWindow(tStart: number, tEnd: number): LiveTelemetryWindow | null {
    const t_start = Math.max(0, tStart - TELEMETRY_WINDOW_MS);
    const t_end = tEnd + TELEMETRY_WINDOW_MS;
    const events = this.recentEvents().filter(
      (event) => (event.type === "network_request" || event.type === "console_error") && event.t >= t_start && event.t <= t_end
    );
    if (events.length === 0) return null;
    return { t_start, t_end, events };
  }
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

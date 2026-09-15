import type { LiveAnnotation } from "../contract";

/**
 * Stroke-to-unit attachment (R16, KTD10), resolved in one order:
 *
 * 1. **Mid-utterance hold.** A stroke completed between `speech_started` and
 *    the `record_unit` that utterance produces belongs to that unit. Because
 *    the tool call arrives only after the utterance, the stroke is held
 *    unattached until `record_unit` claims it — the hold wins even when an
 *    earlier unit is still inside the look-back window. If no unit arrives
 *    within `drawingOnlyMs` (4 s) of `speech_stopped`, the held strokes are
 *    released to `onHeldExpired`, which opens drawing-only units.
 * 2. **Silence look-back.** A stroke completed in silence attaches to the most
 *    recent unit extracted within the preceding `lookbackMs` (4 s), and is a
 *    drawing-only unit when there is none.
 *
 * The attacher decides; `LiveEvidence` posts the annotation, links it, and
 * opens units. The annotation envelope posts on completion either way, and
 * whichever unit claims it fills `unit_id`.
 */

export const ATTACH_LOOKBACK_MS = 4000;
export const DRAWING_ONLY_AFTER_SPEECH_MS = 4000;

export type AnnotationResolution =
  | { kind: "held" }
  | { kind: "attached"; unitId: string }
  | { kind: "drawing_only" };

export interface AnnotationAttacherOptions {
  /** Milliseconds since session start, the clock units and anchors share. */
  now: () => number;
  /**
   * A held annotation whose utterance produced no unit within `drawingOnlyMs`.
   * Opens a drawing-only unit and returns its id (null when none was opened);
   * that unit becomes the look-back target.
   */
  onHeldExpired: (annotation: LiveAnnotation) => string | null;
  lookbackMs?: number;
  drawingOnlyMs?: number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface HeldAnnotation {
  annotation: LiveAnnotation;
  utterance: number;
}

export class AnnotationAttacher {
  private readonly now: () => number;
  private readonly onHeldExpired: (annotation: LiveAnnotation) => string | null;
  private readonly lookbackMs: number;
  private readonly drawingOnlyMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  private speaking = false;
  /** Increments on every `speech_started`; held strokes remember theirs. */
  private utterance = 0;
  /** True from `speech_started` until `record_unit` claims or the grace timer fires. */
  private utteranceOpen = false;
  private graceTimer: unknown = null;
  private held: HeldAnnotation[] = [];
  private lastUnit: { id: string; t: number } | null = null;
  private disposed = false;

  constructor(options: AnnotationAttacherOptions) {
    this.now = options.now;
    this.onHeldExpired = options.onHeldExpired;
    this.lookbackMs = options.lookbackMs ?? ATTACH_LOOKBACK_MS;
    this.drawingOnlyMs = options.drawingOnlyMs ?? DRAWING_ONLY_AFTER_SPEECH_MS;
    this.setTimer = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get isUtteranceOpen(): boolean {
    return this.utteranceOpen;
  }

  get lastUnitId(): string | null {
    return this.lastUnit?.id ?? null;
  }

  heldAnnotations(): LiveAnnotation[] {
    return this.held.map((entry) => entry.annotation);
  }

  speechStarted(): void {
    if (this.disposed) return;
    this.speaking = true;
    this.utterance += 1;
    this.utteranceOpen = true;
    this.clearGrace();
  }

  speechStopped(): void {
    if (this.disposed || !this.speaking) return;
    this.speaking = false;
    this.clearGrace();
    this.graceTimer = this.setTimer(() => {
      this.graceTimer = null;
      this.utteranceOpen = false;
      this.releaseHeld();
    }, this.drawingOnlyMs);
  }

  /** Decides where a completed stroke or pin belongs; holds it when the riffer is mid-utterance. */
  annotationCompleted(annotation: LiveAnnotation): AnnotationResolution {
    if (this.disposed) return { kind: "drawing_only" };
    if (this.utteranceOpen) {
      this.held.push({ annotation, utterance: this.utterance });
      return { kind: "held" };
    }
    if (this.lastUnit && this.now() - this.lastUnit.t <= this.lookbackMs) {
      return { kind: "attached", unitId: this.lastUnit.id };
    }
    return { kind: "drawing_only" };
  }

  /**
   * A unit is being opened — `record_unit` arrived, or a drawing-only unit is
   * created. `create` receives the held annotations the unit claims (so they
   * ride in its `annotation_ids`) and returns the unit id, which then becomes
   * the look-back target.
   */
  unitExtracted(create: (claimed: LiveAnnotation[]) => string): string {
    const claimed = this.takeClaimable();
    const unitId = create(claimed.map((entry) => entry.annotation));
    this.lastUnit = { id: unitId, t: this.now() };
    if (!this.speaking) {
      this.utteranceOpen = false;
      this.clearGrace();
    }
    return unitId;
  }

  dispose(): void {
    this.disposed = true;
    this.clearGrace();
    this.held = [];
  }

  /**
   * Everything held from utterances that have ended. While a new utterance is
   * already in progress, its own strokes stay held for its `record_unit`.
   */
  private takeClaimable(): HeldAnnotation[] {
    if (!this.speaking) {
      const all = this.held;
      this.held = [];
      return all;
    }
    const claimable = this.held.filter((entry) => entry.utterance < this.utterance);
    this.held = this.held.filter((entry) => entry.utterance >= this.utterance);
    return claimable;
  }

  private releaseHeld(): void {
    const released = this.held;
    this.held = [];
    for (const entry of released) {
      const unitId = this.onHeldExpired(entry.annotation);
      if (unitId) this.lastUnit = { id: unitId, t: this.now() };
    }
  }

  private clearGrace(): void {
    if (this.graceTimer === null) return;
    this.clearTimer(this.graceTimer);
    this.graceTimer = null;
  }
}

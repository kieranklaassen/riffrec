import type { FrameKind, LiveFrame } from "../contract";

/**
 * Gesture-buffered and periodic screenshots (R18, KTD10).
 *
 * Frames are grabbed from the display stream into a ring buffer at every
 * anchor gesture (click, stroke start, pin) and on the periodic timer. A unit
 * takes the buffered frame nearest its first anchor timestamp, never a fresh
 * capture at tool-call time. With no display stream — before the first share,
 * after a reload until re-share, or when share was declined — nothing is
 * grabbed and units ship with empty `frame_ids`. Pause (R25) stops grabbing
 * without touching the screen recording.
 */

/** Produces the current view as base64 JPEG (no `data:` prefix), or null when nothing can be drawn. */
export type FrameGrabber = () => Promise<string | null>;

export type BufferedFrameKind = Exclude<FrameKind, "composite">;

export const FRAME_BUFFER_CAPACITY = 12;
/** Outstanding Questions default: one periodic frame every 10 seconds. */
export const PERIODIC_FRAME_MS = 10_000;
export const DEFAULT_FRAME_JPEG_QUALITY = 0.7;

export interface FrameBufferOptions {
  /** Milliseconds since session start, the clock anchors use. */
  now: () => number;
  route: () => string;
  createId: () => string;
  capacity?: number;
  periodicMs?: number;
  grabber?: FrameGrabber | null;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Receives every frame the buffer keeps, in capture order. */
  onFrame?: (frame: LiveFrame) => void;
  onError?: (error: unknown) => void;
}

export class FrameBuffer {
  private readonly frames: LiveFrame[] = [];
  private readonly capacity: number;
  private readonly periodicMs: number;
  private readonly now: () => number;
  private readonly route: () => string;
  private readonly createId: () => string;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onFrame: (frame: LiveFrame) => void;
  private readonly onError: (error: unknown) => void;
  private grabber: FrameGrabber | null;
  private periodicTimer: unknown = null;
  private paused = false;
  private disposed = false;
  private inFlight = 0;

  constructor(options: FrameBufferOptions) {
    this.now = options.now;
    this.route = options.route;
    this.createId = options.createId;
    this.capacity = options.capacity ?? FRAME_BUFFER_CAPACITY;
    this.periodicMs = options.periodicMs ?? PERIODIC_FRAME_MS;
    this.grabber = options.grabber ?? null;
    this.setTimer = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.onFrame = options.onFrame ?? (() => {});
    this.onError = options.onError ?? (() => {});
  }

  /** True while a display source exists; false yields nothing from `capture`. */
  get hasSource(): boolean {
    return this.grabber !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isPeriodicRunning(): boolean {
    return this.periodicTimer !== null;
  }

  get pendingCaptures(): number {
    return this.inFlight;
  }

  /** Swap the display source; null (stream lost, before re-share) stops the periodic timer. */
  setGrabber(grabber: FrameGrabber | null): void {
    this.grabber = grabber;
    if (!grabber) this.stopPeriodic();
  }

  /** Convenience over `setGrabber` for a `getDisplayMedia` stream. */
  setDisplayStream(stream: MediaStream | null, options: DisplayGrabberOptions = {}): void {
    this.setGrabber(stream ? createDisplayFrameGrabber(stream, options) : null);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Grab the current view; resolves null with no source, while paused, or when the grab fails. */
  async capture(kind: BufferedFrameKind, t: number = this.now()): Promise<LiveFrame | null> {
    const grabber = this.grabber;
    if (!grabber || this.paused || this.disposed) return null;
    const route = this.route();
    this.inFlight += 1;
    let jpeg: string | null = null;
    try {
      jpeg = await grabber();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight -= 1;
    }
    if (!jpeg || this.disposed) return null;
    const frame: LiveFrame = { id: this.createId(), t, route, kind, jpeg_base64: jpeg };
    this.push(frame);
    this.onFrame(frame);
    return frame;
  }

  startPeriodic(): void {
    if (this.periodicTimer !== null || this.disposed || !this.grabber) return;
    this.periodicTimer = this.setTimer(() => {
      this.periodicTimer = null;
      void this.capture("periodic").finally(() => this.startPeriodic());
    }, this.periodicMs);
  }

  stopPeriodic(): void {
    if (this.periodicTimer === null) return;
    this.clearTimer(this.periodicTimer);
    this.periodicTimer = null;
  }

  /** The buffered frame nearest `t` (a unit's first anchor); null when the buffer is empty. */
  nearest(t: number): LiveFrame | null {
    let best: LiveFrame | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const frame of this.frames) {
      const distance = Math.abs(frame.t - t);
      if (distance < bestDistance) {
        best = frame;
        bestDistance = distance;
      }
    }
    return best;
  }

  latest(): LiveFrame | null {
    return this.frames[this.frames.length - 1] ?? null;
  }

  all(): LiveFrame[] {
    return [...this.frames];
  }

  get(id: string): LiveFrame | null {
    return this.frames.find((frame) => frame.id === id) ?? null;
  }

  dispose(): void {
    this.disposed = true;
    this.stopPeriodic();
    this.grabber = null;
  }

  private push(frame: LiveFrame): void {
    this.frames.push(frame);
    while (this.frames.length > this.capacity) this.frames.shift();
  }
}

export interface DisplayGrabberOptions {
  quality?: number;
  /** Downscale wider frames to this width (Outstanding Questions: viewport size to start). */
  maxWidth?: number;
  document?: Document;
}

/** Strips the `data:image/jpeg;base64,` prefix a canvas produces. */
export function dataUrlToBase64(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.startsWith("data:image/jpeg")) return null;
  const base64 = dataUrl.slice(comma + 1);
  return base64.length > 0 ? base64 : null;
}

/**
 * Draws the display stream's current frame through a hidden `<video>` into a
 * canvas and encodes JPEG. Resolves null until the first video frame has
 * decoded or when the stream's track has ended.
 */
export function createDisplayFrameGrabber(stream: MediaStream, options: DisplayGrabberOptions = {}): FrameGrabber {
  const doc = options.document ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return async () => null;
  const quality = options.quality ?? DEFAULT_FRAME_JPEG_QUALITY;
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const ready = video.play().catch(() => {});
  const canvas = doc.createElement("canvas");

  return async () => {
    const [track] = stream.getVideoTracks();
    if (!track || track.readyState === "ended") return null;
    await ready;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const scale = options.maxWidth && width > options.maxWidth ? options.maxWidth / width : 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return dataUrlToBase64(canvas.toDataURL("image/jpeg", quality));
  };
}

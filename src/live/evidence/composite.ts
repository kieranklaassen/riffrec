import type { LiveAnnotation, LiveFrame } from "../contract";
import { strokePath } from "../overlay/DrawingLayer";

/**
 * Composited frames (R18, R20, KTD10): the current view with the riffer's
 * strokes drawn on it, one JPEG per completed annotation, rendered through a
 * serialized queue so two annotations completing back to back never share a
 * canvas. The frame and the annotation cross-reference by id: the frame is
 * `kind: "composite"` and the returned annotation carries `composite_frame_id`.
 */

export interface CompositeInput {
  /** The gesture or periodic frame the strokes are drawn over. */
  base: LiveFrame;
  annotations: readonly LiveAnnotation[];
}

/** Draws the base plus the annotations and returns base64 JPEG; null when nothing can be drawn. */
export type CompositeDrawer = (input: CompositeInput) => Promise<string | null>;

export interface CompositeResult {
  frame: LiveFrame;
  annotation: LiveAnnotation;
}

export interface CompositeRendererOptions {
  now: () => number;
  route: () => string;
  createId: () => string;
  draw?: CompositeDrawer;
  onFrame?: (frame: LiveFrame) => void;
  onError?: (error: unknown) => void;
}

export class CompositeRenderer {
  private readonly now: () => number;
  private readonly route: () => string;
  private readonly createId: () => string;
  private readonly draw: CompositeDrawer;
  private readonly onFrame: (frame: LiveFrame) => void;
  private readonly onError: (error: unknown) => void;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingCount = 0;
  private disposed = false;

  constructor(options: CompositeRendererOptions) {
    this.now = options.now;
    this.route = options.route;
    this.createId = options.createId;
    this.draw = options.draw ?? createCanvasCompositeDrawer();
    this.onFrame = options.onFrame ?? (() => {});
    this.onError = options.onError ?? (() => {});
  }

  get pending(): number {
    return this.pendingCount;
  }

  /**
   * Queue one composite for `annotation` over `base`. Resolves null when there
   * is no base frame (no display stream, KTD10) or the drawer produced nothing.
   */
  render(annotation: LiveAnnotation, base: LiveFrame | null): Promise<CompositeResult | null> {
    if (!base || this.disposed) return Promise.resolve(null);
    this.pendingCount += 1;
    const t = this.now();
    const route = this.route();
    const run = this.queue.then(async (): Promise<CompositeResult | null> => {
      if (this.disposed) return null;
      let jpeg: string | null = null;
      try {
        jpeg = await this.draw({ base, annotations: [annotation] });
      } catch (error) {
        this.onError(error);
      }
      if (!jpeg) return null;
      const frame: LiveFrame = { id: this.createId(), t, route, kind: "composite", jpeg_base64: jpeg };
      this.onFrame(frame);
      return { frame, annotation: { ...annotation, composite_frame_id: frame.id } };
    });
    this.queue = run.catch(() => undefined).finally(() => {
      this.pendingCount -= 1;
    });
    return run;
  }

  /** Resolves once every queued composite has settled. */
  idle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  dispose(): void {
    this.disposed = true;
  }
}

export const COMPOSITE_STROKE_COLOR = "#d92d20";
export const COMPOSITE_PIN_COLOR = "#1d4ed8";

function decodeJpeg(base64: string, doc: Document): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = doc.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/jpeg;base64,${base64}`;
  });
}

export interface CanvasCompositeOptions {
  quality?: number;
  document?: Document;
  /** The CSS viewport the annotation points were recorded in; defaults to `window.inner*`. */
  viewport?: () => { width: number; height: number };
}

/**
 * Canvas drawer: paints the base JPEG, then each stroke as the same
 * `perfect-freehand` outline the layer renders (so the composite matches
 * what the riffer saw) and each pin as a marker with its text.
 */
export function createCanvasCompositeDrawer(options: CanvasCompositeOptions = {}): CompositeDrawer {
  const doc = options.document ?? (typeof document !== "undefined" ? document : null);
  const quality = options.quality ?? 0.7;
  const viewport =
    options.viewport ??
    (() => ({
      width: typeof window !== "undefined" ? window.innerWidth : 0,
      height: typeof window !== "undefined" ? window.innerHeight : 0
    }));
  return async ({ base, annotations }) => {
    if (!doc || typeof Path2D === "undefined") return null;
    const image = await decodeJpeg(base.jpeg_base64, doc);
    if (!image || !image.naturalWidth || !image.naturalHeight) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const { width, height } = viewport();
    const scaleX = width > 0 ? canvas.width / width : 1;
    const scaleY = height > 0 ? canvas.height / height : 1;
    context.save();
    context.scale(scaleX, scaleY);
    for (const annotation of annotations) {
      switch (annotation.kind) {
        case "stroke": {
          context.fillStyle = COMPOSITE_STROKE_COLOR;
          context.fill(new Path2D(strokePath(annotation.points, true)));
          break;
        }
        case "pin": {
          const point = annotation.points[0];
          if (!point) break;
          context.fillStyle = COMPOSITE_PIN_COLOR;
          context.beginPath();
          context.arc(point.x, point.y, 9, 0, Math.PI * 2);
          context.fill();
          if (annotation.text) {
            context.font = "14px system-ui, sans-serif";
            context.fillStyle = "#ffffff";
            const label = annotation.text.length > 60 ? `${annotation.text.slice(0, 57)}...` : annotation.text;
            const metrics = context.measureText(label);
            context.fillRect(point.x + 14, point.y - 12, metrics.width + 12, 24);
            context.fillStyle = COMPOSITE_PIN_COLOR;
            context.fillText(label, point.x + 20, point.y + 5);
          }
          break;
        }
        default: {
          const exhaustive: never = annotation.kind;
          return exhaustive;
        }
      }
    }
    context.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const comma = dataUrl.indexOf(",");
    return comma === -1 ? null : dataUrl.slice(comma + 1);
  };
}

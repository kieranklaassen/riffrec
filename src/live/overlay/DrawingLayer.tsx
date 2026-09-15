import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { getStroke, type StrokeOptions } from "perfect-freehand";
import type { LiveAnnotation, LivePoint } from "../contract";
import { Pin, PinComposer } from "./Pin";
import { DEFAULT_DRAW_SHORTCUT, createDrawToggle } from "./shortcuts";
import { OVERLAY_ATTRIBUTE, anchorStroke, buildAnchor, buildFallbackAnchor, computeBbox, resolvePointTarget } from "./strokeAnchor";

export interface DrawingLayerProps {
  /** Marks to render; the layer is stateless about history, so a remount redraws exactly these. */
  annotations: readonly LiveAnnotation[];
  /** Fires once per completed stroke or saved pin. */
  onAnnotation: (annotation: LiveAnnotation) => void;
  /** Controlled active state; omit to let the layer own it. */
  active?: boolean;
  defaultActive?: boolean;
  onActiveChange?: (active: boolean) => void;
  /** `live.drawShortcut` (I5). `null` disables the keyboard binding. Defaults to `DEFAULT_DRAW_SHORTCUT`. */
  shortcut?: string | null;
  /** Route recorded on every anchor; defaults to the current pathname and search. */
  route?: string;
  /** Clock for `anchor.t` in milliseconds since session start; defaults to `performance.now()`. */
  now?: () => number;
  createId?: () => string;
  /** Render the floating toggle control. Defaults to `true`. */
  showToggle?: boolean;
  /** A tap (pointer down and up without movement) opens the pin composer. Defaults to `true`. */
  pinOnTap?: boolean;
  zIndex?: number;
  strokeColor?: string;
}

interface PendingPin {
  point: LivePoint;
  target: Element | null;
}

const STROKE_OPTIONS: StrokeOptions = {
  size: 6,
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.45,
  simulatePressure: true
};

const TAP_DISTANCE = 4;
const DEFAULT_Z_INDEX = 2147483000;
const DEFAULT_STROKE_COLOR = "#d92d20";

function defaultRoute(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now();
}

let idCounter = 0;

function defaultCreateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ann_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `ann_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

function toStrokeInput(points: readonly LivePoint[]): number[][] {
  return points.map((point) => [point.x, point.y, point.pressure ?? 0.5]);
}

function average(a: number, b: number): number {
  return (a + b) / 2;
}

/** Converts a `perfect-freehand` outline into a smooth closed SVG path (the library's reference snippet). */
export function getSvgPathFromStroke(outline: number[][]): string {
  const length = outline.length;
  if (length < 4) return "";

  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;

  for (let index = 2, max = length - 1; index < max; index++) {
    a = outline[index];
    b = outline[index + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
  }

  return `${result}Z`;
}

export function strokePath(points: readonly LivePoint[], last: boolean): string {
  if (points.length === 0) return "";
  return getSvgPathFromStroke(getStroke(toStrokeInput(points), { ...STROKE_OPTIONS, last }));
}

function pointFromEvent(event: ReactPointerEvent): LivePoint {
  const point: LivePoint = { x: event.clientX, y: event.clientY };
  if (event.pointerType === "pen" && Number.isFinite(event.pressure)) {
    point.pressure = event.pressure;
  }
  return point;
}

function distance(a: LivePoint, b: LivePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const rootStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none"
};

const surfaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "visible",
  touchAction: "none",
  display: "block"
};

const tintStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  boxShadow: "inset 0 0 0 3px rgba(217, 45, 32, 0.85)"
};

const toggleStyle: CSSProperties = {
  position: "absolute",
  right: 16,
  bottom: 88,
  width: 44,
  height: 44,
  borderRadius: 22,
  border: "1px solid #d0d5dd",
  background: "#ffffff",
  color: "#344054",
  boxShadow: "0 8px 24px rgba(16, 24, 40, 0.18)",
  cursor: "pointer",
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  lineHeight: 1
};

const toggleActiveStyle: CSSProperties = {
  ...toggleStyle,
  background: DEFAULT_STROKE_COLOR,
  borderColor: DEFAULT_STROKE_COLOR,
  color: "#ffffff",
  boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.35)"
};

/**
 * Full-viewport drawing surface above the host app. Active: pointer input draws
 * freehand strokes (drag) or places pins (tap) and never reaches the app. Inactive:
 * `pointer-events: none`, so the app behaves as if the layer were not there.
 */
export function DrawingLayer({
  annotations,
  onAnnotation,
  active: controlledActive,
  defaultActive = false,
  onActiveChange,
  shortcut = DEFAULT_DRAW_SHORTCUT,
  route,
  now = defaultNow,
  createId = defaultCreateId,
  showToggle = true,
  pinOnTap = true,
  zIndex = DEFAULT_Z_INDEX,
  strokeColor = DEFAULT_STROKE_COLOR
}: DrawingLayerProps) {
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActive);
  const active = controlledActive ?? uncontrolledActive;
  const [draft, setDraft] = useState<LivePoint[]>([]);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const draftRef = useRef<LivePoint[]>([]);
  const isControlledRef = useRef(controlledActive !== undefined);
  isControlledRef.current = controlledActive !== undefined;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const setActive = useCallback((next: boolean) => {
    if (!isControlledRef.current) setUncontrolledActive(next);
    onActiveChangeRef.current?.(next);
  }, []);

  const initialActiveRef = useRef(active);
  initialActiveRef.current = active;
  const toggle = useMemo(
    () => createDrawToggle({ shortcut, initialActive: initialActiveRef.current, onChange: setActive }),
    [shortcut, setActive]
  );

  useEffect(() => () => toggle.dispose(), [toggle]);

  useEffect(() => {
    toggle.sync(active);
  }, [toggle, active]);

  const resetDraft = useCallback(() => {
    draftRef.current = [];
    pointerIdRef.current = null;
    setDraft([]);
  }, []);

  useEffect(() => {
    if (active) return;
    resetDraft();
    setPendingPin(null);
  }, [active, resetDraft]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (pendingPin) {
        setPendingPin(null);
      } else {
        setActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, pendingPin, setActive]);

  const anchorOptions = useCallback(() => ({ route: route ?? defaultRoute(), t: now() }), [route, now]);

  const completeStroke = useCallback(
    (points: LivePoint[]) => {
      const options = anchorOptions();
      onAnnotation({
        id: createId(),
        kind: "stroke",
        points,
        bbox: computeBbox(points),
        anchor: anchorStroke(points, options)
      });
    },
    [anchorOptions, createId, onAnnotation]
  );

  const completePin = useCallback(
    (comment: string) => {
      if (!pendingPin) return;
      const options = anchorOptions();
      const bbox = { x: pendingPin.point.x, y: pendingPin.point.y, width: 0, height: 0 };
      onAnnotation({
        id: createId(),
        kind: "pin",
        points: [pendingPin.point],
        bbox,
        anchor: pendingPin.target ? buildAnchor(pendingPin.target, options) : buildFallbackAnchor(bbox, options),
        text: comment
      });
      setPendingPin(null);
    },
    [anchorOptions, createId, onAnnotation, pendingPin]
  );

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!active || event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    if (pendingPin) {
      setPendingPin(null);
      return;
    }
    pointerIdRef.current = event.pointerId;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some engines throw when the pointer is already gone; drawing still works without capture.
      }
    }
    const point = pointFromEvent(event);
    draftRef.current = [point];
    setDraft([point]);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const next = [...draftRef.current, pointFromEvent(event)];
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const points = [...draftRef.current, pointFromEvent(event)];
    resetDraft();

    const start = points[0];
    const travelled = points.some((point) => distance(point, start) > TAP_DISTANCE);
    if (!travelled) {
      if (pinOnTap) {
        setPendingPin({ point: start, target: resolvePointTarget(start) });
      }
      return;
    }

    completeStroke(points);
  };

  const onPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    resetDraft();
  };

  const pins = annotations.filter((annotation) => annotation.kind === "pin");
  const draftPath = draft.length > 0 ? strokePath(draft, false) : "";

  return (
    <div
      {...{ [OVERLAY_ATTRIBUTE]: "" }}
      data-riffrec-draw-active={active ? "" : undefined}
      style={{ ...rootStyle, zIndex }}
    >
      {active ? <div data-riffrec-draw-tint="" aria-hidden="true" style={tintStyle} /> : null}
      <svg
        data-riffrec-draw-surface=""
        aria-hidden={active ? undefined : "true"}
        role={active ? "img" : undefined}
        aria-label={active ? "Drawing layer" : undefined}
        style={{
          ...surfaceStyle,
          pointerEvents: active ? "auto" : "none",
          cursor: active ? "crosshair" : "default"
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {annotations.map((annotation) =>
          annotation.kind === "stroke" ? (
            <path
              key={annotation.id}
              data-riffrec-stroke={annotation.id}
              d={strokePath(annotation.points, true)}
              fill={strokeColor}
              fillOpacity={0.9}
            />
          ) : (
            <Pin key={annotation.id} annotation={annotation} index={pins.indexOf(annotation) + 1} />
          )
        )}
        {draftPath ? <path data-riffrec-stroke-draft="" d={draftPath} fill={strokeColor} fillOpacity={0.9} /> : null}
      </svg>
      {pendingPin ? (
        <PinComposer
          point={pendingPin.point}
          target={pendingPin.target}
          onSubmit={completePin}
          onCancel={() => setPendingPin(null)}
        />
      ) : null}
      {showToggle ? (
        <button
          type="button"
          data-riffrec-draw-toggle=""
          aria-pressed={active}
          aria-label={active ? "Stop drawing" : "Draw on the page"}
          title={shortcut ? `Draw (${shortcut})` : "Draw"}
          style={active ? toggleActiveStyle : toggleStyle}
          onClick={() => toggle.toggle()}
        >
          ✎
        </button>
      ) : null}
    </div>
  );
}

import { buildSelector } from "../../capture/element";
import { getComponentName } from "../../capture/fiber";
import type { ElementBoundingBox } from "../../types";
import type { LiveAnchor, LivePoint } from "../contract";

/** Marks overlay-owned DOM so hit-testing never anchors a mark to the overlay itself. */
export const OVERLAY_ATTRIBUTE = "data-riffrec-overlay";

const OVERLAY_SELECTOR = `[${OVERLAY_ATTRIBUTE}]`;

/** Rect containment tolerance in CSS pixels, so a stroke that clips a corner still counts as enclosing. */
const CONTAINMENT_SLACK = 4;

export interface ResolveTargetOptions {
  /** Document to hit-test against; defaults to `globalThis.document`. */
  document?: Document;
  /** Extra predicate for elements that must never be a target (in addition to overlay nodes). */
  ignore?: (element: Element) => boolean;
}

export interface BuildAnchorOptions {
  route: string;
  /** Milliseconds since session start (`LiveAnchor.t`). */
  t: number;
}

export function computeBbox(points: readonly LivePoint[]): ElementBoundingBox {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectCenter(rect: ElementBoundingBox): LivePoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function intersectionArea(a: ElementBoundingBox, b: ElementBoundingBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

export function rectContains(outer: ElementBoundingBox, inner: ElementBoundingBox, slack = 0): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

export function elementRect(element: Element): ElementBoundingBox {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function rectArea(rect: ElementBoundingBox): number {
  return rect.width * rect.height;
}

function isDocumentChrome(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return tag === "html" || tag === "body";
}

/** True for the overlay's own DOM (panel, consent dialog, drawing layer). */
export function isOverlayNode(element: Element): boolean {
  return element.closest(OVERLAY_SELECTOR) !== null;
}

function isEligible(element: Element, options: ResolveTargetOptions): boolean {
  if (isDocumentChrome(element) || isOverlayNode(element)) return false;
  return options.ignore ? !options.ignore(element) : true;
}

function elementsUnderPoint(point: LivePoint, doc: Document, options: ResolveTargetOptions): Element[] {
  const view = doc.defaultView;
  if (view && (point.x < 0 || point.y < 0 || point.x > view.innerWidth || point.y > view.innerHeight)) {
    return [];
  }

  if (typeof doc.elementsFromPoint === "function") {
    return doc.elementsFromPoint(point.x, point.y).filter((element) => isEligible(element, options));
  }

  if (typeof doc.elementFromPoint === "function") {
    const element = doc.elementFromPoint(point.x, point.y);
    return element && isEligible(element, options) ? [element] : [];
  }

  return [];
}

/**
 * Walks up from the element under the centroid while the ancestor still fits inside
 * the stroke's bbox, so circling a card anchors to the card rather than to whichever
 * child happens to sit under the centroid.
 */
function widenToEnclosedAncestor(element: Element, bbox: ElementBoundingBox, options: ResolveTargetOptions): Element {
  let current = element;
  let parent = current.parentElement;

  while (parent && isEligible(parent, options) && rectContains(bbox, elementRect(parent), CONTAINMENT_SLACK)) {
    current = parent;
    parent = current.parentElement;
  }

  return current;
}

function depthOf(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

/**
 * Largest-overlap fallback. Elements whose rect swallows the whole bbox are the
 * backgrounds the stroke was drawn over, not what it was drawn on, so they only win
 * when nothing else intersects; among them the deepest (smallest) one is chosen.
 */
function largestOverlapTarget(bbox: ElementBoundingBox, doc: Document, options: ResolveTargetOptions): Element | null {
  let bestPartial: { element: Element; area: number; depth: number } | null = null;
  let bestContainer: { element: Element; area: number; depth: number } | null = null;

  for (const element of Array.from(doc.body?.querySelectorAll("*") ?? [])) {
    if (!isEligible(element, options)) continue;
    const rect = elementRect(element);
    if (rectArea(rect) <= 0) continue;
    const overlap = intersectionArea(bbox, rect);
    if (overlap <= 0) continue;

    const depth = depthOf(element);
    if (rectContains(rect, bbox) && rectArea(rect) > rectArea(bbox)) {
      if (!bestContainer || rectArea(rect) < bestContainer.area || (rectArea(rect) === bestContainer.area && depth > bestContainer.depth)) {
        bestContainer = { element, area: rectArea(rect), depth };
      }
      continue;
    }

    if (!bestPartial || overlap > bestPartial.area || (overlap === bestPartial.area && depth > bestPartial.depth)) {
      bestPartial = { element, area: overlap, depth };
    }
  }

  return bestPartial?.element ?? bestContainer?.element ?? null;
}

/**
 * Finds the element a completed stroke lands on: the topmost element under the
 * stroke's centroid, widened to the largest ancestor the stroke encloses; when
 * hit-testing yields nothing, the element with the largest overlap with the bbox.
 */
export function resolveStrokeTarget(
  points: readonly LivePoint[],
  options: ResolveTargetOptions = {}
): Element | null {
  const doc = options.document ?? (typeof document !== "undefined" ? document : null);
  if (!doc || points.length === 0) return null;

  const bbox = computeBbox(points);
  const [underCentroid] = elementsUnderPoint(rectCenter(bbox), doc, options);

  if (underCentroid) {
    return widenToEnclosedAncestor(underCentroid, bbox, options);
  }

  return largestOverlapTarget(bbox, doc, options);
}

/** Topmost eligible element under a single point (used for pins). */
export function resolvePointTarget(point: LivePoint, options: ResolveTargetOptions = {}): Element | null {
  const doc = options.document ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  return elementsUnderPoint(point, doc, options)[0] ?? null;
}

export function buildAnchor(element: Element, options: BuildAnchorOptions): LiveAnchor {
  return {
    route: options.route,
    selector: buildSelector(element),
    component: getComponentName(element),
    rect: elementRect(element),
    t: options.t
  };
}

/** Anchor used when a mark lands on nothing identifiable: the route and the mark's own bbox. */
export function buildFallbackAnchor(bbox: ElementBoundingBox, options: BuildAnchorOptions): LiveAnchor {
  return {
    route: options.route,
    selector: "body",
    component: null,
    rect: bbox,
    t: options.t
  };
}

export function anchorStroke(points: readonly LivePoint[], options: BuildAnchorOptions & ResolveTargetOptions): LiveAnchor {
  const target = resolveStrokeTarget(points, options);
  return target ? buildAnchor(target, options) : buildFallbackAnchor(computeBbox(points), options);
}

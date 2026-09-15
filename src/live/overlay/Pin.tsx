import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { buildSelector } from "../../capture/element";
import { getComponentName } from "../../capture/fiber";
import type { ElementBoundingBox } from "../../types";
import type { LiveAnnotation, LivePoint } from "../contract";
import { elementRect } from "./strokeAnchor";

const SNIPPET_LIMIT = 80;
const PIN_RADIUS = 11;

/** The `ce-prototype` pin record: what was pinned (selector, text snippet, rect) and what was said about it. */
export interface PinRecord {
  selector: string;
  component: string | null;
  /** Accessible name or visible text of the pinned element; never a form control's value. */
  snippet: string | null;
  rect: ElementBoundingBox;
  comment: string;
}

export interface PinProps {
  annotation: LiveAnnotation;
  /** 1-based number shown in the marker. */
  index: number;
}

export interface PinComposerProps {
  point: LivePoint;
  target: Element | null;
  initialValue?: string;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function isFormControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function labelledByText(element: Element): string | null {
  const ids = element.getAttribute("aria-labelledby");
  if (!ids) return null;
  const doc = element.ownerDocument;
  const parts = ids
    .split(/\s+/)
    .map((id) => normalizeText(doc.getElementById(id)?.textContent))
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

function labelText(element: Element): string | null {
  if (!isFormControl(element)) return null;
  const labels = Array.from(element.labels ?? []);
  const wrapping = element.closest("label");
  if (wrapping && !labels.includes(wrapping)) labels.push(wrapping);
  for (const label of labels) {
    const text = normalizeText(label.textContent);
    if (text) return text;
  }
  return null;
}

/**
 * Accessible name of an element for the pin snippet. Form controls contribute their
 * label, placeholder, or name — never the value the user typed into them.
 */
export function getAccessibleName(element: Element): string | null {
  const ariaLabel = normalizeText(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labelledBy = labelledByText(element);
  if (labelledBy) return labelledBy;

  if (isFormControl(element)) {
    return (
      labelText(element) ??
      normalizeText(element.getAttribute("placeholder")) ??
      normalizeText(element.getAttribute("title")) ??
      normalizeText(element.getAttribute("name")) ??
      null
    );
  }

  if (element instanceof HTMLImageElement) {
    return normalizeText(element.getAttribute("alt")) ?? normalizeText(element.getAttribute("title"));
  }

  return normalizeText(element.textContent) ?? normalizeText(element.getAttribute("title"));
}

export function buildPinRecord(element: Element, comment: string): PinRecord {
  const snippet = getAccessibleName(element);
  return {
    selector: buildSelector(element),
    component: getComponentName(element),
    snippet: snippet ? truncate(snippet, SNIPPET_LIMIT) : null,
    rect: elementRect(element),
    comment
  };
}

const markerStyle: CSSProperties = {
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  fontWeight: 600,
  userSelect: "none"
};

export function Pin({ annotation, index }: PinProps) {
  const point = annotation.points[0] ?? { x: annotation.bbox.x, y: annotation.bbox.y };
  return (
    <g
      data-riffrec-pin={annotation.id}
      transform={`translate(${point.x} ${point.y})`}
      style={markerStyle}
      aria-label={annotation.text ? `Pin ${index}: ${annotation.text}` : `Pin ${index}`}
    >
      <title>{annotation.text ?? `Pin ${index}`}</title>
      <circle r={PIN_RADIUS} fill="#d92d20" stroke="#ffffff" strokeWidth={2} />
      <text textAnchor="middle" dominantBaseline="central" fill="#ffffff">
        {index}
      </text>
    </g>
  );
}

const composerStyle: CSSProperties = {
  position: "fixed",
  width: 280,
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 12px 40px rgba(16, 24, 40, 0.24)",
  padding: 12,
  display: "grid",
  gap: 8,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  pointerEvents: "auto",
  cursor: "default"
};

const snippetStyle: CSSProperties = {
  color: "#475467",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  padding: 8,
  font: "inherit",
  boxSizing: "border-box"
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8
};

const buttonStyle: CSSProperties = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "6px 12px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};

function composerPosition(point: LivePoint): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : Infinity;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : Infinity;
  const left = Math.max(8, Math.min(point.x + 16, viewportWidth - 280 - 8));
  const top = Math.max(8, Math.min(point.y + 16, viewportHeight - 180));
  return { left, top };
}

/** Small note composer opened where a pin was placed (the `ce-prototype` pin composer). */
export function PinComposer({ point, target, initialValue = "", onSubmit, onCancel }: PinComposerProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const snippet = target ? getAccessibleName(target) : null;
  const selector = target ? buildSelector(target) : null;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const comment = value.trim();
    if (comment.length === 0) return;
    onSubmit(comment);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      data-riffrec-pin-composer=""
      role="dialog"
      aria-label="Pin note"
      style={{ ...composerStyle, ...composerPosition(point) }}
      onSubmit={submit}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div style={snippetStyle} title={selector ?? undefined}>
        {snippet ? truncate(snippet, SNIPPET_LIMIT) : selector ?? "This spot"}
      </div>
      <textarea
        ref={textareaRef}
        aria-label="Note"
        placeholder="What should change here?"
        style={textareaStyle}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div style={buttonRowStyle}>
        <button type="button" style={secondaryButtonStyle} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" style={buttonStyle} disabled={value.trim().length === 0}>
          Save pin
        </button>
      </div>
    </form>
  );
}

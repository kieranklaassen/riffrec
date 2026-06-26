import type { ClickObservation } from "../shared/types";

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

function escapeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function selectorPart(element: Element): string {
  const id = element.id ? `#${escapeIdentifier(element.id)}` : "";
  const classes = Array.from(element.classList)
    .slice(0, 2)
    .map((name) => `.${escapeIdentifier(name)}`)
    .join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function selectorFor(element: Element): string {
  const parts: string[] = [];
  let cursor: Element | null = element;
  while (cursor && parts.length < 4) {
    parts.unshift(selectorPart(cursor));
    cursor = cursor.parentElement;
  }
  return truncate(parts.join(" > "), 180);
}

function isEditable(element: Element): boolean {
  if (element.closest("input, textarea, select, [role=\"textbox\"]")) {
    return true;
  }
  const editable = element.closest("[contenteditable]");
  return Boolean(editable && editable.getAttribute("contenteditable") !== "false");
}

export function observationForElement(element: Element): ClickObservation {
  return {
    component: element.closest("[data-component]")?.getAttribute("data-component") ?? null,
    element: {
      tag: element.tagName.toLowerCase(),
      text: isEditable(element) ? null : truncate(element.textContent?.trim() || "", 200) || null,
      id: element.id || null,
      selector: selectorFor(element)
    }
  };
}

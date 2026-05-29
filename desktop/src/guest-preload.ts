import { ipcRenderer } from "electron";
import type { ClickObservation } from "./shared/types";

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

function escapeIdentifier(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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

function isSensitive(element: Element): boolean {
  const input = element.closest("input");
  return Boolean(input && (input.type === "password" || input.type === "hidden"));
}

document.addEventListener(
  "click",
  (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const element = event.target;
    const observation: ClickObservation = {
      component: element.closest("[data-component]")?.getAttribute("data-component") ?? null,
      element: {
        tag: element.tagName.toLowerCase(),
        text: isSensitive(element) ? null : truncate(element.textContent?.trim() || "", 200) || null,
        id: element.id || null,
        selector: selectorFor(element)
      }
    };
    ipcRenderer.send("riffrec:guest-click", observation);
  },
  true
);

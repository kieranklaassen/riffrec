import type { ClickEvent, ElementInfo, NavigationEvent, RiffrecEventSink } from "../types";
import { getComponentName } from "./fiber";

type HistoryMethod = typeof window.history.pushState;

function timestamp(sessionStart: number): number {
  return (Date.now() - sessionStart) / 1000;
}

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element;
}

function isSensitiveInput(el: Element): boolean {
  if (!(el instanceof HTMLInputElement)) {
    return false;
  }

  return el.type === "password" || el.type === "hidden";
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function selectorPart(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${escapeCssIdentifier(el.id)}` : "";
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .map((className) => `.${escapeCssIdentifier(className)}`)
    .join("");
  return `${tag}${id}${classes}`;
}

export function buildSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && parts.length < 4) {
    parts.unshift(selectorPart(current));
    current = current.parentElement;
  }

  return truncate(parts.join(" > "), 100);
}

export function buildElementInfo(el: Element): ElementInfo {
  const rawText = isSensitiveInput(el) ? null : el.textContent?.trim() || null;

  return {
    tag: el.tagName.toLowerCase(),
    text: rawText ? truncate(rawText, 200) : null,
    id: el.id || null,
    selector: buildSelector(el)
  };
}

export class EventCapture {
  private onEvent: RiffrecEventSink | null = null;
  private sessionStart = 0;
  private clickHandler: ((event: MouseEvent) => void) | null = null;
  private popstateHandler: (() => void) | null = null;
  private originalPushState: HistoryMethod | null = null;
  private originalReplaceState: HistoryMethod | null = null;
  private previousUrl: string | null = null;

  start(sessionStart: number, onEvent: RiffrecEventSink): void {
    if (typeof window === "undefined" || typeof document === "undefined" || this.onEvent) {
      return;
    }

    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.previousUrl = window.location.href;
    this.clickHandler = (event) => this.handleClick(event);
    this.popstateHandler = () => this.emitNavigation(window.location.href);

    document.addEventListener("click", this.clickHandler, true);
    this.patchHistory();
    window.addEventListener("popstate", this.popstateHandler);
  }

  stop(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true);
    }
    if (this.popstateHandler) {
      window.removeEventListener("popstate", this.popstateHandler);
    }
    if (this.originalPushState) {
      window.history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      window.history.replaceState = this.originalReplaceState;
    }

    this.onEvent = null;
    this.clickHandler = null;
    this.popstateHandler = null;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.previousUrl = null;
  }

  private handleClick(event: MouseEvent): void {
    if (!this.onEvent || !isElement(event.target)) {
      return;
    }

    const element = event.target;
    const clickEvent: ClickEvent = {
      t: timestamp(this.sessionStart),
      type: "click",
      component: getComponentName(element),
      element: buildElementInfo(element)
    };
    this.onEvent(clickEvent);
  }

  private patchHistory(): void {
    this.originalPushState = window.history.pushState;
    this.originalReplaceState = window.history.replaceState;

    window.history.pushState = this.wrapHistoryMethod(this.originalPushState);
    window.history.replaceState = this.wrapHistoryMethod(this.originalReplaceState);
  }

  private wrapHistoryMethod(original: HistoryMethod): HistoryMethod {
    return ((...args: Parameters<HistoryMethod>) => {
      const result = original.apply(window.history, args);
      window.setTimeout(() => this.emitNavigation(window.location.href), 0);
      return result;
    }) as HistoryMethod;
  }

  private emitNavigation(nextUrl: string): void {
    if (!this.onEvent) {
      return;
    }

    const from = this.previousUrl ?? nextUrl;
    if (from === nextUrl) {
      return;
    }

    const navigationEvent: NavigationEvent = {
      t: timestamp(this.sessionStart),
      type: "navigation",
      from,
      to: nextUrl
    };

    this.previousUrl = nextUrl;
    this.onEvent(navigationEvent);
  }
}

import type { ClickEvent, NavigationEvent, RiffrecEventSink } from "../types";
import { buildElementInfo, buildSelector } from "./element";
import { getComponentName, getComponentPath } from "./fiber";

type HistoryMethod = typeof window.history.pushState;

function timestamp(sessionStart: number): number {
  return (Date.now() - sessionStart) / 1000;
}

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element;
}

export { buildElementInfo, buildSelector };

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
      componentPath: getComponentPath(element),
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

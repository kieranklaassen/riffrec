import { randomUUID } from "node:crypto";
import type {
  BrowserState,
  CaptureOptions,
  CaptureOutcomes,
  ClickObservation,
  EventsJson,
  Marker,
  RiffrecEvent,
  SessionContextJson
} from "../shared/types";
import { RIFFREC_SCHEMA_VERSION } from "../shared/types";
import { redactUrl, sanitizeConsoleMessage } from "./privacy";

const MAX_EVENTS = 10_000;
const MAX_PENDING_REQUESTS = 1_000;
const MAX_MARKERS = 200;
const MAX_WARNINGS = 25;

interface CaptureSessionInput {
  initialState: BrowserState;
  options: CaptureOptions;
  outcomes: CaptureOutcomes;
  appVersion: string;
  electronVersion: string;
  viewport: SessionContextJson["viewport"];
}

interface NetworkStart {
  method: string;
  url: string;
  startedAt: number;
}

export interface CompletedCaptureSession {
  id: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  eventsJson: EventsJson;
  contextJson: SessionContextJson;
}

export class CaptureSession {
  readonly id = randomUUID();
  readonly startedAt = new Date();
  private readonly events: RiffrecEvent[] = [];
  private readonly markers: Marker[] = [];
  private readonly networkStarts = new Map<number, NetworkStart>();
  private readonly warnings: string[] = [];
  private finalState: BrowserState;
  private didTruncateEvents = false;
  private didTruncateRequests = false;
  private didTruncateMarkers = false;

  constructor(private readonly input: CaptureSessionInput) {
    this.finalState = input.initialState;
  }

  addClick(observation: ClickObservation): void {
    this.push({
      t: this.timestamp(),
      type: "click",
      component: observation.component,
      element: observation.element
    });
  }

  addNavigation(nextUrl: string): void {
    const from = this.finalState.url;
    this.finalState = { ...this.finalState, url: nextUrl };
    if (!from || from === nextUrl) {
      return;
    }
    this.push({
      t: this.timestamp(),
      type: "navigation",
      from: redactUrl(from),
      to: redactUrl(nextUrl)
    });
  }

  updateBrowserState(state: BrowserState): void {
    this.finalState = state;
  }

  addConsoleError(message: string, stack: string | null = null): void {
    this.push({
      t: this.timestamp(),
      type: "console_error",
      message: sanitizeConsoleMessage(message),
      stack: stack ? sanitizeConsoleMessage(stack) : null,
      component: null
    });
  }

  beginNetwork(id: number, method: string, url: string, timestamp = Date.now()): void {
    if (this.networkStarts.size >= MAX_PENDING_REQUESTS) {
      this.didTruncateRequests = true;
      return;
    }
    this.networkStarts.set(id, { method: method.toUpperCase(), url, startedAt: timestamp });
  }

  completeNetwork(id: number, status: number, timestamp = Date.now()): void {
    const started = this.networkStarts.get(id);
    if (!started) {
      return;
    }
    this.networkStarts.delete(id);
    this.push({
      t: this.timestamp(),
      type: "network_request",
      url: redactUrl(started.url),
      method: started.method,
      status,
      duration_ms: Math.max(0, timestamp - started.startedAt)
    });
  }

  addMarker(label: string): void {
    if (this.markers.length >= MAX_MARKERS) {
      this.didTruncateMarkers = true;
      return;
    }
    const trimmed = label.trim();
    this.markers.push({
      t: this.timestamp(),
      label: trimmed ? trimmed.slice(0, 120) : "Marked moment"
    });
  }

  addWarning(warning: string): void {
    if (this.warnings.length < MAX_WARNINGS && !this.warnings.includes(warning)) {
      this.warnings.push(warning);
    }
  }

  complete(endedAt = new Date()): CompletedCaptureSession {
    const durationSeconds = Math.max(0, (endedAt.getTime() - this.startedAt.getTime()) / 1000);
    return {
      id: this.id,
      startedAt: this.startedAt,
      endedAt,
      durationSeconds,
      eventsJson: {
        version: "1",
        schema_version: RIFFREC_SCHEMA_VERSION,
        session_id: this.id,
        url: redactUrl(this.finalState.url),
        started_at: this.startedAt.toISOString(),
        duration_seconds: durationSeconds,
        events: this.events
      },
      contextJson: {
        source: "riffrec-desktop",
        app_version: this.input.appVersion,
        electron_version: this.input.electronVersion,
        platform: process.platform,
        initial_url: redactUrl(this.input.initialState.url),
        final_url: redactUrl(this.finalState.url),
        page_title: this.finalState.title,
        capture_options: this.input.options,
        capture_outcomes: this.input.outcomes,
        captured_signals: [
          "screen video",
          ...(this.input.outcomes.microphone === "captured" ? ["microphone narration"] : []),
          ...(this.input.options.captureClicks ? ["DOM clicks"] : []),
          "top-level navigation",
          "network URL/method/status/duration",
          "console errors",
          "user markers and notes"
        ],
        unavailable_signals: [
          "React component internals unless the page provides data-component",
          "request and response bodies",
          "typed keys or form field values",
          "activity in external browser windows"
        ],
        viewport: this.input.viewport,
        privacy: {
          stores_request_or_response_bodies: false,
          stores_keystrokes: false,
          browser_profile_persisted_locally: true
        },
        markers: this.markers,
        warnings: [
          ...this.warnings,
          ...(this.didTruncateEvents ? ["Event limit reached; later events were omitted."] : []),
          ...(this.didTruncateRequests
            ? ["Concurrent network observation limit reached; some requests were omitted."]
            : []),
          ...(this.didTruncateMarkers ? ["Marker limit reached; later markers were omitted."] : [])
        ]
      }
    };
  }

  private timestamp(): number {
    return Math.max(0, (Date.now() - this.startedAt.getTime()) / 1000);
  }

  private push(event: RiffrecEvent): void {
    if (this.events.length >= MAX_EVENTS) {
      this.didTruncateEvents = true;
      return;
    }
    this.events.push(event);
  }
}

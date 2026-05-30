export const RIFFREC_SCHEMA_VERSION = "1.0.0" as const;

export interface ElementInfo {
  tag: string;
  text: string | null;
  id: string | null;
  selector: string;
}

export interface ClickEvent {
  t: number;
  type: "click";
  component: string | null;
  element: ElementInfo;
}

export interface NetworkRequestEvent {
  t: number;
  type: "network_request";
  url: string;
  method: string;
  status: number;
  duration_ms: number;
}

export interface ConsoleErrorEvent {
  t: number;
  type: "console_error";
  message: string;
  stack: string | null;
  component: string | null;
}

export interface NavigationEvent {
  t: number;
  type: "navigation";
  from: string;
  to: string;
}

export type RiffrecEvent =
  | ClickEvent
  | NetworkRequestEvent
  | ConsoleErrorEvent
  | NavigationEvent;

export interface EventsJson {
  version: "1";
  schema_version: typeof RIFFREC_SCHEMA_VERSION;
  session_id: string;
  url: string;
  started_at: string;
  duration_seconds: number;
  events: RiffrecEvent[];
}

export interface SessionJson {
  url: string;
  react_version: null;
  browser: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  files_present: string[];
}

export interface CaptureOptions {
  microphone: boolean;
  captureClicks: boolean;
}

export interface CaptureOutcomes {
  screen: "captured" | "failed";
  microphone: "captured" | "disabled" | "denied";
}

export interface SessionContextJson {
  source: "riffrec-desktop";
  app_version: string;
  electron_version: string;
  platform: string;
  initial_url: string;
  final_url: string;
  page_title: string;
  capture_options: CaptureOptions;
  capture_outcomes: CaptureOutcomes;
  captured_signals: string[];
  unavailable_signals: string[];
  viewport: {
    width: number;
    height: number;
    device_pixel_ratio: number;
    zoom_factor: number;
  };
  privacy: {
    stores_request_or_response_bodies: false;
    stores_keystrokes: false;
    browser_profile_persisted_locally: true;
  };
  markers: Marker[];
  warnings: string[];
}

export interface Marker {
  t: number;
  label: string;
}

export interface ClickObservation {
  component: string | null;
  element: ElementInfo;
}

export interface RecordingStartInput {
  options: CaptureOptions;
  outcomes: CaptureOutcomes;
}

export type MediaKind = "recording" | "voice";

export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  canRecord: boolean;
  error?: string | null;
}

export interface ExportResult {
  path: string | null;
  canceled: boolean;
  retryAvailable: boolean;
}

export interface DesktopApi {
  navigate: (value: string) => Promise<{ ok: boolean; error?: string }>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;
  setBrowserBounds: (bounds: Rectangle) => void;
  clearBrowsingData: () => Promise<void>;
  getScreenCaptureStatus: () => Promise<string>;
  authorizeDisplayCapture: () => Promise<void>;
  startRecording: (input: RecordingStartInput) => Promise<void>;
  appendMediaChunk: (kind: MediaKind, chunk: ArrayBuffer) => Promise<void>;
  endTelemetry: () => Promise<{ recoveryPersisted: boolean }>;
  finalizeMedia: () => Promise<void>;
  addMarker: (label: string) => Promise<void>;
  addWarning: (warning: string) => Promise<void>;
  saveRecording: (notes: string) => Promise<ExportResult>;
  retryExport: (notes: string) => Promise<ExportResult>;
  discardDraft: () => Promise<void>;
  discardQuarantinedDrafts: () => Promise<{ removed: number }>;
  cancelRecording: () => Promise<void>;
  getPendingExport: () => Promise<{
    available: boolean;
    notes: string;
    activeAborted: boolean;
    additionalCount: number;
    quarantinedCount: number;
    partial: boolean;
  }>;
  onBrowserState: (listener: (state: BrowserState) => void) => () => void;
  onNotice: (listener: (message: string) => void) => () => void;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

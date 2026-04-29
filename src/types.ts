export const RIFFREC_SCHEMA_VERSION = "1.0.0" as const;

export type RiffrecSchemaVersion = typeof RIFFREC_SCHEMA_VERSION;

export type RiffrecStatus = "idle" | "recording" | "stopping" | "disabled" | "error";

export type RiffrecWriteMethod = "zip";

export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  tag: string;
  text: string | null;
  id: string | null;
  selector: string;
  name?: string;
  fullPath?: string;
  classes?: string[];
  role?: string | null;
  ariaLabel?: string | null;
  nearbyText?: string | null;
  nearbyElements?: string | null;
  boundingBox?: ElementBoundingBox;
  computedStyles?: Record<string, string>;
}

export interface ClickEvent {
  t: number;
  type: "click";
  component: string | null;
  componentPath?: string[] | null;
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
  schema_version: RiffrecSchemaVersion;
  session_id: string;
  url: string;
  started_at: string;
  duration_seconds: number;
  events: RiffrecEvent[];
}

export interface SessionJson {
  url: string;
  react_version: string | null;
  browser: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  files_present: string[];
}

export interface SessionResult {
  sessionPath: string | null;
  method: RiffrecWriteMethod;
  filesPresent: string[];
}

export type RiffrecDisplayMediaVideo = MediaTrackConstraints;

export type RiffrecDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
};

export interface RiffrecConfig {
  /**
   * Override default screen-capture options passed to `getDisplayMedia()`.
   */
  displayMedia?: Partial<RiffrecDisplayMediaOptions>;
  /**
   * Override default screen-capture video constraints (e.g. `frameRate`).
   */
  displayMediaVideo?: Partial<RiffrecDisplayMediaVideo>;
  forceEnable?: boolean;
  forceEnableParam?: boolean | string;
  onError?: (err: Error) => void;
  sanitizeError?: (msg: string, stack: string | null) => string;
}

export interface RiffrecContextValue {
  start: () => Promise<void>;
  stop: () => Promise<SessionResult | null>;
  status: RiffrecStatus;
  isEnabled: boolean;
}

export type UseRiffrecResult = Pick<RiffrecContextValue, "start" | "stop" | "status">;

export interface CaptureOutputs {
  sessionId: string;
  startedAt: Date;
  durationSeconds: number;
  events: RiffrecEvent[];
  screenBlob: Blob | null;
  voiceBlob: Blob | null;
}

export interface CaptureStartOptions {
  sessionStart: number;
}

export type RiffrecEventSink = (event: RiffrecEvent) => void;

declare global {
  interface Window {
    __RIFFREC_PATCHED__?: boolean;
  }
}

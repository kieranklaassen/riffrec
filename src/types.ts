import type { ExecutionMode } from "./live/contract";
import type { EvidenceProfile, EvidenceProfileName } from "./live/evidence/profile";
import type { LiveSessionStatus } from "./live/session";

export const RIFFREC_SCHEMA_VERSION = "1.0.0" as const;

export type RiffrecSchemaVersion = typeof RIFFREC_SCHEMA_VERSION;

/**
 * `live` marks a live session (KTD16): unlike `recording`, unmounting the
 * provider does not end it, and the next mount rehydrates it.
 */
export type RiffrecStatus = "idle" | "recording" | "live" | "stopping" | "disabled" | "error";

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
  sessionId: string;
  filename: string;
  archive: Blob;
}

export interface RiffrecSessionOptions {
  /** Download the completed ZIP. Defaults to true. */
  download?: boolean;
  /** Runs after the archive is ready, including when stopped from the provider overlay. */
  onSessionComplete?: (result: SessionResult) => void | Promise<void>;
}

export type RiffrecDisplayMediaVideo = MediaTrackConstraints;

export type RiffrecDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
};

export type RiffrecLiveMode = ExecutionMode;

/**
 * Live mode (I5). Setting `live` on the provider lazy-loads the live subtree;
 * `start()` then runs a live session instead of a classic recording. The page
 * token and endpoint origin normally arrive in the URL fragment
 * (`#riffrec_live=<token>&endpoint=<origin>`); `endpoint` is a fallback for
 * hosts that run a fixed endpoint. No option accepts an OpenAI key: the
 * endpoint mints the interviewer's ephemeral secret (R5).
 */
export interface RiffrecLiveConfig {
  /** Fallback endpoint origin when the fragment carries none. */
  endpoint?: string;
  /** Evidence profile applied on the wire (R19); defaults to `"default"`. */
  profile?: EvidenceProfileName | Partial<EvidenceProfile>;
  /**
   * Begin the consent step as soon as the live subtree is ready. Defaults to
   * `true` when the page was opened with live credentials (a `#riffrec_live=`
   * fragment, or stored credentials after a reload) and `false` otherwise, so
   * `live={{}}` auto-starts only for pages a consumer handed out (I5, KTD3).
   */
  autoStart?: boolean;
  /** Keyboard shortcut for the drawing layer; `null` disables it. Defaults to `Alt+Shift+D`. */
  drawShortcut?: string | null;
  /** Who runs the endpoint, named in the consent copy (R26). */
  endpointOwner?: string;
}

/** `"disabled"` when the provider has no `live` config or is disabled in production. */
export type RiffrecLiveStatus = LiveSessionStatus | "disabled";

export interface RiffrecLiveControls {
  status: RiffrecLiveStatus;
  mode: RiffrecLiveMode;
  /** Takes effect at the next checkpoint (KTD12). */
  setMode: (mode: RiffrecLiveMode) => void;
  muted: boolean;
  /** Mutes the interviewer, the voice recording, and the audio clips together (KTD21). */
  setMuted: (muted: boolean) => void;
  /** Emits a `send` checkpoint; resolves with whether one left the page. */
  send: () => Promise<boolean>;
  /** Ends the live session and assembles the archive (R4). */
  stop: () => Promise<SessionResult | null>;
}

export interface RiffrecConfig {
  /**
   * Override default screen-capture options passed to `getDisplayMedia()`.
   */
  displayMedia?: Partial<RiffrecDisplayMediaOptions>;
  /**
   * Override default screen-capture video constraints (e.g. `frameRate`).
   */
  displayMediaVideo?: Partial<RiffrecDisplayMediaVideo>;
  downloadNoticeTitle?: string;
  downloadNoticeMessage?: string;
  forceEnable?: boolean;
  forceEnableParam?: boolean | string;
  onError?: (err: Error) => void;
  sanitizeError?: (msg: string, stack: string | null) => string;
  /** Enable live mode (I5). Absent: classic recording, no live code loaded. */
  live?: RiffrecLiveConfig;
}

export interface RiffrecContextValue {
  start: (options?: RiffrecSessionOptions) => Promise<void>;
  stop: () => Promise<SessionResult | null>;
  status: RiffrecStatus;
  isEnabled: boolean;
  live: RiffrecLiveControls;
}

export type UseRiffrecResult = Pick<RiffrecContextValue, "start" | "stop" | "status" | "live">;

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

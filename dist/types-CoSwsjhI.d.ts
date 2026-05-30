declare const RIFFREC_SCHEMA_VERSION: "1.0.0";
type RiffrecSchemaVersion = typeof RIFFREC_SCHEMA_VERSION;
type RiffrecStatus = "idle" | "recording" | "stopping" | "disabled" | "error";
type RiffrecWriteMethod = "zip";
interface ElementBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface ElementInfo {
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
interface ClickEvent {
    t: number;
    type: "click";
    component: string | null;
    componentPath?: string[] | null;
    element: ElementInfo;
}
interface NetworkRequestEvent {
    t: number;
    type: "network_request";
    url: string;
    method: string;
    status: number;
    duration_ms: number;
}
interface ConsoleErrorEvent {
    t: number;
    type: "console_error";
    message: string;
    stack: string | null;
    component: string | null;
}
interface NavigationEvent {
    t: number;
    type: "navigation";
    from: string;
    to: string;
}
type RiffrecEvent = ClickEvent | NetworkRequestEvent | ConsoleErrorEvent | NavigationEvent;
interface EventsJson {
    version: "1";
    schema_version: RiffrecSchemaVersion;
    session_id: string;
    url: string;
    started_at: string;
    duration_seconds: number;
    events: RiffrecEvent[];
}
interface SessionJson {
    url: string;
    react_version: string | null;
    browser: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    files_present: string[];
}
interface SessionResult {
    sessionPath: string | null;
    method: RiffrecWriteMethod;
    filesPresent: string[];
}
type RiffrecDisplayMediaVideo = MediaTrackConstraints;
type RiffrecDisplayMediaOptions = DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: "include" | "exclude";
    monitorTypeSurfaces?: "include" | "exclude";
    surfaceSwitching?: "include" | "exclude";
    systemAudio?: "include" | "exclude";
};
interface RiffrecConfig {
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
}
interface RiffrecContextValue {
    start: () => Promise<void>;
    stop: () => Promise<SessionResult | null>;
    status: RiffrecStatus;
    isEnabled: boolean;
}
type UseRiffrecResult = Pick<RiffrecContextValue, "start" | "stop" | "status">;
interface CaptureOutputs {
    sessionId: string;
    startedAt: Date;
    durationSeconds: number;
    events: RiffrecEvent[];
    screenBlob: Blob | null;
    voiceBlob: Blob | null;
}
interface CaptureStartOptions {
    sessionStart: number;
}
type RiffrecEventSink = (event: RiffrecEvent) => void;
declare global {
    interface Window {
        __RIFFREC_PATCHED__?: boolean;
    }
}

export { type CaptureOutputs as C, type ElementBoundingBox as E, type NavigationEvent as N, type RiffrecConfig as R, type SessionResult as S, type UseRiffrecResult as U, type RiffrecDisplayMediaOptions as a, type RiffrecDisplayMediaVideo as b, type CaptureStartOptions as c, type ClickEvent as d, type ConsoleErrorEvent as e, type ElementInfo as f, type EventsJson as g, type NetworkRequestEvent as h, RIFFREC_SCHEMA_VERSION as i, type RiffrecContextValue as j, type RiffrecEvent as k, type RiffrecEventSink as l, type RiffrecSchemaVersion as m, type RiffrecStatus as n, type RiffrecWriteMethod as o, type SessionJson as p };

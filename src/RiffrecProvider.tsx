import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import * as React from "react";
import { ConsoleCapture } from "./capture/console";
import { EventCapture } from "./capture/events";
import { NetworkCapture } from "./capture/network";
import { ScreenCapture } from "./capture/screen";
import { VoiceCapture } from "./capture/voice";
import { SessionWriter } from "./output/session";
import type { LiveHandle } from "./live/LiveOverlay";
import { parseLiveFragment, readStoredBootstrap } from "./live/tokenBootstrap";
import type { LiveSessionSnapshot } from "./live/session";
import type {
  CaptureOutputs,
  RiffrecConfig,
  RiffrecContextValue,
  RiffrecEvent,
  RiffrecLiveControls,
  RiffrecLiveMode,
  RiffrecSessionOptions,
  RiffrecStatus,
  SessionResult
} from "./types";

/**
 * KTD1: the live subtree (session, interviewer, overlay, evidence) is a
 * separate chunk requested only when `live` is configured and the production
 * guard allows. Nothing else in this module imports `./live` at runtime.
 */
const LiveMount = lazy(() => import("./live/LiveOverlay"));

const DEFAULT_LIVE_MODE: RiffrecLiveMode = "smart";

const DEFAULT_FORCE_ENABLE_PARAM = "riffrec";
const ENABLE_PARAM_VALUES = new Set(["", "1", "true", "on", "yes"]);

const recordingOverlayStyle: CSSProperties = {
  position: "fixed",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  gap: 14,
  maxWidth: "calc(100vw - 32px)",
  padding: "14px 16px 14px 18px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.94)",
  color: "#ffffff",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.36), 0 0 0 1px rgba(255, 255, 255, 0.12)",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  pointerEvents: "auto"
};

const recordingDotStyle: CSSProperties = {
  width: 14,
  height: 14,
  flex: "0 0 auto",
  borderRadius: "50%",
  background: "#ef4444",
  boxShadow: "0 0 0 6px rgba(239, 68, 68, 0.22), 0 0 24px rgba(239, 68, 68, 0.72)"
};

const recordingTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  lineHeight: 1.15
};

const recordingTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.02em",
  textTransform: "uppercase"
};

const recordingHintStyle: CSSProperties = {
  marginTop: 3,
  color: "rgba(255, 255, 255, 0.78)",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap"
};

const recordingStopButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.28)",
  borderRadius: 999,
  padding: "13px 20px",
  background: "#ef4444",
  color: "#ffffff",
  boxShadow: "0 10px 30px rgba(239, 68, 68, 0.38)",
  font: "inherit",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const recordingStopDisabledStyle: CSSProperties = {
  ...recordingStopButtonStyle,
  cursor: "not-allowed",
  opacity: 0.68
};

const downloadNoticeStyle: CSSProperties = {
  ...recordingOverlayStyle,
  background: "rgba(6, 78, 59, 0.95)",
  boxShadow: "0 24px 70px rgba(6, 78, 59, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.14)"
};

const downloadNoticeIconStyle: CSSProperties = {
  width: 30,
  height: 30,
  flex: "0 0 auto",
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#34d399",
  color: "#052e16",
  fontSize: 18,
  fontWeight: 900
};

const downloadNoticeButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.35)",
  borderRadius: 999,
  padding: "10px 14px",
  background: "rgba(255, 255, 255, 0.14)",
  color: "#ffffff",
  font: "inherit",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

interface RiffrecProviderProps extends RiffrecConfig {
  children?: ReactNode;
}

interface ActiveSession {
  sessionId: string;
  startedAt: Date;
  sessionStart: number;
  events: RiffrecEvent[];
  screen: ScreenCapture;
  voice: VoiceCapture;
  eventCapture: EventCapture;
  networkCapture: NetworkCapture;
  consoleCapture: ConsoleCapture;
  ownsGlobalPatchMarker: boolean;
  options: RiffrecSessionOptions;
}

function readNodeEnv(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } };
  };
  return maybeProcess.process?.env?.NODE_ENV;
}

export function isEnabledByUrlParam(forceEnableParam: boolean | string | undefined): boolean {
  if (!forceEnableParam || typeof window === "undefined") {
    return false;
  }

  const paramName = forceEnableParam === true ? DEFAULT_FORCE_ENABLE_PARAM : forceEnableParam;
  const rawValue = new URLSearchParams(window.location.search).get(paramName);

  return rawValue !== null && ENABLE_PARAM_VALUES.has(rawValue.toLowerCase());
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `riffrec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function safeStopMedia(capture: ScreenCapture | VoiceCapture): Promise<Blob | null> {
  try {
    return await capture.stop();
  } catch {
    return null;
  }
}

export const RiffrecContext = createContext<RiffrecContextValue | null>(null);

export function RiffrecProvider({
  children,
  displayMedia,
  displayMediaVideo,
  downloadNoticeTitle = "We downloaded the zip file.",
  downloadNoticeMessage = "Share the zip file for feedback.",
  forceEnable,
  forceEnableParam,
  live,
  onError,
  sanitizeError
}: RiffrecProviderProps): React.ReactElement {
  const [status, setStatus] = useState<RiffrecStatus>("idle");
  const [isDownloadNoticeVisible, setDownloadNoticeVisible] = useState(false);
  const statusRef = useRef<RiffrecStatus>("idle");
  const activeSession = useRef<ActiveSession | null>(null);
  const configRef = useRef<RiffrecConfig>({
    displayMedia,
    displayMediaVideo,
    forceEnable,
    forceEnableParam,
    live,
    onError,
    sanitizeError
  });
  const didWarnDisabled = useRef(false);
  const isEnabled =
    forceEnable || isEnabledByUrlParam(forceEnableParam) || readNodeEnv() !== "production";
  const isLiveConfigured = live !== undefined && isEnabled;

  // Live mode (U7). The handle arrives once the lazy chunk has mounted; `start()` waits for it.
  const liveHandle = useRef<LiveHandle | null>(null);
  const liveHandleWaiters = useRef<Array<(handle: LiveHandle | null) => void>>([]);
  const [isLiveReady, setLiveReady] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveSessionSnapshot | null>(null);
  /** True from consent through the archive: `stop()` routes to the live path and unmount leaves it alone (KTD16). */
  const liveActive = useRef(false);
  const liveStopping = useRef<Promise<SessionResult | null> | null>(null);
  const [isLiveStopping, setLiveStopping] = useState(false);
  const didAutoStart = useRef(false);
  /**
   * `autoStart` defaults to "the page was opened with live credentials": a
   * `#riffrec_live=` fragment at mount (read before the lazy chunk strips it)
   * or stored credentials from a reload. Hosts can still force it either way.
   */
  const [hasLiveBootstrap] = useState(() => {
    if (live === undefined || typeof window === "undefined") return false;
    if (parseLiveFragment(window.location.hash).bootstrap !== null) return true;
    return readStoredBootstrap() !== null;
  });
  const shouldAutoStart = live?.autoStart ?? hasLiveBootstrap;

  useEffect(() => {
    configRef.current = {
      displayMedia,
      displayMediaVideo,
      forceEnable,
      forceEnableParam,
      live,
      onError,
      sanitizeError
    };
  }, [displayMedia, displayMediaVideo, forceEnable, forceEnableParam, live, onError, sanitizeError]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!isEnabled && !didWarnDisabled.current && typeof console !== "undefined") {
      console.warn("[riffrec] Disabled in production. Pass forceEnable={true} to opt in.");
      didWarnDisabled.current = true;
      setStatus("disabled");
    }
  }, [isEnabled]);

  const setStatusNow = useCallback((next: RiffrecStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Ends a live session and assembles the archive (R4): recording segments, voice, events, and the live files. */
  const stopLive = useCallback(async (): Promise<SessionResult | null> => {
    if (liveStopping.current) return liveStopping.current;
    const handle = liveHandle.current;
    if (!handle) return null;

    const run = (async (): Promise<SessionResult | null> => {
      setLiveStopping(true);
      setStatusNow("stopping");
      try {
        const stopped = await handle.stop();
        liveActive.current = false;
        if (!stopped) {
          setStatusNow("idle");
          return null;
        }
        const writer = new SessionWriter({ reactVersion: React.version });
        const result = await writer.stop(stopped.outputs, {
          download: stopped.options.download,
          live: stopped.live,
          recordingSegments: stopped.recordingSegments
        });
        await stopped.options.onSessionComplete?.(result);
        setStatusNow("idle");
        // The ended card already stands in for the notice when the endpoint ended the session.
        setDownloadNoticeVisible(stopped.options.download !== false && stopped.endedBy === "stop");
        return result;
      } catch (error) {
        liveActive.current = false;
        configRef.current.onError?.(toError(error));
        setStatusNow("error");
        return null;
      } finally {
        setLiveStopping(false);
      }
    })();
    liveStopping.current = run;
    try {
      return await run;
    } finally {
      liveStopping.current = null;
    }
  }, [setStatusNow]);

  const stop = useCallback(async (): Promise<SessionResult | null> => {
    if (liveActive.current) {
      return stopLive();
    }

    const session = activeSession.current;
    if (!session || statusRef.current !== "recording") {
      return null;
    }

    statusRef.current = "stopping";
    setStatus("stopping");

    session.eventCapture.stop();
    session.networkCapture.stop();
    session.consoleCapture.stop();

    if (session.ownsGlobalPatchMarker && typeof window !== "undefined") {
      delete window.__RIFFREC_PATCHED__;
    }

    const [screenBlob, voiceBlob] = await Promise.all([
      safeStopMedia(session.screen),
      safeStopMedia(session.voice)
    ]);

    const durationSeconds = (Date.now() - session.sessionStart) / 1000;
    const outputs: CaptureOutputs = {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      durationSeconds,
      events: session.events,
      screenBlob,
      voiceBlob
    };

    activeSession.current = null;

    try {
      const writer = new SessionWriter({
        reactVersion: React.version
      });
      const result = await writer.stop(outputs, { download: session.options.download });
      await session.options.onSessionComplete?.(result);
      statusRef.current = "idle";
      setStatus("idle");
      setDownloadNoticeVisible(session.options.download !== false);
      return result;
    } catch (error) {
      const err = toError(error);
      configRef.current.onError?.(err);
      statusRef.current = "error";
      setStatus("error");
      return null;
    }
  }, [stopLive]);

  const awaitLiveHandle = useCallback((): Promise<LiveHandle | null> => {
    if (liveHandle.current) return Promise.resolve(liveHandle.current);
    return new Promise((resolve) => liveHandleWaiters.current.push(resolve));
  }, []);

  const start = useCallback(async (options: RiffrecSessionOptions = {}): Promise<void> => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }

    if (statusRef.current === "recording" || statusRef.current === "stopping" || liveActive.current) {
      return;
    }

    if (isLiveConfigured) {
      setDownloadNoticeVisible(false);
      const handle = await awaitLiveHandle();
      if (!handle || liveActive.current || liveStopping.current) return;
      handle.begin(options);
      return;
    }

    setDownloadNoticeVisible(false);
    const sessionStart = Date.now();
    const screen = new ScreenCapture(
      configRef.current.displayMedia,
      configRef.current.displayMediaVideo
    );
    const voice = new VoiceCapture();
    const eventCapture = new EventCapture();
    const networkCapture = new NetworkCapture();
    const consoleCapture = new ConsoleCapture();
    const events: RiffrecEvent[] = [];
    const onEvent = (event: RiffrecEvent) => events.push(event);
    const ownsGlobalPatchMarker = !window.__RIFFREC_PATCHED__;

    if (!ownsGlobalPatchMarker && typeof console !== "undefined") {
      console.warn("[riffrec] Another riffrec instance is already active -- skipping global patches.");
    }

    if (ownsGlobalPatchMarker) {
      window.__RIFFREC_PATCHED__ = true;
    }

    statusRef.current = "recording";
    setStatus("recording");

    try {
      await screen.start();
      await voice.start();

      if (ownsGlobalPatchMarker) {
        eventCapture.start(sessionStart, onEvent);
        networkCapture.start(sessionStart, onEvent);
        consoleCapture.start(sessionStart, onEvent, configRef.current.sanitizeError);
      }

      activeSession.current = {
        sessionId: createSessionId(),
        startedAt: new Date(sessionStart),
        sessionStart,
        events,
        screen,
        voice,
        eventCapture,
        networkCapture,
        consoleCapture,
        ownsGlobalPatchMarker,
        options
      };
    } catch (error) {
      eventCapture.stop();
      networkCapture.stop();
      consoleCapture.stop();
      await Promise.all([safeStopMedia(screen), safeStopMedia(voice)]);
      if (ownsGlobalPatchMarker) {
        delete window.__RIFFREC_PATCHED__;
      }

      const err = toError(error);
      configRef.current.onError?.(err);
      statusRef.current = "error";
      setStatus("error");
      throw err;
    }
  }, [awaitLiveHandle, isEnabled, isLiveConfigured]);

  // KTD16: a live session survives the provider unmounting; only classic sessions stop here.
  useEffect(
    () => () => {
      if (!liveActive.current) void stop();
    },
    [stop]
  );

  const handleLiveHandle = useCallback((handle: LiveHandle | null) => {
    liveHandle.current = handle;
    setLiveReady(handle !== null);
    if (handle) {
      for (const resolve of liveHandleWaiters.current.splice(0)) resolve(handle);
    }
  }, []);

  const handleLiveSnapshot = useCallback(
    (snapshot: LiveSessionSnapshot) => {
      setLiveSnapshot(snapshot);
      if (liveStopping.current) return;
      switch (snapshot.status) {
        case "idle":
          if (liveActive.current) {
            liveActive.current = false;
            setStatusNow("idle");
          }
          return;
        case "ended":
          // The runtime reports `onEnded`; the archive path owns the status from there.
          return;
        case "error":
          liveActive.current = true;
          setStatusNow("error");
          return;
        case "consenting":
        case "connecting":
        case "live":
        case "live_novoice":
        case "buffering":
        case "reconnecting":
        case "incompatible":
          liveActive.current = true;
          if (statusRef.current !== "live") setStatusNow("live");
          return;
        default: {
          const exhaustive: never = snapshot.status;
          return exhaustive;
        }
      }
    },
    [setStatusNow]
  );

  const handleLiveEnded = useCallback(() => {
    liveActive.current = true;
    void stopLive();
  }, [stopLive]);

  const handleLiveError = useCallback((error: Error) => {
    configRef.current.onError?.(error);
  }, []);

  useEffect(() => {
    if (!isLiveConfigured || !shouldAutoStart || !isLiveReady || didAutoStart.current) return;
    if (statusRef.current !== "idle" || liveActive.current) return;
    didAutoStart.current = true;
    void start();
  }, [isLiveConfigured, isLiveReady, shouldAutoStart, start]);

  const liveControls = useMemo<RiffrecLiveControls>(
    () => ({
      status: isLiveConfigured ? (liveSnapshot?.status ?? "idle") : "disabled",
      mode: liveSnapshot?.mode ?? DEFAULT_LIVE_MODE,
      setMode: (mode) => liveHandle.current?.setMode(mode),
      muted: liveSnapshot?.muted ?? false,
      setMuted: (muted) => liveHandle.current?.setMuted(muted),
      send: () => liveHandle.current?.send() ?? Promise.resolve(false),
      stop: stopLive
    }),
    [isLiveConfigured, liveSnapshot, stopLive]
  );

  const value = useMemo<RiffrecContextValue>(
    () => ({
      start,
      stop,
      status,
      isEnabled,
      live: liveControls
    }),
    [isEnabled, liveControls, start, status, stop]
  );

  const isRecordingVisible = status === "recording" || (status === "stopping" && !isLiveStopping);

  return (
    <RiffrecContext.Provider value={value}>
      {children}
      {isLiveConfigured && live ? (
        <Suspense fallback={null}>
          <LiveMount
            config={live}
            capture={{ displayMedia, displayMediaVideo, sanitizeError }}
            onHandle={handleLiveHandle}
            onSnapshot={handleLiveSnapshot}
            onEnded={handleLiveEnded}
            onError={handleLiveError}
          />
        </Suspense>
      ) : null}
      {isRecordingVisible ? (
        <div aria-live="polite" role="status" style={recordingOverlayStyle}>
          <span aria-hidden="true" style={recordingDotStyle} />
          <span style={recordingTextStyle}>
            <span style={recordingTitleStyle}>Recording feedback</span>
            <span style={recordingHintStyle}>
              Stop when you are ready to save the ZIP file.
            </span>
          </span>
          <button
            type="button"
            disabled={status === "stopping"}
            style={status === "stopping" ? recordingStopDisabledStyle : recordingStopButtonStyle}
            onClick={() => void stop()}
          >
            {status === "stopping" ? "Saving..." : "Stop and save"}
          </button>
        </div>
      ) : null}
      {isDownloadNoticeVisible ? (
        <div aria-live="polite" role="status" style={downloadNoticeStyle}>
          <span aria-hidden="true" style={downloadNoticeIconStyle}>
            ✓
          </span>
          <span style={recordingTextStyle}>
            <span style={recordingTitleStyle}>{downloadNoticeTitle}</span>
            <span style={recordingHintStyle}>{downloadNoticeMessage}</span>
          </span>
          <button
            type="button"
            style={downloadNoticeButtonStyle}
            onClick={() => setDownloadNoticeVisible(false)}
          >
            Got it
          </button>
        </div>
      ) : null}
    </RiffrecContext.Provider>
  );
}

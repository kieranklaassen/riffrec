import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import * as React from "react";
import { ConsoleCapture } from "./capture/console";
import { EventCapture } from "./capture/events";
import { NetworkCapture } from "./capture/network";
import { ScreenCapture } from "./capture/screen";
import { VoiceCapture } from "./capture/voice";
import { SessionWriter } from "./output/session";
import type {
  CaptureOutputs,
  RiffrecConfig,
  RiffrecContextValue,
  RiffrecEvent,
  RiffrecStatus,
  SessionResult
} from "./types";

const DEFAULT_FORCE_ENABLE_PARAM = "riffrec";
const ENABLE_PARAM_VALUES = new Set(["", "1", "true", "on", "yes"]);

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
  displayMediaVideo,
  forceEnable,
  forceEnableParam,
  onError,
  sanitizeError
}: RiffrecProviderProps): React.ReactElement {
  const [status, setStatus] = useState<RiffrecStatus>("idle");
  const statusRef = useRef<RiffrecStatus>("idle");
  const activeSession = useRef<ActiveSession | null>(null);
  const configRef = useRef<RiffrecConfig>({
    displayMediaVideo,
    forceEnable,
    forceEnableParam,
    onError,
    sanitizeError
  });
  const didWarnDisabled = useRef(false);
  const isEnabled =
    forceEnable || isEnabledByUrlParam(forceEnableParam) || readNodeEnv() !== "production";

  useEffect(() => {
    configRef.current = {
      displayMediaVideo,
      forceEnable,
      forceEnableParam,
      onError,
      sanitizeError
    };
  }, [displayMediaVideo, forceEnable, forceEnableParam, onError, sanitizeError]);

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

  const stop = useCallback(async (): Promise<SessionResult | null> => {
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
      const result = await writer.stop(outputs);
      statusRef.current = "idle";
      setStatus("idle");
      return result;
    } catch (error) {
      const err = toError(error);
      configRef.current.onError?.(err);
      statusRef.current = "error";
      setStatus("error");
      return null;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }

    if (statusRef.current === "recording" || statusRef.current === "stopping") {
      return;
    }

    const sessionStart = Date.now();
    const screen = new ScreenCapture(configRef.current.displayMediaVideo);
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
        ownsGlobalPatchMarker
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
  }, [isEnabled]);

  useEffect(() => () => void stop(), [stop]);

  const value = useMemo<RiffrecContextValue>(
    () => ({
      start,
      stop,
      status,
      isEnabled
    }),
    [isEnabled, start, status, stop]
  );

  return <RiffrecContext.Provider value={value}>{children}</RiffrecContext.Provider>;
}

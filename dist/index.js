import "./chunk-2GWEBU4Q.js";
import {
  ConsoleCapture,
  DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO,
  EventCapture,
  NetworkCapture,
  RECORDING_FILE_NAME,
  ScreenCapture,
  VoiceCapture,
  isRecordingFileName,
  segmentFileName
} from "./chunk-VSLQO3S3.js";
import {
  CHECKPOINT_TRIGGERS,
  DEFAULT_EXECUTION_MODE,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  getLiveTool,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  validateEnvelope
} from "./chunk-J2APQL3M.js";

// src/RiffrecProvider.tsx
import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import * as React from "react";

// src/types.ts
var RIFFREC_SCHEMA_VERSION = "1.0.0";

// src/output/zip.ts
import { zip, zipSync } from "fflate";
var MAX_RECORDING_IN_ZIP_BYTES = 50 * 1024 * 1024;
async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
function zipAsync(files) {
  return new Promise((resolve, reject) => {
    zip(files, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}
function toArrayBuffer(value) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
function downloadSessionArchive(filename, blob) {
  if (typeof window === "undefined" || typeof document === "undefined" || !URL.createObjectURL) {
    throw new Error("Browser download APIs are not available.");
  }
  const url = URL.createObjectURL(blob);
  const fragment = document.createRange().createContextualFragment('<a style="display: none"></a>');
  const anchor = fragment.firstElementChild;
  if (!anchor) {
    throw new Error("Browser download anchor could not be created.");
  }
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
var ZipWriter = class {
  async writeSession(sessionDirName, files, { download = true } = {}) {
    const zipFiles = {};
    let totalBytes = 0;
    for (const [filename2, blob] of filterZipSessionFiles(files)) {
      zipFiles[filename2] = await blobToUint8Array(blob);
      totalBytes += blob.size;
    }
    const data = totalBytes < MAX_RECORDING_IN_ZIP_BYTES ? zipSync(zipFiles) : await zipAsync(zipFiles);
    const archive = new Blob([toArrayBuffer(data)], { type: "application/zip" });
    const filename = `${sessionDirName}.zip`;
    if (download) {
      downloadSessionArchive(filename, archive);
    }
    return { filename, archive };
  }
};
function filterZipSessionFiles(files) {
  let recordingBytes = 0;
  for (const [filename, blob] of files) {
    if (isRecordingFileName(filename)) recordingBytes += blob.size;
  }
  const dropRecordings = recordingBytes > MAX_RECORDING_IN_ZIP_BYTES;
  const filtered = /* @__PURE__ */ new Map();
  for (const [filename, blob] of files) {
    if (dropRecordings && isRecordingFileName(filename)) {
      continue;
    }
    filtered.set(filename, blob);
  }
  return filtered;
}

// src/output/session.ts
var LIVE_TRANSCRIPT_FILE = "transcript.json";
var LIVE_UNITS_FILE = "units.json";
var LIVE_ANNOTATIONS_FILE = "annotations.json";
var LIVE_FRAMES_DIR = "frames";
var LIVE_CLIPS_DIR = "clips";
function addLiveFiles(files, live) {
  if (!live) return;
  if (live.transcript) files.set(LIVE_TRANSCRIPT_FILE, jsonBlob(live.transcript));
  if (live.units) files.set(LIVE_UNITS_FILE, jsonBlob(live.units));
  if (live.annotations) files.set(LIVE_ANNOTATIONS_FILE, jsonBlob(live.annotations));
  for (const [name, blob] of Object.entries(live.frames ?? {})) {
    files.set(`${LIVE_FRAMES_DIR}/${name}`, blob);
  }
  for (const [name, blob] of Object.entries(live.clips ?? {})) {
    files.set(`${LIVE_CLIPS_DIR}/${name}`, blob);
  }
}
function addRecordingFiles(files, screenBlob, segments) {
  const present = (segments ?? []).filter((segment) => segment.size > 0);
  if (present.length > 0) {
    present.forEach((segment, index) => files.set(segmentFileName(index + 1), segment));
    return;
  }
  if (screenBlob) files.set(RECORDING_FILE_NAME, screenBlob);
}
function pad(value) {
  return String(value).padStart(2, "0");
}
function createShortId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8);
}
function createSessionDirName(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `riffrec-${year}-${month}-${day}-${hours}${minutes}-${createShortId()}`;
}
function jsonBlob(value) {
  return new Blob([`${JSON.stringify(value, null, 2)}
`], { type: "application/json" });
}
function readBrowser() {
  return typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
}
function readUrl() {
  return typeof window !== "undefined" ? window.location.href : "";
}
function buildEventsJson(outputs) {
  return {
    version: "1",
    schema_version: RIFFREC_SCHEMA_VERSION,
    session_id: outputs.sessionId,
    url: readUrl(),
    started_at: outputs.startedAt.toISOString(),
    duration_seconds: outputs.durationSeconds,
    events: outputs.events
  };
}
function buildSessionJson(outputs, endedAt, reactVersion, filesPresent) {
  return {
    url: readUrl(),
    react_version: reactVersion,
    browser: readBrowser(),
    started_at: outputs.startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: outputs.durationSeconds,
    files_present: filesPresent
  };
}
function withSessionJson(files, outputs, endedAt, reactVersion) {
  const filesPresent = ["session.json", ...Array.from(files.keys())];
  const sessionJson = buildSessionJson(outputs, endedAt, reactVersion, filesPresent);
  return {
    files: new Map([["session.json", jsonBlob(sessionJson)], ...files]),
    filesPresent
  };
}
var SessionWriter = class {
  constructor(options = {}) {
    this.options = options;
    this.zipWriter = new ZipWriter();
  }
  async stop(outputs, options = {}) {
    const endedAt = /* @__PURE__ */ new Date();
    const sessionDirName = createSessionDirName(endedAt);
    const eventsJson = buildEventsJson(outputs);
    const files = /* @__PURE__ */ new Map();
    files.set("events.json", jsonBlob(eventsJson));
    addRecordingFiles(files, outputs.screenBlob, options.recordingSegments);
    if (outputs.voiceBlob) {
      files.set("voice.webm", outputs.voiceBlob);
    }
    addLiveFiles(files, options.live);
    const zipSession = withSessionJson(
      filterZipSessionFiles(files),
      outputs,
      endedAt,
      this.options.reactVersion ?? null
    );
    const { filename, archive } = await this.zipWriter.writeSession(
      sessionDirName,
      zipSession.files,
      options
    );
    return {
      sessionPath: filename,
      method: "zip",
      filesPresent: zipSession.filesPresent,
      sessionId: outputs.sessionId,
      filename,
      archive
    };
  }
};

// src/RiffrecProvider.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var LiveMount = lazy(() => import("./LiveOverlay-NUPCMTAK.js"));
var DEFAULT_LIVE_MODE = "smart";
var DEFAULT_FORCE_ENABLE_PARAM = "riffrec";
var ENABLE_PARAM_VALUES = /* @__PURE__ */ new Set(["", "1", "true", "on", "yes"]);
var recordingOverlayStyle = {
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
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  pointerEvents: "auto"
};
var recordingDotStyle = {
  width: 14,
  height: 14,
  flex: "0 0 auto",
  borderRadius: "50%",
  background: "#ef4444",
  boxShadow: "0 0 0 6px rgba(239, 68, 68, 0.22), 0 0 24px rgba(239, 68, 68, 0.72)"
};
var recordingTextStyle = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  lineHeight: 1.15
};
var recordingTitleStyle = {
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.02em",
  textTransform: "uppercase"
};
var recordingHintStyle = {
  marginTop: 3,
  color: "rgba(255, 255, 255, 0.78)",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap"
};
var recordingStopButtonStyle = {
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
var recordingStopDisabledStyle = {
  ...recordingStopButtonStyle,
  cursor: "not-allowed",
  opacity: 0.68
};
var downloadNoticeStyle = {
  ...recordingOverlayStyle,
  background: "rgba(6, 78, 59, 0.95)",
  boxShadow: "0 24px 70px rgba(6, 78, 59, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.14)"
};
var downloadNoticeIconStyle = {
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
var downloadNoticeButtonStyle = {
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
function readNodeEnv() {
  const maybeProcess = globalThis;
  return maybeProcess.process?.env?.NODE_ENV;
}
function isEnabledByUrlParam(forceEnableParam) {
  if (!forceEnableParam || typeof window === "undefined") {
    return false;
  }
  const paramName = forceEnableParam === true ? DEFAULT_FORCE_ENABLE_PARAM : forceEnableParam;
  const rawValue = new URLSearchParams(window.location.search).get(paramName);
  return rawValue !== null && ENABLE_PARAM_VALUES.has(rawValue.toLowerCase());
}
function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `riffrec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}
async function safeStopMedia(capture) {
  try {
    return await capture.stop();
  } catch {
    return null;
  }
}
var RiffrecContext = createContext(null);
function RiffrecProvider({
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
}) {
  const [status, setStatus] = useState("idle");
  const [isDownloadNoticeVisible, setDownloadNoticeVisible] = useState(false);
  const statusRef = useRef("idle");
  const activeSession = useRef(null);
  const configRef = useRef({
    displayMedia,
    displayMediaVideo,
    forceEnable,
    forceEnableParam,
    live,
    onError,
    sanitizeError
  });
  const didWarnDisabled = useRef(false);
  const isEnabled = forceEnable || isEnabledByUrlParam(forceEnableParam) || readNodeEnv() !== "production";
  const isLiveConfigured = live !== void 0 && isEnabled;
  const liveHandle = useRef(null);
  const liveHandleWaiters = useRef([]);
  const [isLiveReady, setLiveReady] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const liveActive = useRef(false);
  const liveStopping = useRef(null);
  const [isLiveStopping, setLiveStopping] = useState(false);
  const didAutoStart = useRef(false);
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
  const setStatusNow = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const stopLive = useCallback(async () => {
    if (liveStopping.current) return liveStopping.current;
    const handle = liveHandle.current;
    if (!handle) return null;
    const run = (async () => {
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
  const stop = useCallback(async () => {
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
    const durationSeconds = (Date.now() - session.sessionStart) / 1e3;
    const outputs = {
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
  const awaitLiveHandle = useCallback(() => {
    if (liveHandle.current) return Promise.resolve(liveHandle.current);
    return new Promise((resolve) => liveHandleWaiters.current.push(resolve));
  }, []);
  const start = useCallback(async (options = {}) => {
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
    const events = [];
    const onEvent = (event) => events.push(event);
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
  useEffect(
    () => () => {
      if (!liveActive.current) void stop();
    },
    [stop]
  );
  const handleLiveHandle = useCallback((handle) => {
    liveHandle.current = handle;
    setLiveReady(handle !== null);
    if (handle) {
      for (const resolve of liveHandleWaiters.current.splice(0)) resolve(handle);
    }
  }, []);
  const handleLiveSnapshot = useCallback(
    (snapshot) => {
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
          const exhaustive = snapshot.status;
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
  const handleLiveError = useCallback((error) => {
    configRef.current.onError?.(error);
  }, []);
  useEffect(() => {
    if (!isLiveConfigured || !live?.autoStart || !isLiveReady || didAutoStart.current) return;
    if (statusRef.current !== "idle" || liveActive.current) return;
    didAutoStart.current = true;
    void start();
  }, [isLiveConfigured, isLiveReady, live?.autoStart, start]);
  const liveControls = useMemo(
    () => ({
      status: isLiveConfigured ? liveSnapshot?.status ?? "idle" : "disabled",
      mode: liveSnapshot?.mode ?? DEFAULT_LIVE_MODE,
      setMode: (mode) => liveHandle.current?.setMode(mode),
      muted: liveSnapshot?.muted ?? false,
      setMuted: (muted) => liveHandle.current?.setMuted(muted),
      send: () => liveHandle.current?.send() ?? Promise.resolve(false),
      stop: stopLive
    }),
    [isLiveConfigured, liveSnapshot, stopLive]
  );
  const value = useMemo(
    () => ({
      start,
      stop,
      status,
      isEnabled,
      live: liveControls
    }),
    [isEnabled, liveControls, start, status, stop]
  );
  const isRecordingVisible = status === "recording" || status === "stopping" && !isLiveStopping;
  return /* @__PURE__ */ jsxs(RiffrecContext.Provider, { value, children: [
    children,
    isLiveConfigured && live ? /* @__PURE__ */ jsx(Suspense, { fallback: null, children: /* @__PURE__ */ jsx(
      LiveMount,
      {
        config: live,
        capture: { displayMedia, displayMediaVideo, sanitizeError },
        onHandle: handleLiveHandle,
        onSnapshot: handleLiveSnapshot,
        onEnded: handleLiveEnded,
        onError: handleLiveError
      }
    ) }) : null,
    isRecordingVisible ? /* @__PURE__ */ jsxs("div", { "aria-live": "polite", role: "status", style: recordingOverlayStyle, children: [
      /* @__PURE__ */ jsx("span", { "aria-hidden": "true", style: recordingDotStyle }),
      /* @__PURE__ */ jsxs("span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ jsx("span", { style: recordingTitleStyle, children: "Recording feedback" }),
        /* @__PURE__ */ jsx("span", { style: recordingHintStyle, children: "Stop when you are ready to save the ZIP file." })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: status === "stopping",
          style: status === "stopping" ? recordingStopDisabledStyle : recordingStopButtonStyle,
          onClick: () => void stop(),
          children: status === "stopping" ? "Saving..." : "Stop and save"
        }
      )
    ] }) : null,
    isDownloadNoticeVisible ? /* @__PURE__ */ jsxs("div", { "aria-live": "polite", role: "status", style: downloadNoticeStyle, children: [
      /* @__PURE__ */ jsx("span", { "aria-hidden": "true", style: downloadNoticeIconStyle, children: "\u2713" }),
      /* @__PURE__ */ jsxs("span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ jsx("span", { style: recordingTitleStyle, children: downloadNoticeTitle }),
        /* @__PURE__ */ jsx("span", { style: recordingHintStyle, children: downloadNoticeMessage })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          style: downloadNoticeButtonStyle,
          onClick: () => setDownloadNoticeVisible(false),
          children: "Got it"
        }
      )
    ] }) : null
  ] });
}

// src/RiffrecRecorder.tsx
import { useContext, useState as useState2 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(12, 18, 28, 0.56)",
  padding: 16
};
var dialogStyle = {
  width: "min(520px, 100%)",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 24px 80px rgba(16, 24, 40, 0.28)",
  padding: 24,
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};
var buttonStyle = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "9px 14px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};
var secondaryButtonStyle = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};
var dangerButtonStyle = {
  ...buttonStyle,
  background: "#b42318",
  borderColor: "#b42318"
};
var disabledButtonStyle = {
  ...buttonStyle,
  cursor: "not-allowed",
  opacity: 0.56
};
var indicatorStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginLeft: 10,
  color: "#b42318",
  fontSize: 14,
  fontWeight: 600
};
var dotStyle = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#f04438"
};
var defaultConsentDescription = /* @__PURE__ */ jsxs2(Fragment, { children: [
  /* @__PURE__ */ jsx2("p", { style: { margin: "0 0 12px" }, children: "Riffrec will ask your browser for screen and microphone access, then save a local session with:" }),
  /* @__PURE__ */ jsxs2("ul", { style: { margin: "0 0 16px", paddingLeft: 20 }, children: [
    /* @__PURE__ */ jsx2("li", { children: "screen video and microphone audio" }),
    /* @__PURE__ */ jsx2("li", { children: "clicks, navigation, network URLs and statuses" }),
    /* @__PURE__ */ jsx2("li", { children: "console errors and stack traces" })
  ] }),
  /* @__PURE__ */ jsx2("p", { style: { margin: 0 }, children: "Password and hidden input text is omitted from DOM events, but anything visible on screen can appear in the video, and anything spoken near the microphone can appear in the audio." })
] });
function useRiffrecContext() {
  const context = useContext(RiffrecContext);
  if (!context) {
    throw new Error("RiffrecRecorder must be used within RiffrecProvider");
  }
  return context;
}
function RiffrecRecorder({
  className,
  startLabel = "Record feedback",
  stopLabel = "Stop recording",
  disabledLabel = "Recording unavailable",
  consentTitle = "Start recording?",
  consentDescription = defaultConsentDescription,
  consentLabel = "I understand and consent to this recording",
  download = true,
  onSessionComplete
}) {
  const { start, stop, status, isEnabled } = useRiffrecContext();
  const [isConsentOpen, setConsentOpen] = useState2(false);
  const [hasConsented, setHasConsented] = useState2(false);
  const [isBusy, setBusy] = useState2(false);
  const handleStop = async () => {
    setBusy(true);
    try {
      await stop();
    } finally {
      setBusy(false);
    }
  };
  const handleStart = async () => {
    setBusy(true);
    try {
      await start({ download, onSessionComplete });
      setConsentOpen(false);
      setHasConsented(false);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const isRecording = status === "recording" || status === "stopping";
  return /* @__PURE__ */ jsxs2("span", { className, children: [
    /* @__PURE__ */ jsx2(
      "button",
      {
        type: "button",
        disabled: !isEnabled || isBusy,
        style: !isEnabled || isBusy ? disabledButtonStyle : isRecording ? dangerButtonStyle : buttonStyle,
        onClick: isRecording ? handleStop : () => setConsentOpen(true),
        children: isRecording ? stopLabel : isEnabled ? startLabel : disabledLabel
      }
    ),
    isRecording ? /* @__PURE__ */ jsxs2("span", { "aria-live": "polite", style: indicatorStyle, children: [
      /* @__PURE__ */ jsx2("span", { "aria-hidden": "true", style: dotStyle }),
      "Recording"
    ] }) : null,
    isConsentOpen ? /* @__PURE__ */ jsx2("div", { style: overlayStyle, children: /* @__PURE__ */ jsxs2("div", { role: "dialog", "aria-modal": "true", "aria-label": consentTitle, style: dialogStyle, children: [
      /* @__PURE__ */ jsx2("h2", { style: { margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }, children: consentTitle }),
      /* @__PURE__ */ jsx2("div", { style: { fontSize: 14, lineHeight: 1.5 }, children: consentDescription }),
      /* @__PURE__ */ jsxs2("label", { style: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "checkbox",
            checked: hasConsented,
            onChange: (event) => setHasConsented(event.currentTarget.checked)
          }
        ),
        /* @__PURE__ */ jsx2("span", { children: consentLabel })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }, children: [
        /* @__PURE__ */ jsx2("button", { type: "button", style: secondaryButtonStyle, onClick: () => setConsentOpen(false), children: "Cancel" }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            disabled: !hasConsented || isBusy,
            style: !hasConsented || isBusy ? disabledButtonStyle : buttonStyle,
            onClick: handleStart,
            children: "Start recording"
          }
        )
      ] })
    ] }) }) : null
  ] });
}

// src/useRiffrec.ts
import { useContext as useContext2 } from "react";
function useRiffrec() {
  const context = useContext2(RiffrecContext);
  if (!context) {
    throw new Error("useRiffrec must be used within RiffrecProvider");
  }
  return {
    start: context.start,
    stop: context.stop,
    status: context.status,
    live: context.live
  };
}
export {
  CHECKPOINT_TRIGGERS,
  DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO,
  DEFAULT_EXECUTION_MODE,
  EXECUTION_MODES,
  FRAME_DROP_REASONS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_EVENT_TYPES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  LIVE_TOOLS,
  LIVE_TOOL_NAMES,
  RECORD_UNIT_TOOL,
  RELAY_ANSWER_TOOL,
  RiffrecProvider,
  RiffrecRecorder,
  UNIT_STATUSES,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  downloadSessionArchive,
  getLiveTool,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  isLiveEventType,
  isLiveToolName,
  useRiffrec,
  validateEnvelope
};
//# sourceMappingURL=index.js.map
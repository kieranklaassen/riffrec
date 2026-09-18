"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { newObj[key] = obj[key]; } } } newObj.default = obj; return newObj; } } function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }require('./chunk-7QKH5JWE.cjs');













var _chunkVTWYAC7Zcjs = require('./chunk-VTWYAC7Z.cjs');
































var _chunkMTPO77EAcjs = require('./chunk-MTPO77EA.cjs');

// src/RiffrecProvider.tsx









var _react = require('react'); var React = _interopRequireWildcard(_react);


// src/types.ts
var RIFFREC_SCHEMA_VERSION = "1.0.0";

// src/output/zip.ts
var _fflate = require('fflate');
var MAX_RECORDING_IN_ZIP_BYTES = 50 * 1024 * 1024;
async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
function zipAsync(files) {
  return new Promise((resolve, reject) => {
    _fflate.zip.call(void 0, files, (error, data) => {
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
    const data = totalBytes < MAX_RECORDING_IN_ZIP_BYTES ? _fflate.zipSync.call(void 0, zipFiles) : await zipAsync(zipFiles);
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
    if (_chunkVTWYAC7Zcjs.isRecordingFileName.call(void 0, filename)) recordingBytes += blob.size;
  }
  const dropRecordings = recordingBytes > MAX_RECORDING_IN_ZIP_BYTES;
  const filtered = /* @__PURE__ */ new Map();
  for (const [filename, blob] of files) {
    if (dropRecordings && _chunkVTWYAC7Zcjs.isRecordingFileName.call(void 0, filename)) {
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
  for (const [name, blob] of Object.entries(_nullishCoalesce(live.frames, () => ( {})))) {
    files.set(`${LIVE_FRAMES_DIR}/${name}`, blob);
  }
  for (const [name, blob] of Object.entries(_nullishCoalesce(live.clips, () => ( {})))) {
    files.set(`${LIVE_CLIPS_DIR}/${name}`, blob);
  }
}
function addRecordingFiles(files, screenBlob, segments) {
  const present = (_nullishCoalesce(segments, () => ( []))).filter((segment) => segment.size > 0);
  if (present.length > 0) {
    present.forEach((segment, index) => files.set(_chunkVTWYAC7Zcjs.segmentFileName.call(void 0, index + 1), segment));
    return;
  }
  if (screenBlob) files.set(_chunkVTWYAC7Zcjs.RECORDING_FILE_NAME, screenBlob);
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
      _nullishCoalesce(this.options.reactVersion, () => ( null))
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
var _jsxruntime = require('react/jsx-runtime');
var LiveMount = _react.lazy.call(void 0, () => Promise.resolve().then(() => _interopRequireWildcard(require("./LiveOverlay-U35FNUAQ.cjs"))));
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
  return _optionalChain([maybeProcess, 'access', _ => _.process, 'optionalAccess', _2 => _2.env, 'optionalAccess', _3 => _3.NODE_ENV]);
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
  } catch (e) {
    return null;
  }
}
var RiffrecContext = _react.createContext.call(void 0, null);
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
  const [status, setStatus] = _react.useState.call(void 0, "idle");
  const [isDownloadNoticeVisible, setDownloadNoticeVisible] = _react.useState.call(void 0, false);
  const [liveFallbackReason, setLiveFallbackReason] = _react.useState.call(void 0, null);
  const statusRef = _react.useRef.call(void 0, "idle");
  const activeSession = _react.useRef.call(void 0, null);
  const configRef = _react.useRef.call(void 0, {
    displayMedia,
    displayMediaVideo,
    forceEnable,
    forceEnableParam,
    live,
    onError,
    sanitizeError
  });
  const didWarnDisabled = _react.useRef.call(void 0, false);
  const isEnabled = forceEnable || isEnabledByUrlParam(forceEnableParam) || readNodeEnv() !== "production";
  const isLiveConfigured = live !== void 0 && isEnabled;
  const liveHandle = _react.useRef.call(void 0, null);
  const liveHandleWaiters = _react.useRef.call(void 0, []);
  const [isLiveReady, setLiveReady] = _react.useState.call(void 0, false);
  const [liveSnapshot, setLiveSnapshot] = _react.useState.call(void 0, null);
  const liveActive = _react.useRef.call(void 0, false);
  const liveStopping = _react.useRef.call(void 0, null);
  const [isLiveStopping, setLiveStopping] = _react.useState.call(void 0, false);
  const didAutoStart = _react.useRef.call(void 0, false);
  const [hasLiveBootstrap] = _react.useState.call(void 0, () => {
    if (live === void 0 || typeof window === "undefined") return false;
    if (_chunkVTWYAC7Zcjs.parseLiveFragment.call(void 0, window.location.hash).bootstrap !== null) return true;
    return _chunkVTWYAC7Zcjs.readStoredBootstrap.call(void 0, ) !== null;
  });
  const shouldAutoStart = _nullishCoalesce(_optionalChain([live, 'optionalAccess', _4 => _4.autoStart]), () => ( hasLiveBootstrap));
  _react.useEffect.call(void 0, () => {
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
  _react.useEffect.call(void 0, () => {
    statusRef.current = status;
  }, [status]);
  _react.useEffect.call(void 0, () => {
    if (!isEnabled && !didWarnDisabled.current && typeof console !== "undefined") {
      console.warn("[riffrec] Disabled in production. Pass forceEnable={true} to opt in.");
      didWarnDisabled.current = true;
      setStatus("disabled");
    }
  }, [isEnabled]);
  const setStatusNow = _react.useCallback.call(void 0, (next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const stopLive = _react.useCallback.call(void 0, async () => {
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
        const fallback = stopped.endedBy === "stop";
        const preference = _nullishCoalesce(stopped.options.download, () => ( _optionalChain([configRef, 'access', _5 => _5.current, 'access', _6 => _6.live, 'optionalAccess', _7 => _7.download])));
        const download = fallback ? preference !== false : preference === true;
        const writer = new SessionWriter({ reactVersion: React.version });
        const result = await writer.stop(stopped.outputs, {
          download,
          live: stopped.live,
          recordingSegments: stopped.recordingSegments
        });
        await _optionalChain([stopped, 'access', _8 => _8.options, 'access', _9 => _9.onSessionComplete, 'optionalCall', _10 => _10(result)]);
        setStatusNow("idle");
        setLiveFallbackReason(fallback ? stopped.fallbackReason : null);
        setDownloadNoticeVisible(download);
        return result;
      } catch (error) {
        liveActive.current = false;
        _optionalChain([configRef, 'access', _11 => _11.current, 'access', _12 => _12.onError, 'optionalCall', _13 => _13(toError(error))]);
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
  const stop = _react.useCallback.call(void 0, async () => {
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
      await _optionalChain([session, 'access', _14 => _14.options, 'access', _15 => _15.onSessionComplete, 'optionalCall', _16 => _16(result)]);
      statusRef.current = "idle";
      setStatus("idle");
      setDownloadNoticeVisible(session.options.download !== false);
      return result;
    } catch (error) {
      const err = toError(error);
      _optionalChain([configRef, 'access', _17 => _17.current, 'access', _18 => _18.onError, 'optionalCall', _19 => _19(err)]);
      statusRef.current = "error";
      setStatus("error");
      return null;
    }
  }, [stopLive]);
  const awaitLiveHandle = _react.useCallback.call(void 0, () => {
    if (liveHandle.current) return Promise.resolve(liveHandle.current);
    return new Promise((resolve) => liveHandleWaiters.current.push(resolve));
  }, []);
  const start = _react.useCallback.call(void 0, async (options = {}) => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }
    if (statusRef.current === "recording" || statusRef.current === "stopping" || liveActive.current) {
      return;
    }
    if (isLiveConfigured) {
      setDownloadNoticeVisible(false);
      setLiveFallbackReason(null);
      const handle = await awaitLiveHandle();
      if (!handle || liveActive.current || liveStopping.current) return;
      handle.begin(options);
      return;
    }
    setDownloadNoticeVisible(false);
    const sessionStart = Date.now();
    const screen = new (0, _chunkVTWYAC7Zcjs.ScreenCapture)(
      configRef.current.displayMedia,
      configRef.current.displayMediaVideo
    );
    const voice = new (0, _chunkVTWYAC7Zcjs.VoiceCapture)();
    const eventCapture = new (0, _chunkVTWYAC7Zcjs.EventCapture)();
    const networkCapture = new (0, _chunkVTWYAC7Zcjs.NetworkCapture)();
    const consoleCapture = new (0, _chunkVTWYAC7Zcjs.ConsoleCapture)();
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
      _optionalChain([configRef, 'access', _20 => _20.current, 'access', _21 => _21.onError, 'optionalCall', _22 => _22(err)]);
      statusRef.current = "error";
      setStatus("error");
      throw err;
    }
  }, [awaitLiveHandle, isEnabled, isLiveConfigured]);
  _react.useEffect.call(void 0, 
    () => () => {
      if (!liveActive.current) void stop();
    },
    [stop]
  );
  const handleLiveHandle = _react.useCallback.call(void 0, (handle) => {
    liveHandle.current = handle;
    setLiveReady(handle !== null);
    if (handle) {
      for (const resolve of liveHandleWaiters.current.splice(0)) resolve(handle);
    }
  }, []);
  const handleLiveSnapshot = _react.useCallback.call(void 0, 
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
  const handleLiveEnded = _react.useCallback.call(void 0, () => {
    liveActive.current = true;
    void stopLive();
  }, [stopLive]);
  const startLive = _react.useCallback.call(void 0, () => void start(), [start]);
  const handleLiveError = _react.useCallback.call(void 0, (error) => {
    _optionalChain([configRef, 'access', _23 => _23.current, 'access', _24 => _24.onError, 'optionalCall', _25 => _25(error)]);
  }, []);
  _react.useEffect.call(void 0, () => {
    if (!isLiveConfigured || !shouldAutoStart || !isLiveReady || didAutoStart.current) return;
    if (statusRef.current !== "idle" || liveActive.current) return;
    didAutoStart.current = true;
    void start();
  }, [isLiveConfigured, isLiveReady, shouldAutoStart, start]);
  const liveControls = _react.useMemo.call(void 0, 
    () => ({
      status: isLiveConfigured ? _nullishCoalesce(_optionalChain([liveSnapshot, 'optionalAccess', _26 => _26.status]), () => ( "idle")) : "disabled",
      mode: _nullishCoalesce(_optionalChain([liveSnapshot, 'optionalAccess', _27 => _27.mode]), () => ( DEFAULT_LIVE_MODE)),
      setMode: (mode) => _optionalChain([liveHandle, 'access', _28 => _28.current, 'optionalAccess', _29 => _29.setMode, 'call', _30 => _30(mode)]),
      muted: _nullishCoalesce(_optionalChain([liveSnapshot, 'optionalAccess', _31 => _31.muted]), () => ( false)),
      setMuted: (muted) => _optionalChain([liveHandle, 'access', _32 => _32.current, 'optionalAccess', _33 => _33.setMuted, 'call', _34 => _34(muted)]),
      send: () => _nullishCoalesce(_optionalChain([liveHandle, 'access', _35 => _35.current, 'optionalAccess', _36 => _36.send, 'call', _37 => _37()]), () => ( Promise.resolve(false))),
      stop: stopLive
    }),
    [isLiveConfigured, liveSnapshot, stopLive]
  );
  const value = _react.useMemo.call(void 0, 
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
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, RiffrecContext.Provider, { value, children: [
    children,
    isLiveConfigured && live ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, _react.Suspense, { fallback: null, children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      LiveMount,
      {
        config: live,
        capture: { displayMedia, displayMediaVideo, sanitizeError },
        onHandle: handleLiveHandle,
        onSnapshot: handleLiveSnapshot,
        onEnded: handleLiveEnded,
        onError: handleLiveError,
        onStart: startLive
      }
    ) }) : null,
    isRecordingVisible ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "aria-live": "polite", role: "status", style: recordingOverlayStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "aria-hidden": "true", style: recordingDotStyle }),
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: recordingTitleStyle, children: "Recording feedback" }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: recordingHintStyle, children: "Stop when you are ready to save the ZIP file." })
      ] }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
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
    isDownloadNoticeVisible ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "aria-live": "polite", role: "status", style: downloadNoticeStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "aria-hidden": "true", style: downloadNoticeIconStyle, children: "\u2713" }),
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: recordingTitleStyle, children: downloadNoticeTitle }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: recordingHintStyle, children: downloadNoticeMessage }),
        liveFallbackReason ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { "data-riffrec-live-fallback-reason": "", style: recordingHintStyle, children: [
          "Live endpoint did not confirm the end: ",
          liveFallbackReason,
          "."
        ] }) : null
      ] }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
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
var defaultConsentDescription = /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, _jsxruntime.Fragment, { children: [
  /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: "0 0 12px" }, children: "Riffrec will ask your browser for screen and microphone access, then save a local session with:" }),
  /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "ul", { style: { margin: "0 0 16px", paddingLeft: 20 }, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "li", { children: "screen video and microphone audio" }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "li", { children: "clicks, navigation, network URLs and statuses" }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "li", { children: "console errors and stack traces" })
  ] }),
  /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: 0 }, children: "Password and hidden input text is omitted from DOM events, but anything visible on screen can appear in the video, and anything spoken near the microphone can appear in the audio." })
] });
function useRiffrecContext() {
  const context = _react.useContext.call(void 0, RiffrecContext);
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
  const [isConsentOpen, setConsentOpen] = _react.useState.call(void 0, false);
  const [hasConsented, setHasConsented] = _react.useState.call(void 0, false);
  const [isBusy, setBusy] = _react.useState.call(void 0, false);
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
    } catch (e2) {
    } finally {
      setBusy(false);
    }
  };
  const isRecording = status === "recording" || status === "stopping";
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { className, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      "button",
      {
        type: "button",
        disabled: !isEnabled || isBusy,
        style: !isEnabled || isBusy ? disabledButtonStyle : isRecording ? dangerButtonStyle : buttonStyle,
        onClick: isRecording ? handleStop : () => setConsentOpen(true),
        children: isRecording ? stopLabel : isEnabled ? startLabel : disabledLabel
      }
    ),
    isRecording ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { "aria-live": "polite", style: indicatorStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "aria-hidden": "true", style: dotStyle }),
      "Recording"
    ] }) : null,
    isConsentOpen ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { style: overlayStyle, children: /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { role: "dialog", "aria-modal": "true", "aria-label": consentTitle, style: dialogStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "h2", { style: { margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }, children: consentTitle }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { style: { fontSize: 14, lineHeight: 1.5 }, children: consentDescription }),
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "label", { style: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          "input",
          {
            type: "checkbox",
            checked: hasConsented,
            onChange: (event) => setHasConsented(event.currentTarget.checked)
          }
        ),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { children: consentLabel })
      ] }),
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", style: secondaryButtonStyle, onClick: () => setConsentOpen(false), children: "Cancel" }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
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

function useRiffrec() {
  const context = _react.useContext.call(void 0, RiffrecContext);
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






































exports.ALWAYS_WAKE_TRIGGERS = _chunkMTPO77EAcjs.ALWAYS_WAKE_TRIGGERS; exports.BRIEF_MAX_CHARS = _chunkMTPO77EAcjs.BRIEF_MAX_CHARS; exports.CHECKPOINT_TRIGGERS = _chunkMTPO77EAcjs.CHECKPOINT_TRIGGERS; exports.DEFAULT_DISPLAY_MEDIA_OPTIONS = _chunkVTWYAC7Zcjs.DEFAULT_DISPLAY_MEDIA_OPTIONS; exports.DEFAULT_DISPLAY_MEDIA_VIDEO = _chunkVTWYAC7Zcjs.DEFAULT_DISPLAY_MEDIA_VIDEO; exports.DEFAULT_EXECUTION_MODE = _chunkMTPO77EAcjs.DEFAULT_EXECUTION_MODE; exports.DEFAULT_INTERVIEWER_INSTRUCTIONS = _chunkMTPO77EAcjs.DEFAULT_INTERVIEWER_INSTRUCTIONS; exports.EXECUTION_MODES = _chunkMTPO77EAcjs.EXECUTION_MODES; exports.FRAME_DROP_REASONS = _chunkMTPO77EAcjs.FRAME_DROP_REASONS; exports.LIVE_EVENTS_BODY_MAX_BYTES = _chunkMTPO77EAcjs.LIVE_EVENTS_BODY_MAX_BYTES; exports.LIVE_EVENT_TYPES = _chunkMTPO77EAcjs.LIVE_EVENT_TYPES; exports.LIVE_FRAME_BODY_MAX_BYTES = _chunkMTPO77EAcjs.LIVE_FRAME_BODY_MAX_BYTES; exports.LIVE_SCHEMA_VERSION = _chunkMTPO77EAcjs.LIVE_SCHEMA_VERSION; exports.LIVE_SESSION_HEADER = _chunkMTPO77EAcjs.LIVE_SESSION_HEADER; exports.LIVE_TOOLS = _chunkMTPO77EAcjs.LIVE_TOOLS; exports.LIVE_TOOL_NAMES = _chunkMTPO77EAcjs.LIVE_TOOL_NAMES; exports.LOOK_AT_SCREEN_TOOL = _chunkMTPO77EAcjs.LOOK_AT_SCREEN_TOOL; exports.RECORD_UNIT_TOOL = _chunkMTPO77EAcjs.RECORD_UNIT_TOOL; exports.RELAY_ANSWER_TOOL = _chunkMTPO77EAcjs.RELAY_ANSWER_TOOL; exports.RiffrecProvider = RiffrecProvider; exports.RiffrecRecorder = RiffrecRecorder; exports.SCREEN_CONTEXT_MARKER = _chunkMTPO77EAcjs.SCREEN_CONTEXT_MARKER; exports.SCREEN_CONTEXT_SECTION = _chunkMTPO77EAcjs.SCREEN_CONTEXT_SECTION; exports.UNIT_STATUSES = _chunkMTPO77EAcjs.UNIT_STATUSES; exports.UPDATE_UNIT_TOOL = _chunkMTPO77EAcjs.UPDATE_UNIT_TOOL; exports.WITHDRAW_UNIT_TOOL = _chunkMTPO77EAcjs.WITHDRAW_UNIT_TOOL; exports.buildInterviewerInstructions = _chunkMTPO77EAcjs.buildInterviewerInstructions; exports.downloadSessionArchive = downloadSessionArchive; exports.getLiveTool = _chunkMTPO77EAcjs.getLiveTool; exports.hasScreenContext = _chunkMTPO77EAcjs.hasScreenContext; exports.inspectEnvelope = _chunkMTPO77EAcjs.inspectEnvelope; exports.isLiveEnvelopeOfType = _chunkMTPO77EAcjs.isLiveEnvelopeOfType; exports.isLiveEventType = _chunkMTPO77EAcjs.isLiveEventType; exports.isLiveToolName = _chunkMTPO77EAcjs.isLiveToolName; exports.useRiffrec = useRiffrec; exports.validateEnvelope = _chunkMTPO77EAcjs.validateEnvelope; exports.withScreenContext = _chunkMTPO77EAcjs.withScreenContext;
//# sourceMappingURL=index.cjs.map
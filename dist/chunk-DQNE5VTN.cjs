"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } async function _asyncNullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return await rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }// src/output/segmentStore.ts
var RECORDING_FILE_NAME = "recording.webm";
var RECORDING_FILE_PATTERN = /^recording(-\d{3})?\.webm$/;
function isRecordingFileName(name) {
  return RECORDING_FILE_PATTERN.test(name);
}
function segmentFileName(segment) {
  if (segment <= 1) return RECORDING_FILE_NAME;
  return `recording-${String(segment).padStart(3, "0")}.webm`;
}
async function assembleRecordingSegments(store, sessionId, replacements = /* @__PURE__ */ new Map()) {
  const segments = await store.listSegments(sessionId);
  const blobs = [];
  for (const meta of segments.sort((a, b) => a.segment - b.segment)) {
    const blob = await _asyncNullishCoalesce(replacements.get(meta.segment), async () => ( await store.readSegment(sessionId, meta.segment)));
    if (blob && blob.size > 0) blobs.push(blob);
  }
  return blobs;
}

// src/capture/screen.ts
var VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];
var DEFAULT_DISPLAY_MEDIA_VIDEO = {
  frameRate: 5,
  displaySurface: "browser"
};
var DEFAULT_DISPLAY_MEDIA_OPTIONS = {
  audio: false,
  video: DEFAULT_DISPLAY_MEDIA_VIDEO,
  preferCurrentTab: true,
  selfBrowserSurface: "include",
  monitorTypeSurfaces: "exclude",
  surfaceSwitching: "exclude",
  systemAudio: "exclude"
};
var RECORDING_TIMESLICE_MS = 1e3;
function browserSupportsScreenCapture() {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && Boolean(_optionalChain([navigator, 'access', _ => _.mediaDevices, 'optionalAccess', _2 => _2.getDisplayMedia])) && typeof MediaRecorder !== "undefined";
}
function chooseVideoMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "video/webm";
  }
  return _nullishCoalesce(VIDEO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)), () => ( "video/webm"));
}
function isShareDeclined(error) {
  if (typeof error !== "object" || error === null) return false;
  const name = error.name;
  return name === "NotAllowedError" || name === "AbortError" || name === "SecurityError";
}
var ScreenCapture = class {
  constructor(displayMediaOverrides = {}, displayMediaVideoOverrides = {}, options = {}) {
    this.displayMediaOverrides = displayMediaOverrides;
    this.displayMediaVideoOverrides = displayMediaVideoOverrides;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.mimeType = "video/webm";
    this.segment = null;
    this.chunkIndex = 0;
    this.pendingWrites = [];
    /** Segments this instance finished, with the store segment holding them (null without a store). */
    this.completedSegments = [];
    /** Segments a chunk write failed on: the store copy is partial, so the in-memory blob stands in. */
    this.failedSegments = /* @__PURE__ */ new Set();
    this.onPageHide = () => this.handlePageHide();
    this.pageHideAttached = false;
    this.options = options;
    this.sessionId = _nullishCoalesce(options.sessionId, () => ( null));
    this.segmentStore = options.segmentStore && this.sessionId ? options.segmentStore : null;
    this.timesliceMs = _nullishCoalesce(options.timesliceMs, () => ( RECORDING_TIMESLICE_MS));
    this.pageHideTarget = options.pageHideTarget === void 0 ? typeof window !== "undefined" ? window : null : options.pageHideTarget;
  }
  /** The live display stream, for frame grabbing; null until shared and after it ends. */
  get displayStream() {
    return this.stream;
  }
  /** The 1-based number of the segment being recorded; null while not recording or without a store. */
  get currentSegment() {
    return this.segment;
  }
  get isSegmented() {
    return this.segmentStore !== null;
  }
  async start() {
    if (!browserSupportsScreenCapture()) {
      throw new Error("Screen capture is not supported in this browser.");
    }
    try {
      this.mimeType = chooseVideoMimeType();
      this.chunks = [];
      this.chunkIndex = 0;
      this.segment = null;
      const displayMediaVideoOverrides = typeof this.displayMediaOverrides.video === "object" && this.displayMediaOverrides.video !== null ? this.displayMediaOverrides.video : {};
      const video = {
        ...DEFAULT_DISPLAY_MEDIA_VIDEO,
        ...this.displayMediaVideoOverrides,
        ...displayMediaVideoOverrides
      };
      const options = {
        ...DEFAULT_DISPLAY_MEDIA_OPTIONS,
        ...this.displayMediaOverrides,
        video
      };
      this.stream = await navigator.mediaDevices.getDisplayMedia(options);
      this.segment = await this.openSegment();
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.handleChunk(event.data);
        }
      };
      this.watchTracks(this.stream);
      this.attachPageHide();
      this.recorder.start(this.timesliceMs);
    } catch (error) {
      this.cleanupStream();
      const wrapped = new Error(
        `Screen capture failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      wrapped.cause = error;
      throw wrapped;
    }
  }
  /**
   * Live-mode start: a declined or dismissed picker is an outcome, not an
   * error (KTD10 treats it like a denied microphone), and so is a browser
   * without display capture. Call again after a reload to open the next
   * segment once the riffer re-shares.
   */
  async tryStart() {
    if (!browserSupportsScreenCapture()) return "unavailable";
    try {
      await this.start();
      return "recording";
    } catch (error) {
      if (isShareDeclined(error.cause)) return "declined";
      _optionalChain([this, 'access', _3 => _3.options, 'access', _4 => _4.onError, 'optionalCall', _5 => _5(error)]);
      return "unavailable";
    }
  }
  async stop() {
    if (!this.recorder) {
      this.cleanupStream();
      this.detachPageHide();
      return null;
    }
    return this.finishRecording("stopped");
  }
  /**
   * Every segment of this session in order (KTD15): persisted segments from
   * before a reload, then the ones this instance recorded. Without a segment
   * store, the segments this instance finished. A segment whose chunk writes
   * failed comes from memory instead of its partial store copy.
   */
  async collectSegments() {
    await Promise.allSettled(this.pendingWrites);
    if (this.segmentStore && this.sessionId) {
      try {
        const replacements = /* @__PURE__ */ new Map();
        for (const entry of this.completedSegments) {
          if (entry.segment !== null && this.failedSegments.has(entry.segment)) {
            replacements.set(entry.segment, entry.blob);
          }
        }
        const persisted = await assembleRecordingSegments(this.segmentStore, this.sessionId, replacements);
        const unstored = this.completedSegments.filter((entry) => entry.segment === null).map((entry) => entry.blob);
        return [...persisted, ...unstored];
      } catch (error) {
        _optionalChain([this, 'access', _6 => _6.options, 'access', _7 => _7.onError, 'optionalCall', _8 => _8(error)]);
      }
    }
    return this.completedSegments.map((entry) => entry.blob);
  }
  /** Whether a previous page load left segments behind (drives the re-share prompt after rehydration). */
  async hasPersistedSegments() {
    if (!this.segmentStore || !this.sessionId) return false;
    try {
      return (await this.segmentStore.listSegments(this.sessionId)).length > 0;
    } catch (error) {
      _optionalChain([this, 'access', _9 => _9.options, 'access', _10 => _10.onError, 'optionalCall', _11 => _11(error)]);
      return false;
    }
  }
  async clearSegments() {
    if (!this.segmentStore || !this.sessionId) return;
    await Promise.allSettled(this.pendingWrites);
    await this.segmentStore.clear(this.sessionId);
  }
  isRecording() {
    return _optionalChain([this, 'access', _12 => _12.recorder, 'optionalAccess', _13 => _13.state]) === "recording";
  }
  /** A store that cannot open a segment degrades to in-memory recording rather than failing the share. */
  async openSegment() {
    if (!this.segmentStore || !this.sessionId) return null;
    try {
      return await this.segmentStore.openSegment(this.sessionId, this.mimeType);
    } catch (error) {
      _optionalChain([this, 'access', _14 => _14.options, 'access', _15 => _15.onError, 'optionalCall', _16 => _16(error)]);
      return null;
    }
  }
  handleChunk(chunk) {
    const index = this.chunkIndex++;
    const segment = this.segment;
    this.chunks.push(chunk);
    if (this.segmentStore && this.sessionId && segment !== null) {
      const write = this.segmentStore.appendChunk(this.sessionId, segment, index, chunk).catch((error) => {
        this.failedSegments.add(segment);
        _optionalChain([this, 'access', _17 => _17.options, 'access', _18 => _18.onError, 'optionalCall', _19 => _19(error)]);
      });
      this.pendingWrites.push(write);
      void write.finally(() => {
        this.pendingWrites = this.pendingWrites.filter((pending) => pending !== write);
      });
    }
    _optionalChain([this, 'access', _20 => _20.options, 'access', _21 => _21.onChunk, 'optionalCall', _22 => _22(chunk, segment, index)]);
  }
  finishRecording(reason) {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(null);
    const segment = this.segment;
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        if (blob) this.completedSegments.push({ blob, segment });
        this.closeSegment(segment, reason);
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.closeSegment(segment, reason);
        this.reset();
        if (reason === "stopped") reject(new Error("Screen recorder failed while stopping."));
        else resolve(null);
      };
      if (recorder.state === "inactive") {
        _optionalChain([recorder, 'access', _23 => _23.onstop, 'optionalCall', _24 => _24(new Event("stop"))]);
      } else {
        recorder.stop();
      }
    });
  }
  closeSegment(segment, reason) {
    if (this.segmentStore && this.sessionId && segment !== null) {
      const close = this.segmentStore.closeSegment(this.sessionId, segment).catch((error) => _optionalChain([this, 'access', _25 => _25.options, 'access', _26 => _26.onError, 'optionalCall', _27 => _27(error)]));
      this.pendingWrites.push(close);
    }
    _optionalChain([this, 'access', _28 => _28.options, 'access', _29 => _29.onSegmentClosed, 'optionalCall', _30 => _30(segment, reason)]);
  }
  watchTracks(stream) {
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.handleTrackEnded(track));
    }
  }
  handleTrackEnded(track) {
    if (!this.stream || !this.stream.getVideoTracks().includes(track)) return;
    const wasRecording = this.recorder !== null;
    if (wasRecording) {
      void this.finishRecording("track_ended").catch((error) => _optionalChain([this, 'access', _31 => _31.options, 'access', _32 => _32.onError, 'optionalCall', _33 => _33(error)]));
    } else {
      this.cleanupStream();
    }
    _optionalChain([this, 'access', _34 => _34.options, 'access', _35 => _35.onStreamEnded, 'optionalCall', _36 => _36()]);
  }
  /** KTD15: flush the in-flight timeslice and mark the segment closed before the page goes away. */
  handlePageHide() {
    const recorder = this.recorder;
    if (!recorder) return;
    try {
      if (recorder.state === "recording") recorder.requestData();
    } catch (error) {
      _optionalChain([this, 'access', _37 => _37.options, 'access', _38 => _38.onError, 'optionalCall', _39 => _39(error)]);
    }
    this.closeSegment(this.segment, "pagehide");
  }
  attachPageHide() {
    if (this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.addEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = true;
  }
  detachPageHide() {
    if (!this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.removeEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = false;
  }
  reset() {
    this.recorder = null;
    this.segment = null;
    this.chunks = [];
    this.cleanupStream();
    this.detachPageHide();
  }
  cleanupStream() {
    _optionalChain([this, 'access', _40 => _40.stream, 'optionalAccess', _41 => _41.getTracks, 'call', _42 => _42(), 'access', _43 => _43.forEach, 'call', _44 => _44((track) => track.stop())]);
    this.stream = null;
  }
};

// src/capture/fiber.ts
var FiberTags = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  HostText: 6,
  Fragment: 7,
  Mode: 8,
  ContextConsumer: 9,
  ContextProvider: 10,
  ForwardRef: 11,
  Profiler: 12,
  SuspenseComponent: 13,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  LazyComponent: 16
};
var MAX_COMPONENTS = 6;
var MAX_DEPTH = 30;
var SKIP_EXACT = /* @__PURE__ */ new Set([
  "Component",
  "ErrorBoundaryHandler",
  "Fragment",
  "Hot",
  "HotReload",
  "Outlet",
  "Profiler",
  "PureComponent",
  "Route",
  "Routes",
  "Root",
  "StrictMode",
  "Suspense"
]);
var SKIP_PATTERNS = [
  /Boundary$/,
  /BoundaryHandler$/,
  /Consumer$/,
  /^Client(Page|Root|Segment)/,
  /^Dev(Overlay|Tools|Root)/,
  /Handler$/,
  /^Hot(Reload)?$/,
  /^Inner/,
  /^LayoutSegment/,
  /Overlay$/,
  /Provider$/,
  /^React(Overlay|Tools|Root)/,
  /Router$/,
  /^RSC/,
  /^Segment(ViewNode|Node)$/,
  /^Server(Root|Component|Render)/,
  /^With[A-Z]/,
  /Wrapper$/
];
function isComponentType(value) {
  return typeof value === "function" || typeof value === "object" && value !== null;
}
function isMinifiedName(name) {
  if (name.length <= 2) {
    return true;
  }
  return name.length <= 3 && name === name.toLowerCase();
}
function isFrameworkInternal(name) {
  return SKIP_EXACT.has(name) || SKIP_PATTERNS.some((pattern) => pattern.test(name));
}
function readDisplayName(type) {
  if (!isComponentType(type)) {
    return null;
  }
  const candidate = _nullishCoalesce(type.displayName, () => ( type.name));
  if (!candidate || isMinifiedName(candidate) || isFrameworkInternal(candidate)) {
    return null;
  }
  return candidate;
}
function getDataComponent(el) {
  const candidate = _nullishCoalesce(_optionalChain([el, 'access', _45 => _45.closest, 'call', _46 => _46("[data-component]"), 'optionalAccess', _47 => _47.dataset, 'access', _48 => _48.component]), () => ( null));
  return candidate && candidate.trim().length > 0 ? candidate : null;
}
function getReactFiberKey(el) {
  return _nullishCoalesce(Object.keys(el).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
  ), () => ( null));
}
function getComponentNameFromFiber(fiber) {
  const tag = fiber.tag;
  if (tag === FiberTags.HostRoot || tag === FiberTags.HostPortal || tag === FiberTags.HostComponent || tag === FiberTags.HostText || tag === FiberTags.Fragment || tag === FiberTags.Mode || tag === FiberTags.Profiler || tag === FiberTags.SuspenseComponent) {
    return null;
  }
  if (tag === FiberTags.ForwardRef) {
    const elementType = fiber.elementType;
    return _nullishCoalesce(_nullishCoalesce(readDisplayName(_optionalChain([elementType, 'optionalAccess', _49 => _49.render])), () => ( readDisplayName(elementType))), () => ( readDisplayName(fiber.type)));
  }
  if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
    const elementType = fiber.elementType;
    return _nullishCoalesce(_nullishCoalesce(readDisplayName(_optionalChain([elementType, 'optionalAccess', _50 => _50.type])), () => ( readDisplayName(elementType))), () => ( readDisplayName(fiber.type)));
  }
  if (tag === FiberTags.ContextProvider) {
    const type = fiber.type;
    const name = _optionalChain([type, 'optionalAccess', _51 => _51._context, 'optionalAccess', _52 => _52.displayName]);
    return name && !isMinifiedName(name) ? `${name}.Provider` : null;
  }
  if (tag === FiberTags.ContextConsumer) {
    const name = readDisplayName(fiber.type);
    return name ? `${name}.Consumer` : null;
  }
  if (tag === FiberTags.LazyComponent) {
    const elementType = fiber.elementType;
    return _optionalChain([elementType, 'optionalAccess', _53 => _53._status]) === 1 ? readDisplayName(elementType._result) : null;
  }
  if (typeof fiber.type === "string") {
    return null;
  }
  return _nullishCoalesce(readDisplayName(fiber.type), () => ( readDisplayName(fiber.elementType)));
}
function getComponentPath(el) {
  if (!el) {
    return null;
  }
  try {
    const dataComponent = getDataComponent(el);
    const fiberKey = getReactFiberKey(el);
    if (!fiberKey) {
      return dataComponent ? [dataComponent] : null;
    }
    let fiber = _nullishCoalesce(el[fiberKey], () => ( null));
    const components = [];
    let depth = 0;
    while (fiber && depth < MAX_DEPTH && components.length < MAX_COMPONENTS) {
      const componentName = getComponentNameFromFiber(fiber);
      if (componentName) {
        components.push(componentName);
      }
      fiber = _nullishCoalesce(fiber.return, () => ( null));
      depth++;
    }
    if (components.length === 0) {
      return dataComponent ? [dataComponent] : null;
    }
    return components.reverse();
  } catch (e) {
    return null;
  }
}
function getComponentName(el) {
  const dataComponent = el ? getDataComponent(el) : null;
  const path = getComponentPath(el);
  if (!path || path.length === 0) {
    return dataComponent;
  }
  return _nullishCoalesce(path[path.length - 1], () => ( dataComponent));
}

// src/capture/console.ts
function timestamp(sessionStart) {
  return (Date.now() - sessionStart) / 1e3;
}
function isTestEnvironment() {
  const maybeProcess = globalThis;
  const nodeEnv = _optionalChain([maybeProcess, 'access', _54 => _54.process, 'optionalAccess', _55 => _55.env, 'optionalAccess', _56 => _56.NODE_ENV]);
  return nodeEnv === "test" || typeof globalThis !== "undefined" && "jest" in globalThis || typeof globalThis !== "undefined" && "vi" in globalThis;
}
function stringifyConsoleArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return arg.message;
    }
    if (typeof arg === "string") {
      return arg;
    }
    try {
      return JSON.stringify(arg);
    } catch (e2) {
      return String(arg);
    }
  }).join(" ");
}
function readStack(value) {
  return value instanceof Error ? _nullishCoalesce(value.stack, () => ( null)) : null;
}
var ConsoleCapture = class {
  constructor() {
    this.onEvent = null;
    this.sessionStart = 0;
    this.originalConsoleError = null;
    this.originalOnError = null;
    this.unhandledRejectionHandler = null;
  }
  start(sessionStart, onEvent, sanitize) {
    if (typeof window === "undefined" || isTestEnvironment() || this.onEvent) {
      return;
    }
    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.sanitize = sanitize;
    this.patchWindowOnError();
    this.patchConsoleError();
    this.patchUnhandledRejection();
  }
  stop() {
    if (typeof window === "undefined") {
      return;
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    window.onerror = this.originalOnError;
    if (this.unhandledRejectionHandler) {
      window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler);
    }
    this.onEvent = null;
    this.sanitize = void 0;
    this.originalConsoleError = null;
    this.originalOnError = null;
    this.unhandledRejectionHandler = null;
  }
  patchWindowOnError() {
    this.originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      const renderedMessage = [
        String(message),
        source ? `at ${source}:${_nullishCoalesce(lineno, () => ( 0))}:${_nullishCoalesce(colno, () => ( 0))}` : null
      ].filter(Boolean).join(" ");
      this.emit(renderedMessage, readStack(error));
      if (this.originalOnError) {
        return this.originalOnError(message, source, lineno, colno, error) === true;
      }
      return false;
    };
  }
  patchConsoleError() {
    this.originalConsoleError = console.error;
    console.error = (...args) => {
      this.emit(stringifyConsoleArgs(args), _nullishCoalesce(args.map(readStack).find(Boolean), () => ( null)));
      _optionalChain([this, 'access', _57 => _57.originalConsoleError, 'optionalCall', _58 => _58(...args)]);
    };
  }
  patchUnhandledRejection() {
    this.unhandledRejectionHandler = (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : stringifyConsoleArgs([reason]);
      this.emit(message, readStack(reason));
    };
    window.addEventListener("unhandledrejection", this.unhandledRejectionHandler);
  }
  emit(message, stack) {
    if (!this.onEvent) {
      return;
    }
    let sanitizedMessage = message;
    try {
      sanitizedMessage = this.sanitize ? this.sanitize(message, stack) : message;
    } catch (e3) {
      sanitizedMessage = message;
    }
    const event = {
      t: timestamp(this.sessionStart),
      type: "console_error",
      message: sanitizedMessage,
      stack,
      component: typeof document !== "undefined" ? getComponentName(_nullishCoalesce(document.activeElement, () => ( document.body))) : null
    };
    this.onEvent(event);
  }
};

// src/capture/element.ts
var TEXT_LIMIT = 200;
var CONTEXT_LIMIT = 300;
var PATH_LIMIT = 300;
var DEFAULT_STYLE_VALUES = /* @__PURE__ */ new Set([
  "",
  "none",
  "normal",
  "auto",
  "0px",
  "rgba(0, 0, 0, 0)",
  "transparent",
  "static",
  "visible"
]);
var TEXT_ELEMENTS = /* @__PURE__ */ new Set([
  "a",
  "b",
  "blockquote",
  "caption",
  "code",
  "dd",
  "dt",
  "em",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "label",
  "li",
  "p",
  "pre",
  "q",
  "span",
  "strong",
  "td",
  "th",
  "time"
]);
var FORM_ELEMENTS = /* @__PURE__ */ new Set(["input", "textarea", "select"]);
var MEDIA_ELEMENTS = /* @__PURE__ */ new Set(["canvas", "img", "svg", "video"]);
var CONTAINER_ELEMENTS = /* @__PURE__ */ new Set([
  "article",
  "aside",
  "div",
  "fieldset",
  "footer",
  "form",
  "header",
  "main",
  "nav",
  "ol",
  "section",
  "ul"
]);
function truncate(value, limit) {
  return value.length > limit ? value.slice(0, limit) : value;
}
function cleanClassName(value) {
  return value.replace(/[_-][a-zA-Z0-9]{5,}.*$/, "");
}
function meaningfulClasses(el, limit = 2) {
  if (!(el instanceof HTMLElement) || typeof el.className !== "string") {
    return [];
  }
  const classes = el.className.split(/\s+/).map(cleanClassName).filter((className) => className.length > 2 && !/^[a-z]{1,2}$/.test(className));
  return Array.from(new Set(classes)).slice(0, limit);
}
function escapeCssIdentifier(value) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function getParentElement(el) {
  if (el.parentElement) {
    return el.parentElement;
  }
  const root = el.getRootNode();
  return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root.host : null;
}
function selectorPart(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${escapeCssIdentifier(el.id)}` : "";
  const classes = Array.from(el.classList).slice(0, 2).map((className) => `.${escapeCssIdentifier(className)}`).join("");
  return `${tag}${id}${classes}`;
}
function pathPart(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return `${tag}#${escapeCssIdentifier(el.id)}`;
  }
  const className = meaningfulClasses(el, 1)[0];
  return className ? `${tag}.${escapeCssIdentifier(className)}` : tag;
}
function buildSelector(el) {
  const parts = [];
  let current = el;
  while (current && parts.length < 4) {
    parts.unshift(selectorPart(current));
    current = getParentElement(current);
  }
  return truncate(parts.join(" > "), PATH_LIMIT);
}
function buildFullPath(el) {
  const parts = [];
  let current = el;
  while (current && current.tagName.toLowerCase() !== "html") {
    const nextParent = getParentElement(current);
    const prefix = !current.parentElement && nextParent ? "[shadow] " : "";
    parts.unshift(`${prefix}${pathPart(current)}`);
    current = nextParent;
  }
  return truncate(parts.join(" > "), PATH_LIMIT);
}
function isSensitiveInput(el) {
  return el instanceof HTMLInputElement && (el.type === "password" || el.type === "hidden");
}
function isUnsafeTextElement(el) {
  if (isSensitiveInput(el)) {
    return true;
  }
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLElement && el.getAttribute("aria-hidden") === "true";
}
function safeTextContent(el, limit = TEXT_LIMIT) {
  if (isUnsafeTextElement(el)) {
    return null;
  }
  if (el instanceof HTMLInputElement) {
    return null;
  }
  const text = _optionalChain([el, 'access', _59 => _59.textContent, 'optionalAccess', _60 => _60.replace, 'call', _61 => _61(/\s+/g, " "), 'access', _62 => _62.trim, 'call', _63 => _63()]);
  return text ? truncate(text, limit) : null;
}
function identifyElement(el) {
  if (!(el instanceof HTMLElement)) {
    return el.tagName.toLowerCase();
  }
  if (el.dataset.element) {
    return el.dataset.element;
  }
  const tag = el.tagName.toLowerCase();
  if (["path", "circle", "rect", "line", "g"].includes(tag)) {
    return "graphic element";
  }
  if (tag === "svg") {
    const parent = getParentElement(el);
    if (_optionalChain([parent, 'optionalAccess', _64 => _64.tagName, 'access', _65 => _65.toLowerCase, 'call', _66 => _66()]) === "button") {
      const text = safeTextContent(parent);
      return text ? `icon in "${truncate(text, 25)}" button` : "button icon";
    }
    return "icon";
  }
  if (tag === "button") {
    const ariaLabel2 = el.getAttribute("aria-label");
    const text = safeTextContent(el);
    if (ariaLabel2) return `button [${truncate(ariaLabel2, 50)}]`;
    return text ? `button "${truncate(text, 50)}"` : "button";
  }
  if (tag === "a") {
    const text = safeTextContent(el);
    const href = el.getAttribute("href");
    if (text) return `link "${truncate(text, 50)}"`;
    if (href) return `link to ${truncate(href, 50)}`;
    return "link";
  }
  if (el instanceof HTMLInputElement) {
    const type = el.getAttribute("type") || "text";
    const placeholder = el.getAttribute("placeholder");
    const name = el.getAttribute("name");
    if (placeholder) return `input "${truncate(placeholder, 50)}"`;
    if (name) return `input [${truncate(name, 50)}]`;
    return `${type} input`;
  }
  if (tag === "img") {
    const alt = el.getAttribute("alt");
    return alt ? `image "${truncate(alt, 50)}"` : "image";
  }
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  if (ariaLabel) return `${tag} [${truncate(ariaLabel, 50)}]`;
  if (role) return role;
  if (TEXT_ELEMENTS.has(tag)) {
    const text = safeTextContent(el);
    return text ? `${tag} "${truncate(text, 50)}"` : tag;
  }
  if (CONTAINER_ELEMENTS.has(tag)) {
    const words = meaningfulClasses(el, 2);
    if (words.length > 0) return words.join(" ");
    return tag === "div" ? "container" : tag;
  }
  return tag;
}
function getNearbyText(el) {
  const texts = [];
  const ownText = safeTextContent(el, CONTEXT_LIMIT);
  if (ownText) {
    texts.push(ownText);
  }
  for (const [label, sibling] of [
    ["before", el.previousElementSibling],
    ["after", el.nextElementSibling]
  ]) {
    if (!sibling) continue;
    const text = safeTextContent(sibling, 80);
    if (text) {
      texts.push(`[${label}: "${text}"]`);
    }
  }
  return texts.length > 0 ? truncate(texts.join(" "), CONTEXT_LIMIT) : null;
}
function getNearbyElements(el) {
  const parent = getParentElement(el);
  if (!parent) {
    return null;
  }
  const siblings = Array.from(parent.children).filter((child) => child !== el);
  if (siblings.length === 0) {
    return null;
  }
  const labels = siblings.slice(0, 4).map((sibling) => {
    const tag = sibling.tagName.toLowerCase();
    const cls = meaningfulClasses(sibling, 1)[0];
    const classPart = cls ? `.${cls}` : "";
    const text = tag === "button" || tag === "a" ? safeTextContent(sibling, 30) : null;
    return text ? `${tag}${classPart} "${text}"` : `${tag}${classPart}`;
  });
  const suffix = parent.children.length > siblings.length + 1 ? ` (${parent.children.length} total)` : "";
  return truncate(`${labels.join(", ")}${suffix}`, CONTEXT_LIMIT);
}
function getBoundingBox(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}
function computedStyleProperties(el) {
  const tag = el.tagName.toLowerCase();
  if (TEXT_ELEMENTS.has(tag)) {
    return ["color", "font-size", "font-weight", "font-family", "line-height"];
  }
  if (tag === "button" || tag === "a" && el.getAttribute("role") === "button") {
    return ["background-color", "color", "padding", "border-radius", "font-size"];
  }
  if (FORM_ELEMENTS.has(tag)) {
    return ["background-color", "color", "padding", "border-radius", "font-size"];
  }
  if (MEDIA_ELEMENTS.has(tag)) {
    return ["width", "height", "object-fit", "border-radius"];
  }
  if (CONTAINER_ELEMENTS.has(tag)) {
    return ["display", "padding", "margin", "gap", "background-color"];
  }
  return ["color", "font-size", "margin", "padding", "background-color"];
}
function getComputedStylesSnapshot(el) {
  if (typeof window === "undefined") {
    return void 0;
  }
  const styles = window.getComputedStyle(el);
  const snapshot = {};
  for (const property of computedStyleProperties(el)) {
    const value = styles.getPropertyValue(property);
    if (!DEFAULT_STYLE_VALUES.has(value)) {
      snapshot[property] = value;
    }
  }
  return Object.keys(snapshot).length > 0 ? snapshot : void 0;
}
function buildElementInfo(el) {
  const rawText = safeTextContent(el);
  const classes = meaningfulClasses(el, 8);
  const role = el.getAttribute("role");
  const ariaLabel = el.getAttribute("aria-label");
  return {
    tag: el.tagName.toLowerCase(),
    text: rawText,
    id: el.id || null,
    selector: buildSelector(el),
    name: identifyElement(el),
    fullPath: buildFullPath(el),
    classes: classes.length > 0 ? classes : void 0,
    role,
    ariaLabel,
    nearbyText: getNearbyText(el),
    nearbyElements: getNearbyElements(el),
    boundingBox: getBoundingBox(el),
    computedStyles: getComputedStylesSnapshot(el)
  };
}

// src/capture/events.ts
function timestamp2(sessionStart) {
  return (Date.now() - sessionStart) / 1e3;
}
function isElement(value) {
  return value instanceof Element;
}
var EventCapture = class {
  constructor() {
    this.onEvent = null;
    this.sessionStart = 0;
    this.ignore = null;
    this.clickHandler = null;
    this.popstateHandler = null;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.previousUrl = null;
  }
  start(sessionStart, onEvent, options = {}) {
    if (typeof window === "undefined" || typeof document === "undefined" || this.onEvent) {
      return;
    }
    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.ignore = _nullishCoalesce(options.ignore, () => ( null));
    this.previousUrl = window.location.href;
    this.clickHandler = (event) => this.handleClick(event);
    this.popstateHandler = () => this.emitNavigation(window.location.href);
    document.addEventListener("click", this.clickHandler, true);
    this.patchHistory();
    window.addEventListener("popstate", this.popstateHandler);
  }
  stop() {
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
    this.ignore = null;
    this.clickHandler = null;
    this.popstateHandler = null;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.previousUrl = null;
  }
  handleClick(event) {
    if (!this.onEvent || !isElement(event.target)) {
      return;
    }
    const element = event.target;
    if (_optionalChain([this, 'access', _67 => _67.ignore, 'optionalCall', _68 => _68(element)])) {
      return;
    }
    const clickEvent = {
      t: timestamp2(this.sessionStart),
      type: "click",
      component: getComponentName(element),
      componentPath: getComponentPath(element),
      element: buildElementInfo(element)
    };
    this.onEvent(clickEvent);
  }
  patchHistory() {
    this.originalPushState = window.history.pushState;
    this.originalReplaceState = window.history.replaceState;
    window.history.pushState = this.wrapHistoryMethod(this.originalPushState);
    window.history.replaceState = this.wrapHistoryMethod(this.originalReplaceState);
  }
  wrapHistoryMethod(original) {
    return ((...args) => {
      const result = original.apply(window.history, args);
      window.setTimeout(() => this.emitNavigation(window.location.href), 0);
      return result;
    });
  }
  emitNavigation(nextUrl) {
    if (!this.onEvent) {
      return;
    }
    const from = _nullishCoalesce(this.previousUrl, () => ( nextUrl));
    if (from === nextUrl) {
      return;
    }
    const navigationEvent = {
      t: timestamp2(this.sessionStart),
      type: "navigation",
      from,
      to: nextUrl
    };
    this.previousUrl = nextUrl;
    this.onEvent(navigationEvent);
  }
};

// src/capture/network.ts
var REDACTED_QUERY_KEYS = /* @__PURE__ */ new Set(["token", "api_key", "client_secret"]);
var STRIPPED_FRAGMENT_KEYS = /* @__PURE__ */ new Set(["riffrec_live", "endpoint"]);
function redactFragment(hash) {
  if (!hash || hash === "#") return hash;
  const params = new URLSearchParams(hash.slice(1));
  let stripped = false;
  for (const key of Array.from(params.keys())) {
    if (STRIPPED_FRAGMENT_KEYS.has(key.toLowerCase())) {
      params.delete(key);
      stripped = true;
    }
  }
  if (!stripped) return hash;
  const rest = params.toString();
  return rest ? `#${rest}` : "";
}
function timestamp3(sessionStart) {
  return (Date.now() - sessionStart) / 1e3;
}
function extractRequestUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}
function extractRequestMethod(input, init) {
  if (_optionalChain([init, 'optionalAccess', _69 => _69.method])) {
    return init.method.toUpperCase();
  }
  if (typeof input === "object" && "method" in input && input.method) {
    return input.method.toUpperCase();
  }
  return "GET";
}
function redactUrl(value) {
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://riffrec.local";
    const url = new URL(value, base);
    for (const key of Array.from(url.searchParams.keys())) {
      if (REDACTED_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    url.hash = redactFragment(url.hash);
    if (value.startsWith("/") || value.startsWith("?")) {
      return `${url.pathname}${url.search}${url.hash}`.replace(/%5Bredacted%5D/g, "[redacted]");
    }
    return url.href.replace(/%5Bredacted%5D/g, "[redacted]");
  } catch (e4) {
    const hashIndex = value.indexOf("#");
    const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : redactFragment(value.slice(hashIndex));
    return `${withoutHash.replace(/([?&](?:token|api_key|client_secret)=)[^&#]+/gi, "$1[redacted]")}${hash}`;
  }
}
function shouldExclude(url, excludeUrls) {
  return excludeUrls.some((excludeUrl) => url.includes(excludeUrl));
}
var NetworkCapture = class {
  constructor() {
    this.onEvent = null;
    this.sessionStart = 0;
    this.excludeUrls = [];
    this.originalFetch = null;
    this.originalOpen = null;
    this.originalSend = null;
    this.xhrMeta = /* @__PURE__ */ new WeakMap();
  }
  start(sessionStart, onEvent, excludeUrls = []) {
    if (typeof window === "undefined" || this.onEvent) {
      return;
    }
    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
    this.excludeUrls = excludeUrls;
    this.patchFetch();
    this.patchXhr();
  }
  stop() {
    if (typeof window === "undefined") {
      return;
    }
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    if (this.originalOpen) {
      XMLHttpRequest.prototype.open = this.originalOpen;
    }
    if (this.originalSend) {
      XMLHttpRequest.prototype.send = this.originalSend;
    }
    this.onEvent = null;
    this.originalFetch = null;
    this.originalOpen = null;
    this.originalSend = null;
    this.xhrMeta = /* @__PURE__ */ new WeakMap();
  }
  patchFetch() {
    if (typeof window.fetch !== "function") {
      return;
    }
    this.originalFetch = window.fetch;
    const capture = this;
    window.fetch = new Proxy(window.fetch, {
      async apply(target, thisArg, argArray) {
        const [input, init] = argArray;
        const rawUrl = extractRequestUrl(input);
        const method = extractRequestMethod(input, init);
        const start = Date.now();
        try {
          const response = await Reflect.apply(target, thisArg, argArray);
          capture.emitNetworkEvent(rawUrl, method, response.status, Date.now() - start);
          return response;
        } catch (error) {
          capture.emitNetworkEvent(rawUrl, method, -1, Date.now() - start);
          throw error;
        }
      }
    });
  }
  patchXhr() {
    if (typeof XMLHttpRequest === "undefined") {
      return;
    }
    this.originalOpen = XMLHttpRequest.prototype.open;
    this.originalSend = XMLHttpRequest.prototype.send;
    const capture = this;
    XMLHttpRequest.prototype.open = function open(method, url, async, username, password) {
      capture.xhrMeta.set(this, {
        method: method.toUpperCase(),
        url: String(url),
        start: 0
      });
      return capture.originalOpen.call(
        this,
        method,
        url,
        _nullishCoalesce(async, () => ( true)),
        _nullishCoalesce(username, () => ( void 0)),
        _nullishCoalesce(password, () => ( void 0))
      );
    };
    XMLHttpRequest.prototype.send = function send(body) {
      const meta = capture.xhrMeta.get(this);
      if (meta) {
        meta.start = Date.now();
        this.addEventListener(
          "loadend",
          () => {
            capture.emitNetworkEvent(meta.url, meta.method, this.status || -1, Date.now() - meta.start);
          },
          { once: true }
        );
      }
      return capture.originalSend.call(this, body);
    };
  }
  emitNetworkEvent(rawUrl, method, status, durationMs) {
    if (!this.onEvent || shouldExclude(rawUrl, this.excludeUrls)) {
      return;
    }
    const event = {
      t: timestamp3(this.sessionStart),
      type: "network_request",
      url: redactUrl(rawUrl),
      method,
      status,
      duration_ms: durationMs
    };
    this.onEvent(event);
  }
};

// src/capture/voice.ts
var AUDIO_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
function browserSupportsMediaRecorder() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}
function browserSupportsVoiceCapture() {
  return browserSupportsMediaRecorder() && typeof navigator !== "undefined" && Boolean(_optionalChain([navigator, 'access', _70 => _70.mediaDevices, 'optionalAccess', _71 => _71.getUserMedia]));
}
function chooseAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  return _nullishCoalesce(AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)), () => ( "audio/webm"));
}
var VoiceCapture = class {
  constructor() {
    this.recorder = null;
    this.stream = null;
    /** True when `start` acquired the stream itself and therefore owns its tracks. */
    this.ownsStream = false;
    this.chunks = [];
    this.mimeType = "audio/webm";
  }
  /**
   * Starts recording. With no argument the capture acquires its own microphone;
   * a live session passes a clone of the shared consent stream instead (KTD21),
   * whose tracks stay owned by the sharer — `stop()` leaves them running.
   */
  async start(stream) {
    if (stream ? !browserSupportsMediaRecorder() : !browserSupportsVoiceCapture()) {
      return false;
    }
    try {
      this.mimeType = chooseAudioMimeType();
      this.chunks = [];
      if (stream) {
        this.stream = stream;
        this.ownsStream = false;
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.ownsStream = true;
      }
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.start(1e3);
      return true;
    } catch (error) {
      this.cleanupStream();
      if (typeof console !== "undefined") {
        console.warn(
          `[riffrec] Voice capture skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return false;
    }
  }
  async stop() {
    if (!this.recorder) {
      this.cleanupStream();
      return null;
    }
    const recorder = this.recorder;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.reset();
        resolve(null);
      };
      if (recorder.state === "inactive") {
        _optionalChain([recorder, 'access', _72 => _72.onstop, 'optionalCall', _73 => _73(new Event("stop"))]);
      } else {
        recorder.stop();
      }
    });
  }
  isRecording() {
    return _optionalChain([this, 'access', _74 => _74.recorder, 'optionalAccess', _75 => _75.state]) === "recording";
  }
  /** The stream being recorded, so a mute can be asserted against its tracks. */
  get activeStream() {
    return this.stream;
  }
  reset() {
    this.recorder = null;
    this.cleanupStream();
  }
  cleanupStream() {
    if (this.ownsStream) _optionalChain([this, 'access', _76 => _76.stream, 'optionalAccess', _77 => _77.getTracks, 'call', _78 => _78(), 'access', _79 => _79.forEach, 'call', _80 => _80((track) => track.stop())]);
    this.stream = null;
    this.ownsStream = false;
  }
};

// src/live/tokenBootstrap.ts
var LIVE_FRAGMENT_TOKEN_KEY = "riffrec_live";
var LIVE_FRAGMENT_ENDPOINT_KEY = "endpoint";
var LIVE_BOOTSTRAP_STORAGE_KEY = "riffrec:live:bootstrap";
var nativeReplaceState = typeof History !== "undefined" && typeof History.prototype.replaceState === "function" ? History.prototype.replaceState : null;
function defaultStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch (e5) {
    return null;
  }
}
function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch (e6) {
    return null;
  }
}
function parseLiveFragment(hash) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { bootstrap: null, rest: "" };
  const params = new URLSearchParams(raw);
  const token = params.get(LIVE_FRAGMENT_TOKEN_KEY);
  const endpoint = params.get(LIVE_FRAGMENT_ENDPOINT_KEY);
  if (token === null && endpoint === null) return { bootstrap: null, rest: raw };
  params.delete(LIVE_FRAGMENT_TOKEN_KEY);
  params.delete(LIVE_FRAGMENT_ENDPOINT_KEY);
  const rest = params.toString();
  if (!token || !endpoint) return { bootstrap: null, rest };
  const origin = normalizeOrigin(endpoint);
  if (!origin) return { bootstrap: null, rest };
  return { bootstrap: { token, endpoint: origin }, rest };
}
function readStoredBootstrap(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LIVE_BOOTSTRAP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.token !== "string" || typeof parsed.endpoint !== "string") return null;
    return { token: parsed.token, endpoint: parsed.endpoint };
  } catch (e7) {
    return null;
  }
}
function clearStoredBootstrap(storage = defaultStorage()) {
  try {
    _optionalChain([storage, 'optionalAccess', _81 => _81.removeItem, 'call', _82 => _82(LIVE_BOOTSTRAP_STORAGE_KEY)]);
  } catch (e8) {
  }
}
function bootstrapLiveToken(options = {}) {
  const location = _nullishCoalesce(options.location, () => ( (typeof window !== "undefined" ? window.location : null)));
  const history = _nullishCoalesce(options.history, () => ( (typeof window !== "undefined" ? window.history : null)));
  const storage = options.storage === void 0 ? defaultStorage() : options.storage;
  const replaceState = options.replaceState === void 0 ? nativeReplaceState : options.replaceState;
  if (!location) return readStoredBootstrap(storage);
  const { bootstrap, rest } = parseLiveFragment(location.hash);
  const hadLiveKeys = bootstrap !== null || rest !== (location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  if (hadLiveKeys && history) {
    const cleaned = `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`;
    try {
      if (replaceState) {
        replaceState.call(history, history.state, "", cleaned);
      } else {
        history.replaceState(history.state, "", cleaned);
      }
    } catch (e9) {
    }
  }
  if (!bootstrap) return readStoredBootstrap(storage);
  try {
    _optionalChain([storage, 'optionalAccess', _83 => _83.setItem, 'call', _84 => _84(LIVE_BOOTSTRAP_STORAGE_KEY, JSON.stringify(bootstrap))]);
  } catch (e10) {
  }
  return bootstrap;
}


















exports.getComponentName = getComponentName; exports.ConsoleCapture = ConsoleCapture; exports.buildSelector = buildSelector; exports.EventCapture = EventCapture; exports.NetworkCapture = NetworkCapture; exports.RECORDING_FILE_NAME = RECORDING_FILE_NAME; exports.isRecordingFileName = isRecordingFileName; exports.segmentFileName = segmentFileName; exports.DEFAULT_DISPLAY_MEDIA_VIDEO = DEFAULT_DISPLAY_MEDIA_VIDEO; exports.DEFAULT_DISPLAY_MEDIA_OPTIONS = DEFAULT_DISPLAY_MEDIA_OPTIONS; exports.ScreenCapture = ScreenCapture; exports.VoiceCapture = VoiceCapture; exports.parseLiveFragment = parseLiveFragment; exports.readStoredBootstrap = readStoredBootstrap; exports.clearStoredBootstrap = clearStoredBootstrap; exports.bootstrapLiveToken = bootstrapLiveToken;
//# sourceMappingURL=chunk-DQNE5VTN.cjs.map
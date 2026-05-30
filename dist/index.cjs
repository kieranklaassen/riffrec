"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  DEFAULT_DISPLAY_MEDIA_OPTIONS: () => DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO: () => DEFAULT_DISPLAY_MEDIA_VIDEO,
  RiffrecProvider: () => RiffrecProvider,
  RiffrecRecorder: () => RiffrecRecorder,
  useRiffrec: () => useRiffrec
});
module.exports = __toCommonJS(src_exports);

// src/RiffrecProvider.tsx
var import_react = require("react");
var React = __toESM(require("react"), 1);

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
  const candidate = type.displayName ?? type.name;
  if (!candidate || isMinifiedName(candidate) || isFrameworkInternal(candidate)) {
    return null;
  }
  return candidate;
}
function getDataComponent(el) {
  const candidate = el.closest("[data-component]")?.dataset.component ?? null;
  return candidate && candidate.trim().length > 0 ? candidate : null;
}
function getReactFiberKey(el) {
  return Object.keys(el).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
  ) ?? null;
}
function getComponentNameFromFiber(fiber) {
  const tag = fiber.tag;
  if (tag === FiberTags.HostRoot || tag === FiberTags.HostPortal || tag === FiberTags.HostComponent || tag === FiberTags.HostText || tag === FiberTags.Fragment || tag === FiberTags.Mode || tag === FiberTags.Profiler || tag === FiberTags.SuspenseComponent) {
    return null;
  }
  if (tag === FiberTags.ForwardRef) {
    const elementType = fiber.elementType;
    return readDisplayName(elementType?.render) ?? readDisplayName(elementType) ?? readDisplayName(fiber.type);
  }
  if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
    const elementType = fiber.elementType;
    return readDisplayName(elementType?.type) ?? readDisplayName(elementType) ?? readDisplayName(fiber.type);
  }
  if (tag === FiberTags.ContextProvider) {
    const type = fiber.type;
    const name = type?._context?.displayName;
    return name && !isMinifiedName(name) ? `${name}.Provider` : null;
  }
  if (tag === FiberTags.ContextConsumer) {
    const name = readDisplayName(fiber.type);
    return name ? `${name}.Consumer` : null;
  }
  if (tag === FiberTags.LazyComponent) {
    const elementType = fiber.elementType;
    return elementType?._status === 1 ? readDisplayName(elementType._result) : null;
  }
  if (typeof fiber.type === "string") {
    return null;
  }
  return readDisplayName(fiber.type) ?? readDisplayName(fiber.elementType);
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
    let fiber = el[fiberKey] ?? null;
    const components = [];
    let depth = 0;
    while (fiber && depth < MAX_DEPTH && components.length < MAX_COMPONENTS) {
      const componentName = getComponentNameFromFiber(fiber);
      if (componentName) {
        components.push(componentName);
      }
      fiber = fiber.return ?? null;
      depth++;
    }
    if (components.length === 0) {
      return dataComponent ? [dataComponent] : null;
    }
    return components.reverse();
  } catch {
    return null;
  }
}
function getComponentName(el) {
  const dataComponent = el ? getDataComponent(el) : null;
  const path = getComponentPath(el);
  if (!path || path.length === 0) {
    return dataComponent;
  }
  return path[path.length - 1] ?? dataComponent;
}

// src/capture/console.ts
function timestamp(sessionStart) {
  return (Date.now() - sessionStart) / 1e3;
}
function isTestEnvironment() {
  const maybeProcess = globalThis;
  const nodeEnv = maybeProcess.process?.env?.NODE_ENV;
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
    } catch {
      return String(arg);
    }
  }).join(" ");
}
function readStack(value) {
  return value instanceof Error ? value.stack ?? null : null;
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
        source ? `at ${source}:${lineno ?? 0}:${colno ?? 0}` : null
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
      this.emit(stringifyConsoleArgs(args), args.map(readStack).find(Boolean) ?? null);
      this.originalConsoleError?.(...args);
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
    } catch {
      sanitizedMessage = message;
    }
    const event = {
      t: timestamp(this.sessionStart),
      type: "console_error",
      message: sanitizedMessage,
      stack,
      component: typeof document !== "undefined" ? getComponentName(document.activeElement ?? document.body) : null
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
  const text = el.textContent?.replace(/\s+/g, " ").trim();
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
    if (parent?.tagName.toLowerCase() === "button") {
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
    this.clickHandler = null;
    this.popstateHandler = null;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.previousUrl = null;
  }
  start(sessionStart, onEvent) {
    if (typeof window === "undefined" || typeof document === "undefined" || this.onEvent) {
      return;
    }
    this.sessionStart = sessionStart;
    this.onEvent = onEvent;
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
    const from = this.previousUrl ?? nextUrl;
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
  if (init?.method) {
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
    if (value.startsWith("/") || value.startsWith("?")) {
      return `${url.pathname}${url.search}${url.hash}`.replace(/%5Bredacted%5D/g, "[redacted]");
    }
    return url.href.replace(/%5Bredacted%5D/g, "[redacted]");
  } catch {
    return value.replace(/([?&](?:token|api_key|client_secret)=)[^&]+/gi, "$1[redacted]");
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
        async ?? true,
        username ?? void 0,
        password ?? void 0
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
function browserSupportsScreenCapture() {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia) && typeof MediaRecorder !== "undefined";
}
function chooseVideoMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "video/webm";
  }
  return VIDEO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "video/webm";
}
var ScreenCapture = class {
  constructor(displayMediaOverrides = {}, displayMediaVideoOverrides = {}) {
    this.displayMediaOverrides = displayMediaOverrides;
    this.displayMediaVideoOverrides = displayMediaVideoOverrides;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.mimeType = "video/webm";
  }
  async start() {
    if (!browserSupportsScreenCapture()) {
      throw new Error("Screen capture is not supported in this browser.");
    }
    try {
      this.mimeType = chooseVideoMimeType();
      this.chunks = [];
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
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.start(1e3);
    } catch (error) {
      this.cleanupStream();
      throw new Error(`Screen capture failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async stop() {
    if (!this.recorder) {
      this.cleanupStream();
      return null;
    }
    const recorder = this.recorder;
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.reset();
        reject(new Error("Screen recorder failed while stopping."));
      };
      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
        recorder.stop();
      }
    });
  }
  isRecording() {
    return this.recorder?.state === "recording";
  }
  reset() {
    this.recorder = null;
    this.cleanupStream();
  }
  cleanupStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
};

// src/capture/voice.ts
var AUDIO_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
function browserSupportsVoiceCapture() {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}
function chooseAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  return AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "audio/webm";
}
var VoiceCapture = class {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.mimeType = "audio/webm";
  }
  async start() {
    if (!browserSupportsVoiceCapture()) {
      return false;
    }
    try {
      this.mimeType = chooseAudioMimeType();
      this.chunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        recorder.onstop?.(new Event("stop"));
      } else {
        recorder.stop();
      }
    });
  }
  isRecording() {
    return this.recorder?.state === "recording";
  }
  reset() {
    this.recorder = null;
    this.cleanupStream();
  }
  cleanupStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
};

// src/types.ts
var RIFFREC_SCHEMA_VERSION = "1.0.0";

// src/output/zip.ts
var import_fflate = require("fflate");
var MAX_RECORDING_IN_ZIP_BYTES = 50 * 1024 * 1024;
async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
function zipAsync(files) {
  return new Promise((resolve, reject) => {
    (0, import_fflate.zip)(files, (error, data) => {
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
function triggerDownload(filename, blob) {
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
  async writeSession(sessionDirName, files) {
    const zipFiles = {};
    let totalBytes = 0;
    for (const [filename, blob] of filterZipSessionFiles(files)) {
      zipFiles[filename] = await blobToUint8Array(blob);
      totalBytes += blob.size;
    }
    const data = totalBytes < MAX_RECORDING_IN_ZIP_BYTES ? (0, import_fflate.zipSync)(zipFiles) : await zipAsync(zipFiles);
    const archive = new Blob([toArrayBuffer(data)], { type: "application/zip" });
    triggerDownload(`${sessionDirName}.zip`, archive);
    return `${sessionDirName}.zip`;
  }
};
function filterZipSessionFiles(files) {
  const filtered = /* @__PURE__ */ new Map();
  for (const [filename, blob] of files) {
    if (filename === "recording.webm" && blob.size > MAX_RECORDING_IN_ZIP_BYTES) {
      continue;
    }
    filtered.set(filename, blob);
  }
  return filtered;
}

// src/output/session.ts
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
  async stop(outputs) {
    const endedAt = /* @__PURE__ */ new Date();
    const sessionDirName = createSessionDirName(endedAt);
    const eventsJson = buildEventsJson(outputs);
    const files = /* @__PURE__ */ new Map();
    files.set("events.json", jsonBlob(eventsJson));
    if (outputs.screenBlob) {
      files.set("recording.webm", outputs.screenBlob);
    }
    if (outputs.voiceBlob) {
      files.set("voice.webm", outputs.voiceBlob);
    }
    const zipSession = withSessionJson(
      filterZipSessionFiles(files),
      outputs,
      endedAt,
      this.options.reactVersion ?? null
    );
    const sessionPath = await this.zipWriter.writeSession(sessionDirName, zipSession.files);
    return { sessionPath, method: "zip", filesPresent: zipSession.filesPresent };
  }
};

// src/RiffrecProvider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
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
var RiffrecContext = (0, import_react.createContext)(null);
function RiffrecProvider({
  children,
  displayMedia,
  displayMediaVideo,
  downloadNoticeTitle = "We downloaded the zip file.",
  downloadNoticeMessage = "Share the zip file for feedback.",
  forceEnable,
  forceEnableParam,
  onError,
  sanitizeError
}) {
  const [status, setStatus] = (0, import_react.useState)("idle");
  const [isDownloadNoticeVisible, setDownloadNoticeVisible] = (0, import_react.useState)(false);
  const statusRef = (0, import_react.useRef)("idle");
  const activeSession = (0, import_react.useRef)(null);
  const configRef = (0, import_react.useRef)({
    displayMedia,
    displayMediaVideo,
    forceEnable,
    forceEnableParam,
    onError,
    sanitizeError
  });
  const didWarnDisabled = (0, import_react.useRef)(false);
  const isEnabled = forceEnable || isEnabledByUrlParam(forceEnableParam) || readNodeEnv() !== "production";
  (0, import_react.useEffect)(() => {
    configRef.current = {
      displayMedia,
      displayMediaVideo,
      forceEnable,
      forceEnableParam,
      onError,
      sanitizeError
    };
  }, [displayMedia, displayMediaVideo, forceEnable, forceEnableParam, onError, sanitizeError]);
  (0, import_react.useEffect)(() => {
    statusRef.current = status;
  }, [status]);
  (0, import_react.useEffect)(() => {
    if (!isEnabled && !didWarnDisabled.current && typeof console !== "undefined") {
      console.warn("[riffrec] Disabled in production. Pass forceEnable={true} to opt in.");
      didWarnDisabled.current = true;
      setStatus("disabled");
    }
  }, [isEnabled]);
  const stop = (0, import_react.useCallback)(async () => {
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
      const result = await writer.stop(outputs);
      statusRef.current = "idle";
      setStatus("idle");
      setDownloadNoticeVisible(true);
      return result;
    } catch (error) {
      const err = toError(error);
      configRef.current.onError?.(err);
      statusRef.current = "error";
      setStatus("error");
      return null;
    }
  }, []);
  const start = (0, import_react.useCallback)(async () => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }
    if (statusRef.current === "recording" || statusRef.current === "stopping") {
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
  (0, import_react.useEffect)(() => () => void stop(), [stop]);
  const value = (0, import_react.useMemo)(
    () => ({
      start,
      stop,
      status,
      isEnabled
    }),
    [isEnabled, start, status, stop]
  );
  const isRecordingVisible = status === "recording" || status === "stopping";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(RiffrecContext.Provider, { value, children: [
    children,
    isRecordingVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "aria-live": "polite", role: "status", style: recordingOverlayStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", style: recordingDotStyle }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: recordingTitleStyle, children: "Recording feedback" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: recordingHintStyle, children: "Stop when you are ready to save the ZIP file." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
    isDownloadNoticeVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "aria-live": "polite", role: "status", style: downloadNoticeStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", style: downloadNoticeIconStyle, children: "\u2713" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: recordingTextStyle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: recordingTitleStyle, children: downloadNoticeTitle }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: recordingHintStyle, children: downloadNoticeMessage })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
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
var defaultConsentDescription = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { margin: "0 0 12px" }, children: "Riffrec will ask your browser for screen and microphone access, then save a local session with:" }),
  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("ul", { style: { margin: "0 0 16px", paddingLeft: 20 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { children: "screen video and microphone audio" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { children: "clicks, navigation, network URLs and statuses" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { children: "console errors and stack traces" })
  ] }),
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { margin: 0 }, children: "Password and hidden input text is omitted from DOM events, but anything visible on screen can appear in the video, and anything spoken near the microphone can appear in the audio." })
] });
function useRiffrecContext() {
  const context = (0, import_react2.useContext)(RiffrecContext);
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
  onSessionComplete
}) {
  const { start, stop, status, isEnabled } = useRiffrecContext();
  const [isConsentOpen, setConsentOpen] = (0, import_react2.useState)(false);
  const [hasConsented, setHasConsented] = (0, import_react2.useState)(false);
  const [isBusy, setBusy] = (0, import_react2.useState)(false);
  const handleStop = async () => {
    setBusy(true);
    try {
      const result = await stop();
      onSessionComplete?.(result);
    } finally {
      setBusy(false);
    }
  };
  const handleStart = async () => {
    setBusy(true);
    try {
      await start();
      setConsentOpen(false);
      setHasConsented(false);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const isRecording = status === "recording" || status === "stopping";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        disabled: !isEnabled || isBusy,
        style: !isEnabled || isBusy ? disabledButtonStyle : isRecording ? dangerButtonStyle : buttonStyle,
        onClick: isRecording ? handleStop : () => setConsentOpen(true),
        children: isRecording ? stopLabel : isEnabled ? startLabel : disabledLabel
      }
    ),
    isRecording ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { "aria-live": "polite", style: indicatorStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", style: dotStyle }),
      "Recording"
    ] }) : null,
    isConsentOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: overlayStyle, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { role: "dialog", "aria-modal": "true", "aria-label": consentTitle, style: dialogStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { style: { margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }, children: consentTitle }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 14, lineHeight: 1.5 }, children: consentDescription }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "checkbox",
            checked: hasConsented,
            onChange: (event) => setHasConsented(event.currentTarget.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: consentLabel })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: secondaryButtonStyle, onClick: () => setConsentOpen(false), children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
var import_react3 = require("react");
function useRiffrec() {
  const context = (0, import_react3.useContext)(RiffrecContext);
  if (!context) {
    throw new Error("useRiffrec must be used within RiffrecProvider");
  }
  return {
    start: context.start,
    stop: context.stop,
    status: context.status
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO,
  RiffrecProvider,
  RiffrecRecorder,
  useRiffrec
});
//# sourceMappingURL=index.cjs.map
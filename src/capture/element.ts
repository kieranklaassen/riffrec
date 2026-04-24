import type { ElementBoundingBox, ElementInfo } from "../types";

const TEXT_LIMIT = 200;
const CONTEXT_LIMIT = 300;
const PATH_LIMIT = 300;
const DEFAULT_STYLE_VALUES = new Set([
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

const TEXT_ELEMENTS = new Set([
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
const FORM_ELEMENTS = new Set(["input", "textarea", "select"]);
const MEDIA_ELEMENTS = new Set(["canvas", "img", "svg", "video"]);
const CONTAINER_ELEMENTS = new Set([
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

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

function cleanClassName(value: string): string {
  return value.replace(/[_-][a-zA-Z0-9]{5,}.*$/, "");
}

function meaningfulClasses(el: Element, limit = 2): string[] {
  if (!(el instanceof HTMLElement) || typeof el.className !== "string") {
    return [];
  }

  const classes = el.className
    .split(/\s+/)
    .map(cleanClassName)
    .filter((className) => className.length > 2 && !/^[a-z]{1,2}$/.test(className));

  return Array.from(new Set(classes)).slice(0, limit);
}

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function getParentElement(el: Element): Element | null {
  if (el.parentElement) {
    return el.parentElement;
  }

  const root = el.getRootNode();
  return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root.host : null;
}

function selectorPart(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${escapeCssIdentifier(el.id)}` : "";
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .map((className) => `.${escapeCssIdentifier(className)}`)
    .join("");
  return `${tag}${id}${classes}`;
}

function pathPart(el: Element): string {
  const tag = el.tagName.toLowerCase();

  if (el.id) {
    return `${tag}#${escapeCssIdentifier(el.id)}`;
  }

  const className = meaningfulClasses(el, 1)[0];
  return className ? `${tag}.${escapeCssIdentifier(className)}` : tag;
}

export function buildSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && parts.length < 4) {
    parts.unshift(selectorPart(current));
    current = getParentElement(current);
  }

  return truncate(parts.join(" > "), PATH_LIMIT);
}

export function buildFullPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.tagName.toLowerCase() !== "html") {
    const nextParent = getParentElement(current);
    const prefix = !current.parentElement && nextParent ? "[shadow] " : "";
    parts.unshift(`${prefix}${pathPart(current)}`);
    current = nextParent;
  }

  return truncate(parts.join(" > "), PATH_LIMIT);
}

function isSensitiveInput(el: Element): boolean {
  return el instanceof HTMLInputElement && (el.type === "password" || el.type === "hidden");
}

function isUnsafeTextElement(el: Element): boolean {
  if (isSensitiveInput(el)) {
    return true;
  }

  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.getAttribute("aria-hidden") === "true")
  );
}

function safeTextContent(el: Element, limit = TEXT_LIMIT): string | null {
  if (isUnsafeTextElement(el)) {
    return null;
  }

  if (el instanceof HTMLInputElement) {
    return null;
  }

  const text = el.textContent?.replace(/\s+/g, " ").trim();
  return text ? truncate(text, limit) : null;
}

function identifyElement(el: Element): string {
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
    const ariaLabel = el.getAttribute("aria-label");
    const text = safeTextContent(el);
    if (ariaLabel) return `button [${truncate(ariaLabel, 50)}]`;
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

function getNearbyText(el: Element): string | null {
  const texts: string[] = [];
  const ownText = safeTextContent(el, CONTEXT_LIMIT);
  if (ownText) {
    texts.push(ownText);
  }

  for (const [label, sibling] of [
    ["before", el.previousElementSibling],
    ["after", el.nextElementSibling]
  ] as const) {
    if (!sibling) continue;
    const text = safeTextContent(sibling, 80);
    if (text) {
      texts.push(`[${label}: "${text}"]`);
    }
  }

  return texts.length > 0 ? truncate(texts.join(" "), CONTEXT_LIMIT) : null;
}

function getNearbyElements(el: Element): string | null {
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

function getBoundingBox(el: Element): ElementBoundingBox {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function computedStyleProperties(el: Element): string[] {
  const tag = el.tagName.toLowerCase();

  if (TEXT_ELEMENTS.has(tag)) {
    return ["color", "font-size", "font-weight", "font-family", "line-height"];
  }

  if (tag === "button" || (tag === "a" && el.getAttribute("role") === "button")) {
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

function getComputedStylesSnapshot(el: Element): Record<string, string> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const styles = window.getComputedStyle(el);
  const snapshot: Record<string, string> = {};

  for (const property of computedStyleProperties(el)) {
    const value = styles.getPropertyValue(property);
    if (!DEFAULT_STYLE_VALUES.has(value)) {
      snapshot[property] = value;
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

export function buildElementInfo(el: Element): ElementInfo {
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
    classes: classes.length > 0 ? classes : undefined,
    role,
    ariaLabel,
    nearbyText: getNearbyText(el),
    nearbyElements: getNearbyElements(el),
    boundingBox: getBoundingBox(el),
    computedStyles: getComputedStylesSnapshot(el)
  };
}

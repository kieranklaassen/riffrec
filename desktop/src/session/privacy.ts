import type { ClickObservation, ElementInfo } from "../shared/types";

const REDACTED_QUERY_KEYS = new Set([
  "token",
  "api_key",
  "apikey",
  "client_secret",
  "access_token",
  "auth",
  "authorization",
  "code"
]);
const MAX_TEXT_LENGTH = 200;
const MAX_SELECTOR_LENGTH = 180;
const MAX_MESSAGE_LENGTH = 2000;

export function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (REDACTED_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.href.replace(/%5Bredacted%5D/g, "[redacted]");
  } catch {
    return value.replace(
      /([?&](?:token|api_key|apikey|client_secret|access_token|auth|authorization|code)=)[^&]+/gi,
      "$1[redacted]"
    );
  }
}

export function normalizeWebsiteUrl(value: string): string {
  const input = value.trim();
  if (!input) {
    throw new Error("Enter a website address first.");
  }

  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a valid website address.");
  }

  if (url.protocol === "https:") {
    return url.href;
  }

  const isLocalHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname.endsWith(".localhost");

  if (url.protocol === "http:" && isLocalHost) {
    return url.href;
  }

  throw new Error("Riffrec opens HTTPS sites or local development addresses only.");
}

export function sanitizeClickObservation(value: unknown): ClickObservation | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Partial<ClickObservation>;
  if (!input.element || typeof input.element !== "object") {
    return null;
  }

  const element = input.element as Partial<ElementInfo>;
  if (typeof element.tag !== "string" || typeof element.selector !== "string") {
    return null;
  }

  return {
    component:
      typeof input.component === "string" ? truncate(input.component, MAX_TEXT_LENGTH) : null,
    element: {
      tag: truncate(element.tag.toLowerCase(), 40),
      text: typeof element.text === "string" ? truncate(element.text, MAX_TEXT_LENGTH) : null,
      id: typeof element.id === "string" ? truncate(element.id, MAX_TEXT_LENGTH) : null,
      selector: truncate(element.selector, MAX_SELECTOR_LENGTH)
    }
  };
}

export function sanitizeConsoleMessage(message: string): string {
  return truncate(message, MAX_MESSAGE_LENGTH);
}

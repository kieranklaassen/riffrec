import type { ClickObservation, ElementInfo } from "../shared/types";

const REDACTED_QUERY_KEYS = new Set([
  "token",
  "id_token",
  "refresh_token",
  "api_key",
  "apikey",
  "key",
  "client_secret",
  "access_token",
  "auth",
  "authorization",
  "code",
  "credential",
  "signature",
  "sig",
  "jwt",
  "password",
  "passwd"
]);
const MAX_TEXT_LENGTH = 200;
const MAX_SELECTOR_LENGTH = 180;
const MAX_MESSAGE_LENGTH = 2000;
const CREDENTIAL_KEY_SOURCE =
  "(?:token|id_token|refresh_token|api_key|apikey|key|client_secret|access_token|auth|authorization|code|credential|signature|sig|jwt|password|passwd|[^=&#]*(?:token|secret|credential|signature|[-_]sig))";
const CREDENTIAL_PATTERN = new RegExp(
  `([?&#]${CREDENTIAL_KEY_SOURCE}=)[^&#\\s"'<>]*`,
  "gi"
);

export function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) {
      url.username = "[redacted]";
    }
    if (url.password) {
      url.password = "[redacted]";
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (isCredentialKey(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    if (url.hash.includes("=")) {
      const hash = url.hash.slice(1);
      const separator = hash.indexOf("?");
      const prefix = separator >= 0 ? hash.slice(0, separator + 1) : "";
      const parameterString = separator >= 0 ? hash.slice(separator + 1) : hash;
      const hashParams = new URLSearchParams(parameterString);
      for (const key of Array.from(hashParams.keys())) {
        if (isCredentialKey(key)) {
          hashParams.set(key, "[redacted]");
        }
      }
      url.hash = `${prefix}${hashParams.toString()}`;
    }
    return url.href.replace(/%5Bredacted%5D/g, "[redacted]");
  } catch {
    return value.replace(CREDENTIAL_PATTERN, "$1[redacted]");
  }
}

function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    REDACTED_QUERY_KEYS.has(normalized) ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("signature") ||
    normalized.endsWith("-sig") ||
    normalized.endsWith("_sig")
  );
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

export function isAllowedWebsiteUrl(value: string): boolean {
  try {
    normalizeWebsiteUrl(value);
    return true;
  } catch {
    return false;
  }
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
  const redactedUrls = message.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => redactUrl(url));
  return truncate(redactedUrls.replace(CREDENTIAL_PATTERN, "$1[redacted]"), MAX_MESSAGE_LENGTH);
}

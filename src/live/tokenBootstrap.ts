/**
 * Token and origin bootstrap without cookies (KTD3).
 *
 * The consumer hands the page its session token and the endpoint origin in the
 * URL fragment: `#riffrec_live=<page token>&endpoint=<origin>`. This module
 * reads both on load, before any capture starts, strips them with the unpatched
 * `history.replaceState` so no history entry ever carries them, and keeps them
 * in `sessionStorage` until a live session claims them.
 */

export const LIVE_FRAGMENT_TOKEN_KEY = "riffrec_live";
export const LIVE_FRAGMENT_ENDPOINT_KEY = "endpoint";
export const LIVE_BOOTSTRAP_STORAGE_KEY = "riffrec:live:bootstrap";

/** Captured at module load, before `EventCapture` wraps the instance method. */
const nativeReplaceState: History["replaceState"] | null =
  typeof History !== "undefined" && typeof History.prototype.replaceState === "function"
    ? History.prototype.replaceState
    : null;

export interface LiveBootstrap {
  token: string;
  endpoint: string;
}

export interface BootstrapLocation {
  hash: string;
  pathname: string;
  search: string;
}

export interface BootstrapOptions {
  location?: BootstrapLocation;
  history?: History;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Defaults to the prototype method captured before any patching. */
  replaceState?: History["replaceState"] | null;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Parses `#a=1&b=2`; returns the live credentials and the remaining params. */
export function parseLiveFragment(hash: string): { bootstrap: LiveBootstrap | null; rest: string } {
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

/** Removes the live keys from a fragment; used by `redactUrl` callers as defense in depth. */
export function stripLiveFragment(url: string): string {
  const index = url.indexOf("#");
  if (index === -1) return url;
  const { rest } = parseLiveFragment(url.slice(index));
  return rest ? `${url.slice(0, index)}#${rest}` : url.slice(0, index);
}

export function readStoredBootstrap(storage: BootstrapOptions["storage"] = defaultStorage()): LiveBootstrap | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LIVE_BOOTSTRAP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiveBootstrap>;
    if (typeof parsed.token !== "string" || typeof parsed.endpoint !== "string") return null;
    return { token: parsed.token, endpoint: parsed.endpoint };
  } catch {
    return null;
  }
}

export function clearStoredBootstrap(storage: BootstrapOptions["storage"] = defaultStorage()): void {
  try {
    storage?.removeItem(LIVE_BOOTSTRAP_STORAGE_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/**
 * Reads the fragment credentials, strips them from the URL, stores them, and
 * returns them. Falls back to previously stored credentials (a reload) when
 * the fragment carries none. Returns null when neither exists.
 */
export function bootstrapLiveToken(options: BootstrapOptions = {}): LiveBootstrap | null {
  const location = options.location ?? (typeof window !== "undefined" ? window.location : null);
  const history = options.history ?? (typeof window !== "undefined" ? window.history : null);
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const replaceState = options.replaceState === undefined ? nativeReplaceState : options.replaceState;

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
    } catch {
      // A cross-origin or sandboxed document may refuse; the token is still not persisted anywhere else.
    }
  }

  if (!bootstrap) return readStoredBootstrap(storage);

  try {
    storage?.setItem(LIVE_BOOTSTRAP_STORAGE_KEY, JSON.stringify(bootstrap));
  } catch {
    // Quota or disabled storage: the in-memory value still serves this page load.
  }
  return bootstrap;
}

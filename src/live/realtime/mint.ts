import { LIVE_SESSION_HEADER, type LiveMintRequest, type LiveMintResponse } from "../contract";

/**
 * `POST /mint` (I2, KTD4): the page sends `{ session_id }` with its bearer
 * token and receives an ephemeral Realtime client secret. The endpoint owns
 * the key, the tools, the persona, and the brief; riffrec sees none of them.
 *
 * Outcome semantics follow the plan's state diagram: a `429` is retryable and
 * keeps the session in `connecting`/`reconnecting`; every other failure is a
 * refusal that settles the session in `live_novoice` with a reason. Callers
 * decide the retry budget (see `mintWithRetry`).
 */

export const MINT_MAX_CONSECUTIVE_THROTTLES = 3;
/** Fallback wait when a `429` carries no usable `retry_after` (seconds). */
export const MINT_DEFAULT_RETRY_AFTER_S = 2;
/** Wait before retrying a network failure to the endpoint. */
export const MINT_NETWORK_RETRY_MS = 2000;

export type MintRefusalReason =
  | "unauthorized"
  | "tls_required"
  | "openai_error"
  | "no_key"
  | "brief_contains_secret"
  | "invalid_response"
  | "throttled"
  | "network_error"
  | "unknown";

export type MintOutcome =
  | { ok: true; secret: LiveMintResponse }
  | { ok: false; retryable: true; kind: "throttled"; status: 429; retryAfterMs: number }
  | { ok: false; retryable: true; kind: "network_error"; retryAfterMs: number; error: unknown }
  | { ok: false; retryable: false; kind: "refused"; status: number; reason: MintRefusalReason; upstreamStatus?: number };

export type MintRefusal = Extract<MintOutcome, { ok: false }>;

export interface MintOptions {
  endpoint: string;
  token: string;
  sessionId: string;
  fetch?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function retryAfterMs(body: Record<string, unknown> | null, response: Response): number {
  const fromBody = body?.retry_after;
  if (typeof fromBody === "number" && Number.isFinite(fromBody) && fromBody >= 0) return fromBody * 1000;
  const header = response.headers?.get?.("Retry-After");
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return fromHeader * 1000;
  return MINT_DEFAULT_RETRY_AFTER_S * 1000;
}

function refusalReason(status: number, body: Record<string, unknown> | null): MintRefusalReason {
  const reason = body?.reason;
  switch (reason) {
    case "tls_required":
    case "openai_error":
    case "no_key":
    case "brief_contains_secret":
      return reason;
    default:
      break;
  }
  if (status === 401) return "unauthorized";
  if (status === 403) return "tls_required";
  return "unknown";
}

function parseSecret(body: Record<string, unknown> | null): LiveMintResponse | null {
  if (!body) return null;
  const { client_secret, expires_at, model } = body;
  if (typeof client_secret !== "string" || client_secret.length === 0) return null;
  if (typeof expires_at !== "number" || typeof model !== "string") return null;
  return { client_secret, expires_at, model };
}

/** One `POST /mint`. Never throws; network failures come back as a retryable outcome. */
export async function mint(options: MintOptions): Promise<MintOutcome> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const request: LiveMintRequest = { session_id: options.sessionId };
  let response: Response;
  try {
    response = await fetchImpl(`${options.endpoint}/mint`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        [LIVE_SESSION_HEADER]: options.sessionId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
  } catch (error) {
    return { ok: false, retryable: true, kind: "network_error", retryAfterMs: MINT_NETWORK_RETRY_MS, error };
  }
  const body = await readJson(response);
  if (response.ok) {
    const secret = parseSecret(body);
    if (secret) return { ok: true, secret };
    return { ok: false, retryable: false, kind: "refused", status: response.status, reason: "invalid_response" };
  }
  if (response.status === 429) {
    return { ok: false, retryable: true, kind: "throttled", status: 429, retryAfterMs: retryAfterMs(body, response) };
  }
  const upstream = body?.upstream_status;
  return {
    ok: false,
    retryable: false,
    kind: "refused",
    status: response.status,
    reason: refusalReason(response.status, body),
    ...(typeof upstream === "number" ? { upstreamStatus: upstream } : {})
  };
}

export interface MintRetryOptions extends MintOptions {
  /** Consecutive retryable failures tolerated before giving up. Default 3. */
  maxConsecutiveRetryable?: number;
  /** Called before each wait so the caller can observe or reflect the delay. */
  onRetry?: (outcome: Extract<MintOutcome, { retryable: true }>, attempt: number) => void;
  /** Returns false to abandon the loop (the session ended, or a newer attempt superseded this one). */
  shouldContinue?: () => boolean;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export type MintRetryResult =
  | { ok: true; secret: LiveMintResponse; attempts: number }
  | { ok: false; kind: "refused"; status: number; reason: MintRefusalReason; upstreamStatus?: number; attempts: number }
  | { ok: false; kind: "exhausted"; reason: "throttled" | "network_error"; attempts: number }
  | { ok: false; kind: "abandoned"; attempts: number };

/**
 * Mints with the plan's retry rule: a `429` (or a network blip) waits
 * `retry_after` and re-mints; three consecutive retryable failures exhaust the
 * budget; any refusal ends the loop at once.
 */
export async function mintWithRetry(options: MintRetryOptions): Promise<MintRetryResult> {
  const max = options.maxConsecutiveRetryable ?? MINT_MAX_CONSECUTIVE_THROTTLES;
  const schedule = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const shouldContinue = options.shouldContinue ?? (() => true);
  let attempts = 0;
  let consecutive = 0;
  for (;;) {
    if (!shouldContinue()) return { ok: false, kind: "abandoned", attempts };
    attempts += 1;
    const outcome = await mint(options);
    if (outcome.ok) return { ok: true, secret: outcome.secret, attempts };
    if (!outcome.retryable) {
      return {
        ok: false,
        kind: "refused",
        status: outcome.status,
        reason: outcome.reason,
        ...(outcome.upstreamStatus !== undefined ? { upstreamStatus: outcome.upstreamStatus } : {}),
        attempts
      };
    }
    consecutive += 1;
    if (consecutive >= max) return { ok: false, kind: "exhausted", reason: outcome.kind, attempts };
    options.onRetry?.(outcome, attempts);
    await new Promise<void>((resolve) => {
      schedule(resolve, outcome.retryAfterMs);
    });
  }
}

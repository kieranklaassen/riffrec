import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_SESSION_HEADER } from "../contract";
import { MINT_DEFAULT_RETRY_AFTER_S, MINT_NETWORK_RETRY_MS, mint, mintWithRetry, type MintOptions } from "./mint";

type Scripted = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

function scriptedFetch(script: Scripted[]): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = script.shift();
    if (!next) throw new Error("scriptedFetch: no response scripted");
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json", ...(next.headers ?? {}) }
    });
  };
  return { fetch: fetchImpl, calls };
}

const SECRET = { client_secret: "ek_test_0123456789abcdef", expires_at: 1789686600, model: "gpt-realtime" };

function options(fetchImpl: typeof fetch): MintOptions {
  return { endpoint: "http://endpoint.test", token: "page-token", sessionId: "sess_mint", fetch: fetchImpl };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("mint", () => {
  it("POSTs { session_id } with the bearer token and session header and returns the secret", async () => {
    const { fetch: fetchImpl, calls } = scriptedFetch([{ status: 200, body: SECRET }]);
    const outcome = await mint(options(fetchImpl));
    expect(outcome).toEqual({ ok: true, secret: SECRET });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://endpoint.test/mint");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer page-token",
      [LIVE_SESSION_HEADER]: "sess_mint"
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ session_id: "sess_mint" });
  });

  it("treats 429 as retryable with retry_after in seconds", async () => {
    const { fetch: fetchImpl } = scriptedFetch([{ status: 429, body: { retry_after: 3 } }]);
    expect(await mint(options(fetchImpl))).toEqual({
      ok: false,
      retryable: true,
      kind: "throttled",
      status: 429,
      retryAfterMs: 3000
    });
  });

  it("falls back to the Retry-After header, then a default, when the 429 body has none", async () => {
    const withHeader = scriptedFetch([{ status: 429, body: {}, headers: { "Retry-After": "7" } }]);
    expect(await mint(options(withHeader.fetch))).toMatchObject({ retryable: true, retryAfterMs: 7000 });
    const bare = scriptedFetch([{ status: 429 }]);
    expect(await mint(options(bare.fetch))).toMatchObject({
      retryable: true,
      retryAfterMs: MINT_DEFAULT_RETRY_AFTER_S * 1000
    });
  });

  it.each([
    [401, undefined, "unauthorized"],
    [403, { reason: "tls_required" }, "tls_required"],
    [502, { reason: "openai_error", upstream_status: 500 }, "openai_error"],
    [503, { reason: "no_key" }, "no_key"],
    [503, { reason: "brief_contains_secret" }, "brief_contains_secret"]
  ] as const)("maps %s %j to a non-retryable refusal", async (status, body, reason) => {
    const { fetch: fetchImpl } = scriptedFetch([{ status, body }]);
    const outcome = await mint(options(fetchImpl));
    expect(outcome).toMatchObject({ ok: false, retryable: false, kind: "refused", status, reason });
    if (status === 502) expect(outcome).toMatchObject({ upstreamStatus: 500 });
  });

  it("treats a 2xx without a usable secret as a refusal", async () => {
    const { fetch: fetchImpl } = scriptedFetch([{ status: 200, body: { model: "gpt-realtime" } }]);
    expect(await mint(options(fetchImpl))).toMatchObject({ ok: false, retryable: false, reason: "invalid_response" });
  });

  it("treats a network failure as retryable and never throws", async () => {
    const { fetch: fetchImpl } = scriptedFetch([new TypeError("Failed to fetch")]);
    expect(await mint(options(fetchImpl))).toMatchObject({
      ok: false,
      retryable: true,
      kind: "network_error",
      retryAfterMs: MINT_NETWORK_RETRY_MS
    });
  });
});

describe("mintWithRetry", () => {
  it("re-mints after retry_after on a single 429 and succeeds on the retry", async () => {
    vi.useFakeTimers();
    const { fetch: fetchImpl, calls } = scriptedFetch([{ status: 429, body: { retry_after: 2 } }, { status: 200, body: SECRET }]);
    const waits: number[] = [];
    const promise = mintWithRetry({
      ...options(fetchImpl),
      onRetry: (outcome) => waits.push(outcome.retryAfterMs)
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(result).toEqual({ ok: true, secret: SECRET, attempts: 2 });
    expect(waits).toEqual([2000]);
  });

  it("exhausts after three consecutive 429s", async () => {
    vi.useFakeTimers();
    const throttle = { status: 429, body: { retry_after: 1 } };
    const { fetch: fetchImpl, calls } = scriptedFetch([throttle, throttle, throttle, { status: 200, body: SECRET }]);
    const promise = mintWithRetry(options(fetchImpl));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toEqual({ ok: false, kind: "exhausted", reason: "throttled", attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it("counts network blips and 429s together toward the retry bound", async () => {
    vi.useFakeTimers();
    const { fetch: fetchImpl, calls } = scriptedFetch([
      new TypeError("offline"),
      { status: 429, body: { retry_after: 1 } },
      new TypeError("offline"),
      { status: 200, body: SECRET }
    ]);
    const promise = mintWithRetry(options(fetchImpl));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toMatchObject({ ok: false, kind: "exhausted", attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it("stops at once on a refusal without waiting", async () => {
    const { fetch: fetchImpl, calls } = scriptedFetch([{ status: 503, body: { reason: "no_key" } }, { status: 200, body: SECRET }]);
    expect(await mintWithRetry(options(fetchImpl))).toEqual({
      ok: false,
      kind: "refused",
      status: 503,
      reason: "no_key",
      attempts: 1
    });
    expect(calls).toHaveLength(1);
  });

  it("abandons when shouldContinue turns false between attempts", async () => {
    vi.useFakeTimers();
    let alive = true;
    const { fetch: fetchImpl, calls } = scriptedFetch([{ status: 429, body: { retry_after: 1 } }, { status: 200, body: SECRET }]);
    const promise = mintWithRetry({ ...options(fetchImpl), shouldContinue: () => alive });
    await vi.advanceTimersByTimeAsync(500);
    alive = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promise).toEqual({ ok: false, kind: "abandoned", attempts: 1 });
    expect(calls).toHaveLength(1);
  });
});

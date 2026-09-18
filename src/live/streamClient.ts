import {
  LIVE_SESSION_HEADER,
  type LiveEnvelope,
  type LiveServerEvent,
  type LiveServerEventName
} from "./contract";
import type { UnsentQueue } from "./buffer";

/**
 * Page -> endpoint delivery and the SSE return channel (KTD2, KTD3, I3).
 *
 * Envelopes are batched per animation frame except `frame` envelopes, which
 * post alone. Every request carries `Authorization: Bearer <page token>` and
 * `X-Riffrec-Session`. The client tracks `acked_seq`, backs off on failure,
 * flips to `buffering` after three consecutive failures, replays from the last
 * ack on recovery, treats `413` as drop-not-failure, reads SSE with a fetch
 * stream reader (never `EventSource`, so the token stays in a header), and
 * sends `stream_state: "unloading"` with `keepalive` on `pagehide`.
 */

export type StreamClientState =
  | "idle"
  | "streaming"
  | "buffering"
  | "incompatible"
  | "conflict"
  | "unauthorized"
  | "ended"
  | "closed";

export interface StreamClientStateDetail {
  expectedSchemaVersion?: string;
  activeSessionId?: string;
  status?: number;
}

export interface StreamClientOptions {
  endpoint: string;
  token: string;
  sessionId: string;
  queue: UnsentQueue;
  fetch?: typeof fetch;
  /** Batching tick; defaults to `requestAnimationFrame`, then `setTimeout(0)`. */
  schedule?: (callback: () => void) => void;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  failureThreshold?: number;
  backoffMs?: readonly number[];
  /** How long one `POST /events` may take before it counts as a failure; default `DEFAULT_POST_TIMEOUT_MS`. */
  postTimeoutMs?: number;
  /** Milliseconds since session start, stamped on fillers the client has to create. */
  elapsed?: () => number;
  onAck?: (ackedSeq: number) => void;
  onStateChange?: (state: StreamClientState, detail: StreamClientStateDetail) => void;
  onServerEvent?: (event: LiveServerEvent) => void;
  onEnded?: (reason: string | undefined) => void;
  onFrameDropped?: (envelope: LiveEnvelope<"frame">) => void;
  onError?: (error: unknown) => void;
  /** Called after the queue changes so the owner can persist it. */
  onQueueChange?: () => void;
}

export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000, 30000];
/**
 * A `POST /events` that never settles (a tunnel that swallows the request)
 * would otherwise pin `inflight`, stall every later envelope, and leave the
 * indicator on "streaming" forever; past this it is a failure like any other.
 */
export const DEFAULT_POST_TIMEOUT_MS = 20_000;

const SERVER_EVENT_NAMES: readonly LiveServerEventName[] = ["unit_status", "applied", "ask", "ack", "session_ended"];

function defaultSchedule(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback());
  } else {
    setTimeout(callback, 0);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Parses one SSE block (`event:`/`data:` lines) into a server event; null when unusable. */
export function parseServerEventBlock(block: string): LiveServerEvent | null {
  let name: string | null = null;
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!name || !(SERVER_EVENT_NAMES as readonly string[]).includes(name)) return null;
  let data: unknown;
  try {
    data = dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : {};
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  return { event: name, data } as LiveServerEvent;
}

export class StreamClient {
  state: StreamClientState = "idle";
  ackedSeq = 0;
  consecutiveFailures = 0;
  /** Counts `POST /events` attempts, for tests and diagnostics. */
  postAttempts = 0;

  private readonly fetchImpl: typeof fetch;
  private readonly schedule: (callback: () => void) => void;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly failureThreshold: number;
  private readonly backoffMs: readonly number[];
  private readonly postTimeoutMs: number;

  private flushScheduled = false;
  private inflight = false;
  /** Upper bound on envelopes per batch; halved after a 413 on a multi-envelope body, doubled after each success. */
  private batchLimit = Number.POSITIVE_INFINITY;
  private retryTimer: unknown = null;
  private streamAbort: AbortController | null = null;
  private streamRetryTimer: unknown = null;
  private streamFailures = 0;
  private closed = false;

  constructor(private readonly options: StreamClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.schedule = options.schedule ?? defaultSchedule;
    this.setTimer = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.postTimeoutMs = options.postTimeoutMs ?? DEFAULT_POST_TIMEOUT_MS;
  }

  get queue(): UnsentQueue {
    return this.options.queue;
  }

  get isTerminal(): boolean {
    return (
      this.state === "incompatible" ||
      this.state === "conflict" ||
      this.state === "unauthorized" ||
      this.state === "ended" ||
      this.state === "closed"
    );
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.token}`,
      [LIVE_SESSION_HEADER]: this.options.sessionId,
      ...extra
    };
  }

  /** Begins delivering: flushes anything already queued and opens the SSE stream. */
  start(): void {
    if (this.closed) return;
    if (this.state === "idle") this.setState("streaming");
    this.scheduleFlush();
    this.openStream();
  }

  enqueue(envelope: LiveEnvelope): void {
    if (this.closed) return;
    this.queue.enqueue(envelope);
    this.options.onQueueChange?.();
    this.scheduleFlush();
  }

  /** Forces a flush attempt now (used by tests and by `final`). */
  flushNow(): Promise<void> {
    return this.flush();
  }

  /**
   * `pagehide`: posts the `unloading` envelope with `keepalive` so the endpoint
   * classifies a reload without waiting for its grace window (KTD8). The
   * envelope is also queued, so a failed beacon replays after rehydration.
   */
  sendUnloading(envelope: LiveEnvelope<"stream_state">): void {
    if (this.closed) return;
    this.queue.enqueue(envelope);
    this.options.onQueueChange?.();
    try {
      const result = this.fetchImpl(`${this.options.endpoint}/events`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify([envelope]),
        keepalive: true
      });
      void result
        .then(async (response) => {
          if (!response.ok) return;
          const body = await readJson(response);
          if (body && typeof body.acked_seq === "number") this.applyAck(body.acked_seq);
        })
        .catch(() => {});
    } catch {
      // Delivery is best-effort here; the queue holds the envelope for replay.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    if (this.streamRetryTimer !== null) this.clearTimer(this.streamRetryTimer);
    this.retryTimer = null;
    this.streamRetryTimer = null;
    this.streamAbort?.abort();
    this.streamAbort = null;
    if (!this.isTerminal) this.setState("closed");
  }

  // ---------------------------------------------------------------------
  // POST /events
  // ---------------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushScheduled || this.closed || this.isTerminal) return;
    if (this.retryTimer !== null) return;
    this.flushScheduled = true;
    this.schedule(() => {
      this.flushScheduled = false;
      void this.flush();
    });
  }

  private async flush(): Promise<void> {
    if (this.inflight || this.closed || this.isTerminal) return;
    this.inflight = true;
    try {
      for (;;) {
        if (this.closed || this.isTerminal) return;
        const batch = await this.queue.nextBatch(this.batchLimit);
        if (!batch) return;
        const outcome = await this.post(batch.envelopes, batch.frame);
        if (outcome === "stop") return;
      }
    } finally {
      this.inflight = false;
    }
  }

  private async post(envelopes: LiveEnvelope[], frame: boolean): Promise<"continue" | "stop"> {
    this.postAttempts += 1;
    const abort = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = this.setTimer(() => {
      timedOut = true;
      abort?.abort();
    }, this.postTimeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.endpoint}/events`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(envelopes),
        ...(abort ? { signal: abort.signal } : {})
      });
    } catch (error) {
      this.recordFailure(timedOut ? new Error(`riffrec live: POST /events timed out after ${this.postTimeoutMs} ms`) : error);
      return "stop";
    } finally {
      this.clearTimer(timer);
    }

    if (response.ok) {
      const body = await readJson(response);
      if (body && typeof body.acked_seq === "number") this.applyAck(body.acked_seq);
      this.consecutiveFailures = 0;
      if (this.batchLimit !== Number.POSITIVE_INFINITY) this.batchLimit *= 2;
      if (this.state !== "streaming") this.setState("streaming");
      return "continue";
    }

    const body = await readJson(response);
    switch (response.status) {
      case 413: {
        if (frame) {
          const dropped = this.queue.dropFrame(envelopes[0].seq, "oversize");
          if (dropped) this.options.onFrameDropped?.(dropped);
          this.options.onQueueChange?.();
          return "continue";
        }
        if (envelopes.length > 1) {
          this.batchLimit = Math.max(1, Math.floor(envelopes.length / 2));
          return "continue";
        }
        const replaced = this.queue.shrinkOrFill(envelopes[0].seq, this.options.elapsed?.() ?? 0);
        this.options.onError?.(
          new Error(
            `riffrec live: ${envelopes[0].type} envelope seq ${envelopes[0].seq} exceeded ${String(body?.max_bytes)} bytes; ` +
              (replaced && replaced.type === envelopes[0].type ? "retrying without its unbounded evidence" : "replaced by a filler")
          )
        );
        this.options.onQueueChange?.();
        return "continue";
      }
      case 409: {
        if (body && typeof body.expected_schema_version === "string") {
          this.setState("incompatible", { expectedSchemaVersion: body.expected_schema_version, status: 409 });
        } else {
          this.setState("conflict", {
            activeSessionId: body && typeof body.active_session_id === "string" ? body.active_session_id : undefined,
            status: 409
          });
        }
        return "stop";
      }
      case 401:
      case 403:
        this.setState("unauthorized", { status: response.status });
        return "stop";
      case 410:
        this.markEnded(body && typeof body.reason === "string" ? body.reason : "session_ended");
        return "stop";
      case 400: {
        // The endpoint refused an envelope as malformed (I3: `400 { reason, seq }`).
        // Retrying it unchanged would block every envelope behind it, so it is
        // replaced in place — a smaller copy first, then a same-seq filler —
        // and only when nothing smaller is left does the rejection count as a
        // failure, so a stream the endpoint refuses outright surfaces as
        // buffering instead of spinning.
        const seq = body && typeof body.seq === "number" ? body.seq : null;
        const targets =
          seq !== null && envelopes.some((envelope) => envelope.seq === seq) ? [seq] : envelopes.map((envelope) => envelope.seq);
        const reason = body && typeof body.reason === "string" ? body.reason : "invalid_envelope";
        const t = this.options.elapsed?.() ?? 0;
        const replaced = targets.filter((target) => this.queue.replaceRejected(target, t) !== null);
        const label = targets.length === 1 ? `seq ${targets[0]}` : `seq ${targets.join(", ")}`;
        if (replaced.length === 0) {
          this.recordFailure(new Error(`riffrec live: the endpoint keeps rejecting ${label} as ${reason}`));
          return "stop";
        }
        this.options.onError?.(new Error(`riffrec live: the endpoint rejected ${label} as ${reason}; replaced with a placeholder so the stream keeps moving`));
        this.options.onQueueChange?.();
        return "continue";
      }
      default:
        this.recordFailure(new Error(`riffrec live: POST /events returned ${response.status}`));
        return "stop";
    }
  }

  private applyAck(ackedSeq: number): void {
    if (ackedSeq <= this.ackedSeq) return;
    this.ackedSeq = ackedSeq;
    this.queue.ackThrough(ackedSeq);
    this.options.onQueueChange?.();
    this.options.onAck?.(ackedSeq);
  }

  private recordFailure(error: unknown): void {
    this.consecutiveFailures += 1;
    if (error) this.options.onError?.(error);
    if (this.consecutiveFailures >= this.failureThreshold && this.state === "streaming") {
      this.setState("buffering");
    }
    const delay = this.backoffMs[Math.min(this.consecutiveFailures - 1, this.backoffMs.length - 1)] ?? 1000;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  // ---------------------------------------------------------------------
  // GET /stream (SSE over a fetch stream reader)
  // ---------------------------------------------------------------------

  private openStream(): void {
    if (this.closed || this.isTerminal || this.streamAbort) return;
    const abort = new AbortController();
    this.streamAbort = abort;
    void this.readStream(abort).finally(() => {
      if (this.streamAbort === abort) this.streamAbort = null;
    });
  }

  private async readStream(abort: AbortController): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.endpoint}/stream`, {
        method: "GET",
        headers: this.headers({ Accept: "text/event-stream" }),
        signal: abort.signal
      });
    } catch (error) {
      if (!abort.signal.aborted) this.scheduleStreamRetry(error);
      return;
    }

    if (!response.ok) {
      const body = await readJson(response);
      switch (response.status) {
        case 401:
        case 403:
          this.setState("unauthorized", { status: response.status });
          return;
        case 409:
          if (body && typeof body.expected_schema_version === "string") {
            this.setState("incompatible", { expectedSchemaVersion: body.expected_schema_version, status: 409 });
          } else {
            this.setState("conflict", {
              activeSessionId: body && typeof body.active_session_id === "string" ? body.active_session_id : undefined,
              status: 409
            });
          }
          return;
        case 410:
          this.markEnded(body && typeof body.reason === "string" ? body.reason : "session_ended");
          return;
        default:
          this.scheduleStreamRetry(new Error(`riffrec live: GET /stream returned ${response.status}`));
          return;
      }
    }

    if (!response.body) {
      this.scheduleStreamRetry(new Error("riffrec live: GET /stream returned no body"));
      return;
    }

    this.streamFailures = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = this.drainBlocks(buffer);
        if (this.closed || this.isTerminal) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
      buffer += decoder.decode();
      this.drainBlocks(`${buffer}\n\n`);
    } catch (error) {
      if (abort.signal.aborted) return;
      this.scheduleStreamRetry(error);
      return;
    }
    if (!this.closed && !this.isTerminal) this.scheduleStreamRetry(null);
  }

  private drainBlocks(buffer: string): string {
    let rest = buffer;
    for (;;) {
      const match = /\r?\n\r?\n/.exec(rest);
      if (!match) return rest;
      const block = rest.slice(0, match.index);
      rest = rest.slice(match.index + match[0].length);
      const event = parseServerEventBlock(block);
      if (event) this.dispatch(event);
    }
  }

  private dispatch(event: LiveServerEvent): void {
    switch (event.event) {
      case "ack":
        this.applyAck(event.data.acked_seq);
        break;
      case "session_ended":
        this.options.onServerEvent?.(event);
        this.markEnded(event.data.reason);
        return;
      case "unit_status":
      case "applied":
      case "ask":
        break;
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
    this.options.onServerEvent?.(event);
  }

  private scheduleStreamRetry(error: unknown): void {
    if (this.closed || this.isTerminal) return;
    if (error) this.options.onError?.(error);
    this.streamFailures += 1;
    const delay = this.backoffMs[Math.min(this.streamFailures - 1, this.backoffMs.length - 1)] ?? 1000;
    if (this.streamRetryTimer !== null) this.clearTimer(this.streamRetryTimer);
    this.streamRetryTimer = this.setTimer(() => {
      this.streamRetryTimer = null;
      this.openStream();
    }, delay);
  }

  private markEnded(reason: string | undefined): void {
    if (this.state === "ended") return;
    this.setState("ended");
    this.options.onEnded?.(reason);
    this.close();
  }

  private setState(state: StreamClientState, detail: StreamClientStateDetail = {}): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state, detail);
    if (this.isTerminal && state !== "closed") {
      this.streamAbort?.abort();
      this.streamAbort = null;
    }
  }
}

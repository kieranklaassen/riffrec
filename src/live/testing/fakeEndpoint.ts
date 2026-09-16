import {
  ALWAYS_WAKE_TRIGGERS,
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  UNIT_STATUSES,
  inspectEnvelope,
  type CheckpointTrigger,
  type ExecutionMode,
  type LiveAnnotation,
  type LiveAnswer,
  type LiveEnvelope,
  type LiveFrame,
  type LiveMintError,
  type LiveMintResponse,
  type LiveServerEvent,
  type LiveUnit,
  type LiveWakeBatch,
  type MicState,
  type StreamState,
  type UnitStatus,
  type WakeSessionStatus
} from "../contract";

/**
 * In-process endpoint implementing the I3 semantics without sockets: ack by
 * `seq`, a held queue released on checkpoints, `unit_status: "triaging"`
 * broadcast per released unit, `answer` checkpoints, 409 on a foreign
 * `schema_version`, 401 without a token, 413 on an oversize body.
 *
 * Drive it either through `handle()` with a plain request description or
 * through `fetch`, a `globalThis.fetch`-compatible function that also serves
 * `GET /stream` as a real SSE `ReadableStream`.
 */

export type FakeMethod = "GET" | "POST" | "OPTIONS";

export interface FakeRequest {
  method: FakeMethod;
  path: string;
  headers?: Record<string, string>;
  /** A JSON string or a value that will be serialized; size limits apply to the serialized bytes. */
  body?: unknown;
}

export interface FakeResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface FakeEndpointOptions {
  pageToken?: string;
  agentToken?: string;
  appOrigin?: string;
  /** Scripted `POST /mint` outcome. Defaults to a successful mint. */
  mint?: LiveMintResponse | LiveMintError;
  /** Base URL used by the `fetch` adaptor when it is given a relative path. */
  baseUrl?: string;
}

export interface FakeStatusSummary {
  session_id: string | null;
  ended: boolean;
  mode: ExecutionMode;
  acked_seq: number;
  mic: MicState | null;
  stream_state: StreamState | null;
  units: LiveUnit[];
  held_unit_ids: string[];
  pending_batch_ids: string[];
}

type ServerEventListener = (event: LiveServerEvent) => void;

const DEFAULT_MINT: LiveMintResponse = {
  client_secret: "ek_fake_0123456789abcdef",
  expires_at: 1789686600,
  model: "gpt-realtime"
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const PAGE_ROUTES = new Set(["/events", "/stream", "/mint", "/session/end"]);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function headerLookup(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function bearer(headers: Record<string, string> | undefined): string | null {
  const value = headerLookup(headers, "authorization");
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

function isMintError(mint: LiveMintResponse | LiveMintError): mint is LiveMintError {
  return "status" in mint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FakeEndpoint {
  readonly pageToken: string;
  readonly agentToken: string;
  readonly appOrigin: string;
  readonly baseUrl: string;

  /** Every server -> page event broadcast, in order. */
  readonly serverEvents: LiveServerEvent[] = [];
  /** Deduplicated envelopes, in arrival order. */
  readonly received: LiveEnvelope[] = [];
  /** Every batch served to `GET /wait`, including re-serves. */
  readonly servedBatches: LiveWakeBatch[] = [];
  readonly frames: LiveFrame[] = [];
  readonly annotations: LiveAnnotation[] = [];
  readonly units = new Map<string, LiveUnit>();

  sessionId: string | null = null;
  ended = false;
  mode: ExecutionMode = "smart";
  mic: MicState | null = null;
  streamState: StreamState | null = null;
  ackedSeq = 0;
  mint: LiveMintResponse | LiveMintError;

  private readonly seenSeqs = new Set<number>();
  private heldUnitIds: string[] = [];
  private releasedUnitIds = new Set<string>();
  private heldAnnotations: LiveAnnotation[] = [];
  private postReleaseWithdrawals: LiveUnit[] = [];
  private readyBatches: LiveWakeBatch[] = [];
  private unackedBatches: LiveWakeBatch[] = [];
  private batchCheckpointByUnit = new Map<string, string>();
  private answerCheckpointCount = 0;
  private modeChangeCheckpointCount = 0;
  private waiter: ((response: FakeResponse) => void) | null = null;
  private pageLostPending = false;
  private readonly listeners = new Set<ServerEventListener>();

  constructor(options: FakeEndpointOptions = {}) {
    this.pageToken = options.pageToken ?? "page-token";
    this.agentToken = options.agentToken ?? "agent-token";
    this.appOrigin = options.appOrigin ?? "http://localhost:5173";
    this.baseUrl = options.baseUrl ?? "http://fake-endpoint.test";
    this.mint = options.mint ?? DEFAULT_MINT;
  }

  // ---------------------------------------------------------------------
  // Convenience helpers for tests
  // ---------------------------------------------------------------------

  /** Headers a well-behaved page sends. */
  pageHeaders(sessionId: string = this.sessionId ?? "sess_fake"): Record<string, string> {
    return { Authorization: `Bearer ${this.pageToken}`, [LIVE_SESSION_HEADER]: sessionId, ...JSON_HEADERS };
  }

  agentHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.agentToken}`, ...JSON_HEADERS };
  }

  onServerEvent(listener: ServerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serverEventsNamed<N extends LiveServerEvent["event"]>(name: N): Extract<LiveServerEvent, { event: N }>[] {
    return this.serverEvents.filter((event): event is Extract<LiveServerEvent, { event: N }> => event.event === name);
  }

  /** Posts a batch of envelopes as the page would. */
  postEvents(envelopes: unknown[], sessionId?: string): Promise<FakeResponse> {
    const first = envelopes[0];
    const fromEnvelope = isRecord(first) && typeof first.session_id === "string" ? first.session_id : undefined;
    const id = sessionId ?? this.sessionId ?? fromEnvelope ?? "sess_fake";
    return this.handle({ method: "POST", path: "/events", headers: this.pageHeaders(id), body: envelopes });
  }

  /** Blocks like the agent's `wait` until a batch is available or the session ends. */
  wait(): Promise<FakeResponse> {
    return this.handle({ method: "GET", path: "/wait", headers: this.agentHeaders() });
  }

  ack(checkpointId: string): Promise<FakeResponse> {
    return this.handle({ method: "POST", path: `/checkpoints/${checkpointId}/ack`, headers: this.agentHeaders() });
  }

  setUnitStatus(unitId: string, status: UnitStatus, extra: { note?: string; guess?: string } = {}): Promise<FakeResponse> {
    return this.handle({
      method: "POST",
      path: `/units/${unitId}/status`,
      headers: this.agentHeaders(),
      body: { status, ...extra }
    });
  }

  ask(unitId: string, question: string): Promise<FakeResponse> {
    return this.handle({
      method: "POST",
      path: `/units/${unitId}/ask`,
      headers: this.agentHeaders(),
      body: { question }
    });
  }

  /**
   * Simulates the page-lost grace window expiring (KTD8): the next batch served,
   * new or re-served, carries `session_status: "page_lost"` once.
   */
  markPageLost(): void {
    this.pageLostPending = true;
  }

  status(): FakeStatusSummary {
    return {
      session_id: this.sessionId,
      ended: this.ended,
      mode: this.mode,
      acked_seq: this.ackedSeq,
      mic: this.mic,
      stream_state: this.streamState,
      units: [...this.units.values()],
      held_unit_ids: [...this.heldUnitIds],
      pending_batch_ids: [...this.unackedBatches, ...this.readyBatches].map((batch) => batch.checkpoint_id)
    };
  }

  // ---------------------------------------------------------------------
  // Request handling
  // ---------------------------------------------------------------------

  async handle(request: FakeRequest): Promise<FakeResponse> {
    const path = request.path.split("?")[0];
    if (request.method === "OPTIONS") return this.preflight(path);

    if (PAGE_ROUTES.has(path)) return this.handlePageRoute(path, request);
    return this.handleAgentRoute(path, request);
  }

  private preflight(path: string): FakeResponse {
    if (!PAGE_ROUTES.has(path)) return this.json(403, { reason: "forbidden" });
    return {
      status: 204,
      body: null,
      headers: {
        "Access-Control-Allow-Origin": this.appOrigin,
        "Access-Control-Allow-Headers": `Authorization, Content-Type, ${LIVE_SESSION_HEADER}`,
        "Access-Control-Allow-Methods": "GET, POST",
        Vary: "Origin"
      }
    };
  }

  private handlePageRoute(path: string, request: FakeRequest): FakeResponse | Promise<FakeResponse> {
    const token = bearer(request.headers);
    if (token === null) return this.json(401, { reason: "missing_token" });
    if (token === this.agentToken) return this.json(403, { reason: "wrong_credential" });
    if (token !== this.pageToken) return this.json(401, { reason: "bad_token" });

    const sessionHeader = headerLookup(request.headers, LIVE_SESSION_HEADER);
    if (!sessionHeader) return this.json(400, { reason: "missing_session" });
    if (this.sessionId === null) this.sessionId = sessionHeader;
    if (sessionHeader !== this.sessionId) return this.json(409, { active_session_id: this.sessionId });
    if (this.ended) return this.json(410, { reason: "session_ended" });

    switch (path) {
      case "/events":
        return this.handleEvents(request);
      case "/stream":
        return this.json(200, { events: [...this.serverEvents] });
      case "/mint":
        return this.handleMint(request);
      case "/session/end":
        return this.handleSessionEnd();
      default:
        return this.json(404, { reason: "not_found" });
    }
  }

  private handleEvents(request: FakeRequest): FakeResponse {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.json(400, { reason: "invalid_json" });
    }
    if (!Array.isArray(parsed)) return this.json(400, { reason: "expected_array" });

    const loneFrame = parsed.length === 1 && isRecord(parsed[0]) && parsed[0].type === "frame";
    const cap = loneFrame ? LIVE_FRAME_BODY_MAX_BYTES : LIVE_EVENTS_BODY_MAX_BYTES;
    if (byteLength(raw) > cap) return this.json(413, { max_bytes: cap });

    const envelopes: LiveEnvelope[] = [];
    for (const item of parsed) {
      const inspection = inspectEnvelope(item);
      if (!inspection.ok) {
        if (inspection.reason === "unsupported_schema_version") {
          return this.json(409, { expected_schema_version: LIVE_SCHEMA_VERSION });
        }
        const seq = isRecord(item) && typeof item.seq === "number" ? item.seq : undefined;
        return this.json(400, { reason: inspection.reason, seq });
      }
      if (inspection.envelope.session_id !== this.sessionId) {
        return this.json(400, { reason: "session_mismatch", seq: inspection.envelope.seq });
      }
      envelopes.push(inspection.envelope);
    }

    for (const envelope of envelopes) {
      if (this.seenSeqs.has(envelope.seq)) continue;
      this.seenSeqs.add(envelope.seq);
      this.received.push(envelope);
      this.apply(envelope);
    }

    const before = this.ackedSeq;
    while (this.seenSeqs.has(this.ackedSeq + 1)) this.ackedSeq += 1;
    if (this.ackedSeq !== before) this.broadcast({ event: "ack", data: { acked_seq: this.ackedSeq } });

    return this.json(200, { acked_seq: this.ackedSeq });
  }

  private apply(envelope: LiveEnvelope): void {
    switch (envelope.type) {
      case "click":
      case "network_request":
      case "console_error":
      case "navigation":
        return;
      case "transcript":
        return;
      case "unit": {
        const unit = envelope.payload;
        this.units.set(unit.id, unit);
        if (unit.status !== "withdrawn" && !this.releasedUnitIds.has(unit.id)) {
          this.heldUnitIds.push(unit.id);
        }
        return;
      }
      case "unit_update": {
        const update = envelope.payload;
        const unit = this.units.get(update.unit_id);
        if (!unit) return;
        const confirmed = update.confirmed ?? unit.confirmed;
        if (unit.status !== "initial") {
          if (confirmed) this.units.set(unit.id, { ...unit, confirmed });
          return;
        }
        this.units.set(unit.id, {
          ...unit,
          statement: update.statement ?? unit.statement,
          anchors: update.anchors_add ? [...unit.anchors, ...update.anchors_add] : unit.anchors,
          ...(confirmed ? { confirmed } : {})
        });
        return;
      }
      case "unit_withdraw": {
        const unit = this.units.get(envelope.payload.unit_id);
        if (!unit) return;
        const withdrawn: LiveUnit = { ...unit, status: "withdrawn" };
        this.units.set(unit.id, withdrawn);
        if (this.releasedUnitIds.has(unit.id)) {
          this.postReleaseWithdrawals.push(withdrawn);
        } else {
          this.heldUnitIds = this.heldUnitIds.filter((id) => id !== unit.id);
        }
        return;
      }
      case "annotation":
        this.annotations.push(envelope.payload);
        this.heldAnnotations.push(envelope.payload);
        return;
      case "checkpoint":
        this.release(envelope.payload.id, envelope.payload.trigger, envelope.payload.mode);
        return;
      case "answer": {
        const answer: LiveAnswer = envelope.payload;
        const unit = this.units.get(answer.unit_id);
        if (unit && unit.status === "needs_info") this.units.set(unit.id, { ...unit, status: "triaging" });
        this.answerCheckpointCount += 1;
        this.enqueue({
          schema_version: LIVE_SCHEMA_VERSION,
          checkpoint_id: `cp_answer_${String(this.answerCheckpointCount).padStart(4, "0")}`,
          kind: "answer",
          mode_at_checkpoint: this.mode,
          session_status: "live",
          units: [],
          annotations: [],
          answers: [answer]
        });
        return;
      }
      case "frame":
        this.frames.push(envelope.payload);
        return;
      case "mic":
        this.mic = envelope.payload.state;
        return;
      case "mode": {
        const previous = this.mode;
        this.mode = envelope.payload.mode;
        // KTD12: leaving Collect releases the accepted-but-unapplied backlog as a
        // `mode_change` wake, served even when nothing is newly held.
        if (previous === "collect" && this.mode !== "collect") {
          this.modeChangeCheckpointCount += 1;
          this.enqueue({
            schema_version: LIVE_SCHEMA_VERSION,
            checkpoint_id: `cp_mode_${String(this.modeChangeCheckpointCount).padStart(4, "0")}`,
            kind: "mode_change",
            mode_at_checkpoint: this.mode,
            session_status: "live",
            units: this.acceptedBacklog(),
            annotations: [],
            answers: []
          });
        }
        return;
      }
      case "stream_state":
        this.streamState = envelope.payload.state;
        return;
      default: {
        const exhaustive: never = envelope;
        return exhaustive;
      }
    }
  }

  /** Units the agent reported `accepted` with no `applied`/`blocked` since (KTD12 backlog). */
  private acceptedBacklog(): LiveUnit[] {
    return [...this.units.values()].filter((unit) => unit.status === "accepted");
  }

  /**
   * Releases held units. A `silence`/`page_change`/`send` checkpoint that releases
   * nothing does not create a batch; `final` always does and also carries the
   * accepted-but-unapplied backlog (KTD9, KTD12).
   */
  release(checkpointId: string, trigger: CheckpointTrigger, mode: ExecutionMode = this.mode): LiveWakeBatch | null {
    const alwaysWakes = ALWAYS_WAKE_TRIGGERS.includes(trigger);
    if (!alwaysWakes && this.heldUnitIds.length === 0 && this.postReleaseWithdrawals.length === 0) return null;
    const backlog = trigger === "final" ? this.acceptedBacklog() : [];

    const released: LiveUnit[] = [];
    for (const id of this.heldUnitIds) {
      const unit = this.units.get(id);
      if (!unit) continue;
      const triaging: LiveUnit = { ...unit, status: "triaging" };
      this.units.set(id, triaging);
      this.releasedUnitIds.add(id);
      this.batchCheckpointByUnit.set(id, checkpointId);
      released.push(triaging);
      this.broadcast({ event: "unit_status", data: { unit_id: id, status: "triaging" } });
    }
    const batch: LiveWakeBatch = {
      schema_version: LIVE_SCHEMA_VERSION,
      checkpoint_id: checkpointId,
      kind: trigger,
      mode_at_checkpoint: mode,
      session_status: "live",
      units: [...released, ...this.postReleaseWithdrawals, ...backlog],
      annotations: this.heldAnnotations,
      answers: []
    };
    this.heldUnitIds = [];
    this.heldAnnotations = [];
    this.postReleaseWithdrawals = [];
    this.enqueue(batch);
    return batch;
  }

  private enqueue(batch: LiveWakeBatch): void {
    this.readyBatches.push(batch);
    this.serveWaiter();
  }

  private serveWaiter(): void {
    if (!this.waiter) return;
    const response = this.nextBatchResponse();
    if (!response) return;
    const waiter = this.waiter;
    this.waiter = null;
    waiter(response);
  }

  private nextBatchResponse(): FakeResponse | null {
    let batch = this.unackedBatches[0];
    if (!batch) {
      const next = this.readyBatches.shift();
      if (next) {
        this.unackedBatches.push(next);
        batch = next;
      }
    }
    if (!batch) {
      return this.ended ? this.json(410, { status: "session_ended" }) : null;
    }
    const sessionStatus: WakeSessionStatus = this.pageLostPending ? "page_lost" : "live";
    this.pageLostPending = false;
    const served = { ...batch, session_status: sessionStatus };
    this.servedBatches.push(served);
    return this.json(200, served);
  }

  private handleMint(request: FakeRequest): FakeResponse {
    const body = this.parseBody(request);
    if (!isRecord(body) || body.session_id !== this.sessionId) return this.json(400, { reason: "session_mismatch" });
    if (isMintError(this.mint)) {
      const { status, ...rest } = this.mint;
      return this.json(status, rest);
    }
    return this.json(200, this.mint);
  }

  private handleSessionEnd(): FakeResponse {
    this.ended = true;
    this.broadcast({ event: "session_ended", data: { reason: "riffer_done" } });
    this.serveWaiter();
    return this.json(200, {});
  }

  private handleAgentRoute(path: string, request: FakeRequest): FakeResponse | Promise<FakeResponse> {
    if (headerLookup(request.headers, "origin") !== undefined) return this.json(403, { reason: "origin_forbidden" });
    const token = bearer(request.headers);
    if (token === null) return this.json(401, { reason: "missing_token" });
    if (token === this.pageToken) return this.json(403, { reason: "wrong_credential" });
    if (token !== this.agentToken) return this.json(401, { reason: "bad_token" });

    if (path === "/wait" && request.method === "GET") return this.handleWait();
    if (path === "/status" && request.method === "GET") return this.json(200, this.status());

    const ackMatch = /^\/checkpoints\/([^/]+)\/ack$/.exec(path);
    if (ackMatch && request.method === "POST") {
      const id = decodeURIComponent(ackMatch[1]);
      const index = this.unackedBatches.findIndex((batch) => batch.checkpoint_id === id);
      if (index === -1) return this.json(404, { reason: "unknown_checkpoint" });
      this.unackedBatches.splice(index, 1);
      return this.json(200, {});
    }

    const unitMatch = /^\/units\/([^/]+)\/(status|ask)$/.exec(path);
    if (unitMatch && request.method === "POST") {
      const unitId = decodeURIComponent(unitMatch[1]);
      const unit = this.units.get(unitId);
      if (!unit) return this.json(404, { reason: "unknown_unit" });
      const body = this.parseBody(request);
      if (!isRecord(body)) return this.json(400, { reason: "invalid_json" });
      if (unitMatch[2] === "status") return this.handleUnitStatus(unit, body);
      return this.handleUnitAsk(unit, body);
    }

    return this.json(404, { reason: "not_found" });
  }

  private handleWait(): Promise<FakeResponse> | FakeResponse {
    if (this.waiter) return this.json(409, { status: "wait-taken" });
    const immediate = this.nextBatchResponse();
    if (immediate) return immediate;
    return new Promise<FakeResponse>((resolve) => {
      this.waiter = resolve;
    });
  }

  private handleUnitStatus(unit: LiveUnit, body: Record<string, unknown>): FakeResponse {
    const status = body.status;
    if (typeof status !== "string" || !(UNIT_STATUSES as readonly string[]).includes(status)) {
      return this.json(400, { reason: "invalid_status" });
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const guess = typeof body.guess === "string" ? body.guess : undefined;
    this.units.set(unit.id, { ...unit, status: status as UnitStatus });
    this.broadcast({
      event: "unit_status",
      data: { unit_id: unit.id, status: status as UnitStatus, ...(note ? { note } : {}), ...(guess ? { guess } : {}) }
    });
    if (status === "applied") {
      this.broadcast({
        event: "applied",
        data: { checkpoint_id: this.batchCheckpointByUnit.get(unit.id) ?? "", unit_ids: [unit.id] }
      });
    }
    return this.json(200, {});
  }

  private handleUnitAsk(unit: LiveUnit, body: Record<string, unknown>): FakeResponse {
    if (typeof body.question !== "string" || body.question.length === 0) {
      return this.json(400, { reason: "missing_question" });
    }
    this.units.set(unit.id, { ...unit, status: "needs_info" });
    this.broadcast({ event: "unit_status", data: { unit_id: unit.id, status: "needs_info" } });
    this.broadcast({ event: "ask", data: { unit_id: unit.id, question: body.question } });
    return this.json(200, {});
  }

  private parseBody(request: FakeRequest): unknown {
    if (typeof request.body !== "string") return request.body;
    try {
      return JSON.parse(request.body);
    } catch {
      return undefined;
    }
  }

  private broadcast(event: LiveServerEvent): void {
    this.serverEvents.push(event);
    for (const listener of this.listeners) listener(event);
  }

  private json(status: number, body: unknown): FakeResponse {
    return { status, body, headers: { ...JSON_HEADERS } };
  }

  // ---------------------------------------------------------------------
  // fetch adaptor
  // ---------------------------------------------------------------------

  /**
   * A `fetch`-compatible function bound to this endpoint. `GET /stream` returns a
   * `text/event-stream` body that emits every broadcast as `event:`/`data:` frames;
   * cancelling the body detaches the listener.
   */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), this.baseUrl);
    const method = ((init?.method ?? request?.method ?? "GET").toUpperCase()) as FakeMethod;
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? request?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = init?.body ?? (request && method === "POST" ? await request.text() : undefined);

    if (url.pathname === "/stream" && method === "GET") {
      const auth = this.handlePageRoute("/stream", { method, path: "/stream", headers });
      const resolved = await auth;
      if (resolved.status !== 200) return toResponse(resolved);
      return this.streamResponse();
    }

    const response = await this.handle({
      method,
      path: url.pathname,
      headers,
      body: typeof body === "string" ? body : body === undefined ? undefined : String(body)
    });
    return toResponse(response);
  };

  private streamResponse(): Response {
    const encoder = new TextEncoder();
    let detach: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        detach = this.onServerEvent((event) => {
          controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
          if (event.event === "session_ended") {
            detach?.();
            controller.close();
          }
        });
      },
      cancel: () => {
        detach?.();
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }
}

function toResponse(response: FakeResponse): Response {
  if (response.status === 204 || response.body === null) {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers });
}

export function createFakeEndpoint(options?: FakeEndpointOptions): FakeEndpoint {
  return new FakeEndpoint(options);
}

import {
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  type FrameDropReason,
  type LiveEnvelope,
  type LiveFrame
} from "./contract";

/**
 * The unsent envelope queue (KTD2 replay, KTD16 persistence).
 *
 * Envelopes keep their `seq` from the moment they are queued, so the endpoint's
 * contiguous-ack rule holds across outages and reloads. A queued `frame` keeps
 * its `jpeg_base64` in memory and in the frame store; the persisted form holds
 * only the frame id and metadata once the store write has settled (until then
 * the bytes stay inline so a reload cannot lose them). When an envelope must
 * go — a quota eviction, a `413`, a lost store entry — it stays in the queue
 * as a same-`seq` stand-in so numbering never gaps: a frame becomes a
 * tombstone (`jpeg_base64: ""`, `dropped: <reason>`), anything else becomes a
 * `stream_state: "buffering"` filler. Fillers are dedupe-safe: if the endpoint
 * already holds that `seq`, it ignores them.
 */

export interface FrameStore {
  put(sessionId: string, frameId: string, jpegBase64: string): Promise<void>;
  get(sessionId: string, frameId: string): Promise<string | null>;
  delete(sessionId: string, frameId: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

const FRAME_DB_NAME = "riffrec-live-frames";
const FRAME_DB_VERSION = 1;
const FRAME_STORE_NAME = "frames";

function frameKey(sessionId: string, frameId: string): string {
  return `${sessionId}/${frameId}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function openFrameDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FRAME_DB_NAME, FRAME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FRAME_STORE_NAME)) {
        db.createObjectStore(FRAME_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open riffrec live frame store."));
  });
}

/** The `src/output/filesystem.ts` IndexedDB pattern, keyed `<session_id>/<frame_id>`. */
export class IndexedDbFrameStore implements FrameStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) this.db = openFrameDb();
    return this.db;
  }

  async put(sessionId: string, frameId: string, jpegBase64: string): Promise<void> {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    await requestToPromise(store.put(jpegBase64, frameKey(sessionId, frameId)));
  }

  async get(sessionId: string, frameId: string): Promise<string | null> {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readonly").objectStore(FRAME_STORE_NAME);
    const value = await requestToPromise(store.get(frameKey(sessionId, frameId)));
    return typeof value === "string" ? value : null;
  }

  async delete(sessionId: string, frameId: string): Promise<void> {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    await requestToPromise(store.delete(frameKey(sessionId, frameId)));
  }

  async clear(sessionId: string): Promise<void> {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    const prefix = `${sessionId}/`;
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    await requestToPromise(store.delete(range));
  }
}

/** Used when IndexedDB is unavailable (tests, non-browser hosts). */
export class MemoryFrameStore implements FrameStore {
  readonly entries = new Map<string, string>();

  async put(sessionId: string, frameId: string, jpegBase64: string): Promise<void> {
    this.entries.set(frameKey(sessionId, frameId), jpegBase64);
  }

  async get(sessionId: string, frameId: string): Promise<string | null> {
    return this.entries.get(frameKey(sessionId, frameId)) ?? null;
  }

  async delete(sessionId: string, frameId: string): Promise<void> {
    this.entries.delete(frameKey(sessionId, frameId));
  }

  async clear(sessionId: string): Promise<void> {
    const prefix = `${sessionId}/`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

export function createDefaultFrameStore(): FrameStore {
  return typeof indexedDB !== "undefined" ? new IndexedDbFrameStore() : new MemoryFrameStore();
}

/** What `sessionStorage` holds for one queued envelope: a frame's JPEG only while its store write is pending. */
export type PersistedQueueEntry = LiveEnvelope;

export interface QueueBatch {
  envelopes: LiveEnvelope[];
  /** True when the batch is a lone `frame` (posted alone, larger body cap). */
  frame: boolean;
}

export interface UnsentQueueOptions {
  onStoreError?: (error: unknown) => void;
  /** Called when a pending frame store write settles, so the owner can re-persist without the bytes. */
  onStoreSettled?: () => void;
}

export interface RehydrateRange {
  /** Highest `seq` the endpoint acknowledged before the reload. */
  ackedSeq: number;
  /** The `seq` the next new envelope will take. */
  nextSeq: number;
  /** Timestamp to stamp on gap fillers. */
  t: number;
}

function isFrameEnvelope(envelope: LiveEnvelope): envelope is LiveEnvelope<"frame"> {
  return envelope.type === "frame";
}

function stripFrame(envelope: LiveEnvelope<"frame">): LiveEnvelope<"frame"> {
  return { ...envelope, payload: { ...envelope.payload, jpeg_base64: "" } };
}

export function tombstoneFrame(envelope: LiveEnvelope<"frame">, reason: FrameDropReason): LiveEnvelope<"frame"> {
  const payload: LiveFrame = { ...envelope.payload, jpeg_base64: "", dropped: reason };
  return { ...envelope, payload };
}

/** A same-`seq` stand-in for an envelope whose content the page could not keep. */
export function fillerEnvelope(sessionId: string, seq: number, t: number): LiveEnvelope<"stream_state"> {
  return { schema_version: LIVE_SCHEMA_VERSION, session_id: sessionId, seq, t, type: "stream_state", payload: { state: "buffering" } };
}

/** Whether an envelope is already a filler or tombstone (nothing left to evict). */
export function isPlaceholder(envelope: LiveEnvelope): boolean {
  if (isFrameEnvelope(envelope)) return envelope.payload.dropped !== undefined;
  return envelope.type === "stream_state" && envelope.payload.state === "buffering";
}

/**
 * Removes the one unbounded member of an envelope so it fits the batch cap.
 * Returns null when the envelope has nothing to shed.
 */
export function shrinkEnvelope(envelope: LiveEnvelope): LiveEnvelope | null {
  if (envelope.type === "unit" && envelope.payload.evidence.telemetry_window) {
    const { telemetry_window: _dropped, ...evidence } = envelope.payload.evidence;
    return { ...envelope, payload: { ...envelope.payload, evidence } };
  }
  return null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export class UnsentQueue {
  private entries: LiveEnvelope[] = [];
  /** Frame ids whose JPEG lives only in the frame store (rehydrated queue). */
  private readonly detached = new Set<string>();
  /** Frame ids the store does not hold yet (write pending or failed); their bytes stay inline when persisted. */
  private readonly pendingPuts = new Set<string>();
  private readonly onStoreError: (error: unknown) => void;
  private readonly onStoreSettled: () => void;
  /** Envelopes replaced by a filler or tombstone since construction. */
  evictions = 0;

  constructor(
    private readonly sessionId: string,
    private readonly frameStore: FrameStore,
    options: UnsentQueueOptions = {}
  ) {
    this.onStoreError = options.onStoreError ?? (() => {});
    this.onStoreSettled = options.onStoreSettled ?? (() => {});
  }

  /**
   * Rebuilds the queue from `sessionStorage`. `entries` is null when the last
   * persist had to drop the queue; every `seq` in `(ackedSeq, nextSeq)` that is
   * missing is then re-created as a filler so the endpoint's contiguous ack
   * can advance past the loss.
   */
  static fromPersisted(
    sessionId: string,
    entries: PersistedQueueEntry[] | null,
    range: RehydrateRange,
    frameStore: FrameStore,
    options?: UnsentQueueOptions
  ): UnsentQueue {
    const queue = new UnsentQueue(sessionId, frameStore, options);
    const bySeq = new Map<number, LiveEnvelope>();
    for (const entry of entries ?? []) {
      if (entry.seq <= range.ackedSeq || entry.seq >= range.nextSeq) continue;
      bySeq.set(entry.seq, entry);
    }
    for (let seq = range.ackedSeq + 1; seq < range.nextSeq; seq += 1) {
      const entry = bySeq.get(seq) ?? fillerEnvelope(sessionId, seq, range.t);
      queue.entries.push(entry);
      if (!isFrameEnvelope(entry) || entry.payload.dropped) continue;
      if (entry.payload.jpeg_base64 === "") {
        queue.detached.add(entry.payload.id);
      } else {
        queue.writeFrame(entry);
      }
    }
    return queue;
  }

  get length(): number {
    return this.entries.length;
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Lowest queued `seq`, or null when empty. */
  get headSeq(): number | null {
    return this.entries[0]?.seq ?? null;
  }

  all(): LiveEnvelope[] {
    return [...this.entries];
  }

  /** Frames still carrying bytes (in memory or detached in the store). */
  liveFrameCount(): number {
    return this.entries.filter((entry) => isFrameEnvelope(entry) && !entry.payload.dropped).length;
  }

  /** Envelopes that still carry real content and could be evicted. */
  evictableCount(): number {
    return this.entries.filter((entry) => !isPlaceholder(entry)).length;
  }

  enqueue(envelope: LiveEnvelope): void {
    this.entries.push(envelope);
    if (isFrameEnvelope(envelope) && envelope.payload.jpeg_base64 !== "" && !envelope.payload.dropped) {
      this.writeFrame(envelope);
    }
  }

  private writeFrame(envelope: LiveEnvelope<"frame">): void {
    const id = envelope.payload.id;
    this.pendingPuts.add(id);
    this.frameStore.put(this.sessionId, id, envelope.payload.jpeg_base64).then(
      () => {
        if (this.pendingPuts.delete(id)) {
          this.onStoreSettled();
          return;
        }
        // Acked, dropped, or evicted while the write was in flight: its delete
        // ran before the bytes landed, so take them out again.
        this.frameStore.delete(this.sessionId, id).catch(this.onStoreError);
      },
      (error: unknown) => {
        // The store never took the bytes, so the frame stays pending and its
        // JPEG stays inline in `sessionStorage`.
        this.onStoreError(error);
      }
    );
  }

  /** Drops every envelope the endpoint has acknowledged. */
  ackThrough(ackedSeq: number): LiveEnvelope[] {
    const acked = this.entries.filter((entry) => entry.seq <= ackedSeq);
    this.entries = this.entries.filter((entry) => entry.seq > ackedSeq);
    for (const entry of acked) {
      if (isFrameEnvelope(entry)) {
        this.detached.delete(entry.payload.id);
        this.pendingPuts.delete(entry.payload.id);
        this.frameStore.delete(this.sessionId, entry.payload.id).catch(this.onStoreError);
      }
    }
    return acked;
  }

  /**
   * The next body to post: a lone frame (with bytes rehydrated from the store
   * when the queue came back from `sessionStorage`), or up to `limit` non-frame
   * envelopes that fit under the batch cap, in `seq` order.
   */
  async nextBatch(limit = Number.POSITIVE_INFINITY): Promise<QueueBatch | null> {
    const head = this.entries[0];
    if (!head) return null;
    if (isFrameEnvelope(head)) {
      const hydrated = await this.hydrate(head);
      return { envelopes: [hydrated], frame: true };
    }

    const envelopes: LiveEnvelope[] = [];
    let bytes = 2;
    for (const entry of this.entries) {
      if (isFrameEnvelope(entry) || envelopes.length >= limit) break;
      const size = byteLength(JSON.stringify(entry)) + 1;
      if (envelopes.length > 0 && bytes + size > LIVE_EVENTS_BODY_MAX_BYTES) break;
      envelopes.push(entry);
      bytes += size;
    }
    return { envelopes, frame: false };
  }

  private async hydrate(envelope: LiveEnvelope<"frame">): Promise<LiveEnvelope<"frame">> {
    if (envelope.payload.jpeg_base64 !== "" || envelope.payload.dropped) return envelope;
    if (!this.detached.has(envelope.payload.id)) return envelope;
    let stored: string | null = null;
    try {
      stored = await this.frameStore.get(this.sessionId, envelope.payload.id);
    } catch (error) {
      this.onStoreError(error);
    }
    if (stored === null) {
      const dropped = tombstoneFrame(envelope, "quota");
      this.replace(envelope.seq, dropped);
      this.detached.delete(envelope.payload.id);
      this.evictions += 1;
      return dropped;
    }
    return { ...envelope, payload: { ...envelope.payload, jpeg_base64: stored } };
  }

  /** Replaces a queued frame with its tombstone; used after a `413`. */
  dropFrame(seq: number, reason: FrameDropReason): LiveEnvelope<"frame"> | null {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry || !isFrameEnvelope(entry)) return null;
    const dropped = tombstoneFrame(entry, reason);
    this.replace(seq, dropped);
    this.forgetFrame(entry.payload.id);
    this.evictions += 1;
    return dropped;
  }

  /**
   * Replaces one queued envelope with a smaller form (`shrinkEnvelope`) or,
   * when nothing can be shed, a same-`seq` filler. Returns the replacement.
   */
  shrinkOrFill(seq: number, t: number): LiveEnvelope | null {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry) return null;
    if (isFrameEnvelope(entry)) return this.dropFrame(seq, "oversize");
    const replacement = shrinkEnvelope(entry) ?? fillerEnvelope(this.sessionId, seq, t);
    this.replace(seq, replacement);
    this.evictions += 1;
    return replacement;
  }

  /**
   * A same-`seq` stand-in for an envelope the endpoint refused as malformed
   * (`400`): a shrunk copy when the envelope has something to shed, otherwise a
   * filler; a frame goes straight to a filler, since its metadata was what was
   * refused. Returns null once the entry is already a filler — nothing smaller
   * exists, and the caller treats the rejection as a failure.
   */
  replaceRejected(seq: number, t: number): LiveEnvelope | null {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry) return null;
    if (isFrameEnvelope(entry)) {
      const filler = fillerEnvelope(this.sessionId, seq, t);
      this.replace(seq, filler);
      this.forgetFrame(entry.payload.id);
      this.evictions += 1;
      return filler;
    }
    if (isPlaceholder(entry)) return null;
    const replacement = shrinkEnvelope(entry) ?? fillerEnvelope(this.sessionId, seq, t);
    this.replace(seq, replacement);
    this.evictions += 1;
    return replacement;
  }

  /**
   * Evicts the oldest `count` envelopes that still carry content, keeping
   * their `seq` as fillers or tombstones. Returns how many were evicted.
   */
  evictOldest(count: number, t: number): number {
    let evicted = 0;
    for (const entry of this.entries) {
      if (evicted >= count) break;
      if (isPlaceholder(entry)) continue;
      if (isFrameEnvelope(entry)) {
        this.replace(entry.seq, tombstoneFrame(entry, "quota"));
        this.forgetFrame(entry.payload.id);
      } else {
        this.replace(entry.seq, fillerEnvelope(this.sessionId, entry.seq, t));
      }
      evicted += 1;
    }
    this.evictions += evicted;
    return evicted;
  }

  /** The `sessionStorage` form: frames without their bytes once the store holds them. */
  toPersisted(): PersistedQueueEntry[] {
    return this.entries.map((entry) => {
      if (!isFrameEnvelope(entry)) return entry;
      if (this.pendingPuts.has(entry.payload.id)) return entry;
      return stripFrame(entry);
    });
  }

  async clearStore(): Promise<void> {
    // Nothing queued is owed a write any more; a put still in flight cleans up after itself.
    this.pendingPuts.clear();
    try {
      await this.frameStore.clear(this.sessionId);
    } catch (error) {
      this.onStoreError(error);
    }
  }

  private forgetFrame(id: string): void {
    this.detached.delete(id);
    this.pendingPuts.delete(id);
    this.frameStore.delete(this.sessionId, id).catch(this.onStoreError);
  }

  private replace(seq: number, next: LiveEnvelope): void {
    this.entries = this.entries.map((entry) => (entry.seq === seq ? next : entry));
  }
}

/** Matches the quota error every browser throws from `Storage.setItem`. */
export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error) && (typeof error !== "object" || error === null)) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

export type PersistOutcome = "stored" | "stored_after_eviction" | "stored_without_queue" | "stored_minimal" | "failed";

/** What the record builder is asked for as the guard sheds weight. */
export type PersistTier = "full" | "without_queue" | "minimal";

export interface PersistGuardOptions {
  /** Timestamp for fillers created by eviction. */
  t: number;
  /** Fraction of the queue's content-bearing envelopes to evict per quota error (oldest first). */
  evictFraction?: number;
}

/**
 * Writes `build(tier, queueEntries)` under `key`, never throwing. On a quota
 * error it first evicts the oldest content-bearing queued envelopes (they keep
 * their `seq` as fillers, so numbering stays contiguous), then persists the
 * record without the queue, then a minimal record.
 */
export function persistWithQuotaGuard(
  storage: Pick<Storage, "setItem">,
  key: string,
  queue: UnsentQueue | null,
  build: (tier: PersistTier, queueEntries: PersistedQueueEntry[] | null) => string,
  options: PersistGuardOptions
): PersistOutcome {
  const fraction = options.evictFraction ?? 0.25;
  let evicted = false;
  for (;;) {
    try {
      storage.setItem(key, build("full", queue ? queue.toPersisted() : []));
      return evicted ? "stored_after_eviction" : "stored";
    } catch (error) {
      if (!isQuotaExceededError(error)) return "failed";
      const evictable = queue?.evictableCount() ?? 0;
      if (queue && evictable > 0) {
        queue.evictOldest(Math.max(1, Math.ceil(evictable * fraction)), options.t);
        evicted = true;
        continue;
      }
      break;
    }
  }
  try {
    storage.setItem(key, build("without_queue", null));
    return "stored_without_queue";
  } catch (error) {
    if (!isQuotaExceededError(error)) return "failed";
  }
  try {
    storage.setItem(key, build("minimal", null));
    return "stored_minimal";
  } catch {
    return "failed";
  }
}

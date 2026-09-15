import {
  LIVE_EVENTS_BODY_MAX_BYTES,
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
 * only the frame id and metadata, so a long buffering episode cannot push a
 * megabyte-scale queue at `sessionStorage`'s quota. When a frame's bytes must
 * go — a quota eviction or a `413` — the envelope stays in the queue as a
 * tombstone (`jpeg_base64: ""`, `dropped: <reason>`) so its `seq` still reaches
 * the endpoint.
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

/** What `sessionStorage` holds for one queued envelope: a frame's JPEG is never here. */
export type PersistedQueueEntry = LiveEnvelope;

export interface QueueBatch {
  envelopes: LiveEnvelope[];
  /** True when the batch is a lone `frame` (posted alone, larger body cap). */
  frame: boolean;
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

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export class UnsentQueue {
  private entries: LiveEnvelope[] = [];
  /** Frame ids whose JPEG lives only in the frame store (rehydrated queue). */
  private readonly detached = new Set<string>();

  constructor(
    private readonly sessionId: string,
    private readonly frameStore: FrameStore,
    private readonly onStoreError: (error: unknown) => void = () => {}
  ) {}

  static fromPersisted(
    sessionId: string,
    entries: PersistedQueueEntry[],
    frameStore: FrameStore,
    onStoreError?: (error: unknown) => void
  ): UnsentQueue {
    const queue = new UnsentQueue(sessionId, frameStore, onStoreError);
    for (const entry of entries) {
      queue.entries.push(entry);
      if (isFrameEnvelope(entry) && entry.payload.jpeg_base64 === "" && !entry.payload.dropped) {
        queue.detached.add(entry.payload.id);
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

  enqueue(envelope: LiveEnvelope): void {
    this.entries.push(envelope);
    if (isFrameEnvelope(envelope) && envelope.payload.jpeg_base64 !== "") {
      this.frameStore.put(this.sessionId, envelope.payload.id, envelope.payload.jpeg_base64).catch(this.onStoreError);
    }
  }

  /** Drops every envelope the endpoint has acknowledged. */
  ackThrough(ackedSeq: number): LiveEnvelope[] {
    const acked = this.entries.filter((entry) => entry.seq <= ackedSeq);
    this.entries = this.entries.filter((entry) => entry.seq > ackedSeq);
    for (const entry of acked) {
      if (isFrameEnvelope(entry)) {
        this.detached.delete(entry.payload.id);
        this.frameStore.delete(this.sessionId, entry.payload.id).catch(this.onStoreError);
      }
    }
    return acked;
  }

  /**
   * The next body to post: a lone frame (with bytes rehydrated from the store
   * when the queue came back from `sessionStorage`), or as many non-frame
   * envelopes as fit under the batch cap, in `seq` order.
   */
  async nextBatch(): Promise<QueueBatch | null> {
    const head = this.entries[0];
    if (!head) return null;
    if (isFrameEnvelope(head)) {
      const hydrated = await this.hydrate(head);
      return { envelopes: [hydrated], frame: true };
    }

    const envelopes: LiveEnvelope[] = [];
    let bytes = 2;
    for (const entry of this.entries) {
      if (isFrameEnvelope(entry)) break;
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
    this.detached.delete(entry.payload.id);
    this.frameStore.delete(this.sessionId, entry.payload.id).catch(this.onStoreError);
    return dropped;
  }

  /** Tombstones the oldest frame still carrying bytes. Returns false when none is left. */
  evictOldestFrame(): boolean {
    const oldest = this.entries.find((entry) => isFrameEnvelope(entry) && !entry.payload.dropped);
    if (!oldest) return false;
    return this.dropFrame(oldest.seq, "quota") !== null;
  }

  /** The `sessionStorage` form: every frame without its bytes. */
  toPersisted(): PersistedQueueEntry[] {
    return this.entries.map((entry) => (isFrameEnvelope(entry) ? stripFrame(entry) : entry));
  }

  async clearStore(): Promise<void> {
    try {
      await this.frameStore.clear(this.sessionId);
    } catch (error) {
      this.onStoreError(error);
    }
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

export type PersistOutcome = "stored" | "stored_after_eviction" | "stored_without_queue" | "failed";

/**
 * Writes `build(queue)` under `key`, evicting the oldest queued frames on a
 * quota error and finally persisting without the queue, never throwing.
 */
export function persistWithQuotaGuard(
  storage: Pick<Storage, "setItem">,
  key: string,
  queue: UnsentQueue | null,
  build: (queueEntries: PersistedQueueEntry[] | null) => string
): PersistOutcome {
  let evicted = false;
  for (;;) {
    try {
      storage.setItem(key, build(queue ? queue.toPersisted() : []));
      return evicted ? "stored_after_eviction" : "stored";
    } catch (error) {
      if (!isQuotaExceededError(error)) return "failed";
      if (queue && queue.evictOldestFrame()) {
        evicted = true;
        continue;
      }
      break;
    }
  }
  try {
    storage.setItem(key, build(null));
    return "stored_without_queue";
  } catch {
    return "failed";
  }
}

import type { RecordingSegmentMeta, SegmentStore } from "./segmentStore";

/**
 * The `SegmentStore` implementations (KTD15): IndexedDB in the browser, memory
 * where it is unavailable. Kept apart from the contract in `segmentStore.ts`
 * so only the live chunk carries them; classic recording never opens a store.
 */

const DB_NAME = "riffrec-recording-segments";
const DB_VERSION = 1;
const SEGMENTS_STORE = "segments";
const CHUNKS_STORE = "chunks";

function segmentKey(sessionId: string, segment: number): string {
  return `${sessionId}/${String(segment).padStart(4, "0")}`;
}

function chunkKey(sessionId: string, segment: number, index: number): string {
  return `${segmentKey(sessionId, segment)}/${String(index).padStart(8, "0")}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEGMENTS_STORE)) db.createObjectStore(SEGMENTS_STORE);
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) db.createObjectStore(CHUNKS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open riffrec recording segment store."));
  });
}

function isSegmentMeta(value: unknown): value is RecordingSegmentMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecordingSegmentMeta).segment === "number" &&
    typeof (value as RecordingSegmentMeta).mimeType === "string"
  );
}

export class IndexedDbSegmentStore implements SegmentStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) this.db = openDb();
    return this.db;
  }

  async openSegment(sessionId: string, mimeType: string): Promise<number> {
    const existing = await this.listSegments(sessionId);
    const segment = existing.reduce((max, meta) => Math.max(max, meta.segment), 0) + 1;
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, "readwrite");
    const meta: RecordingSegmentMeta = { sessionId, segment, mimeType, closed: false, chunkCount: 0 };
    transaction.objectStore(SEGMENTS_STORE).put(meta, segmentKey(sessionId, segment));
    await transactionDone(transaction);
    return segment;
  }

  async appendChunk(sessionId: string, segment: number, index: number, chunk: Blob): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([CHUNKS_STORE, SEGMENTS_STORE], "readwrite");
    transaction.objectStore(CHUNKS_STORE).put(chunk, chunkKey(sessionId, segment, index));
    const segments = transaction.objectStore(SEGMENTS_STORE);
    const key = segmentKey(sessionId, segment);
    const current = await requestToPromise(segments.get(key));
    if (isSegmentMeta(current)) {
      segments.put({ ...current, chunkCount: Math.max(current.chunkCount, index + 1) }, key);
    }
    await transactionDone(transaction);
  }

  async closeSegment(sessionId: string, segment: number): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, "readwrite");
    const segments = transaction.objectStore(SEGMENTS_STORE);
    const key = segmentKey(sessionId, segment);
    const current = await requestToPromise(segments.get(key));
    if (isSegmentMeta(current)) segments.put({ ...current, closed: true }, key);
    await transactionDone(transaction);
  }

  async listSegments(sessionId: string): Promise<RecordingSegmentMeta[]> {
    const db = await this.open();
    const store = db.transaction(SEGMENTS_STORE, "readonly").objectStore(SEGMENTS_STORE);
    const values = await requestToPromise(store.getAll(sessionRange(sessionId)));
    return values.filter(isSegmentMeta).sort((a, b) => a.segment - b.segment);
  }

  async readSegment(sessionId: string, segment: number): Promise<Blob | null> {
    const db = await this.open();
    const chunks = db.transaction(CHUNKS_STORE, "readonly").objectStore(CHUNKS_STORE);
    const prefix = `${segmentKey(sessionId, segment)}/`;
    const values = await requestToPromise(chunks.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
    const blobs = values.filter((value): value is Blob => value instanceof Blob && value.size > 0);
    if (blobs.length === 0) return null;
    const metas = await this.listSegments(sessionId);
    const mimeType = metas.find((meta) => meta.segment === segment)?.mimeType ?? blobs[0].type;
    return new Blob(blobs, { type: mimeType });
  }

  async clear(sessionId: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction([CHUNKS_STORE, SEGMENTS_STORE], "readwrite");
    transaction.objectStore(CHUNKS_STORE).delete(sessionRange(sessionId));
    transaction.objectStore(SEGMENTS_STORE).delete(sessionRange(sessionId));
    await transactionDone(transaction);
  }
}

function sessionRange(sessionId: string): IDBKeyRange {
  const prefix = `${sessionId}/`;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

export class MemorySegmentStore implements SegmentStore {
  readonly segments = new Map<string, RecordingSegmentMeta>();
  readonly chunks = new Map<string, Blob>();

  async openSegment(sessionId: string, mimeType: string): Promise<number> {
    const existing = await this.listSegments(sessionId);
    const segment = existing.reduce((max, meta) => Math.max(max, meta.segment), 0) + 1;
    this.segments.set(segmentKey(sessionId, segment), { sessionId, segment, mimeType, closed: false, chunkCount: 0 });
    return segment;
  }

  async appendChunk(sessionId: string, segment: number, index: number, chunk: Blob): Promise<void> {
    this.chunks.set(chunkKey(sessionId, segment, index), chunk);
    const key = segmentKey(sessionId, segment);
    const meta = this.segments.get(key);
    if (meta) meta.chunkCount = Math.max(meta.chunkCount, index + 1);
  }

  async closeSegment(sessionId: string, segment: number): Promise<void> {
    const meta = this.segments.get(segmentKey(sessionId, segment));
    if (meta) meta.closed = true;
  }

  async listSegments(sessionId: string): Promise<RecordingSegmentMeta[]> {
    return [...this.segments.values()]
      .filter((meta) => meta.sessionId === sessionId)
      .map((meta) => ({ ...meta }))
      .sort((a, b) => a.segment - b.segment);
  }

  async readSegment(sessionId: string, segment: number): Promise<Blob | null> {
    const prefix = `${segmentKey(sessionId, segment)}/`;
    const blobs = [...this.chunks.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, blob]) => blob)
      .filter((blob) => blob.size > 0);
    if (blobs.length === 0) return null;
    const mimeType = this.segments.get(segmentKey(sessionId, segment))?.mimeType ?? blobs[0].type;
    return new Blob(blobs, { type: mimeType });
  }

  async clear(sessionId: string): Promise<void> {
    const prefix = `${sessionId}/`;
    for (const key of [...this.chunks.keys()]) if (key.startsWith(prefix)) this.chunks.delete(key);
    for (const key of [...this.segments.keys()]) if (key.startsWith(prefix)) this.segments.delete(key);
  }
}

export function createDefaultSegmentStore(): SegmentStore {
  return typeof indexedDB !== "undefined" ? new IndexedDbSegmentStore() : new MemorySegmentStore();
}

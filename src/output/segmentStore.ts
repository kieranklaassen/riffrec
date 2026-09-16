/**
 * Persisted recording segments (R17, KTD15). `ScreenCapture` writes each
 * `MediaRecorder` timeslice chunk to this store keyed by session and segment
 * as it is produced, so a full page reload loses at most one chunk. A new
 * segment opens after every re-share; `pagehide` closes the current one. The
 * archive names the first segment `recording.webm` and later ones
 * `recording-002.webm`, `recording-003.webm`, ...
 *
 * The store implementations live in `segmentStores.ts` (IndexedDB, following
 * the `src/output/filesystem.ts` pattern, and a memory fallback); this module
 * holds the contract, the file naming, and the archive assembly.
 */

export interface RecordingSegmentMeta {
  sessionId: string;
  /** 1-based segment number. */
  segment: number;
  mimeType: string;
  closed: boolean;
  chunkCount: number;
}

export interface SegmentStore {
  /** Opens the next segment for the session and returns its number. */
  openSegment(sessionId: string, mimeType: string): Promise<number>;
  appendChunk(sessionId: string, segment: number, index: number, chunk: Blob): Promise<void>;
  closeSegment(sessionId: string, segment: number): Promise<void>;
  listSegments(sessionId: string): Promise<RecordingSegmentMeta[]>;
  /** The segment's chunks joined in order; null when it has none. */
  readSegment(sessionId: string, segment: number): Promise<Blob | null>;
  clear(sessionId: string): Promise<void>;
}

export const RECORDING_FILE_NAME = "recording.webm";
export const RECORDING_FILE_PATTERN = /^recording(-\d{3})?\.webm$/;

export function isRecordingFileName(name: string): boolean {
  return RECORDING_FILE_PATTERN.test(name);
}

/** KTD15 naming: 1 -> `recording.webm`, 2 -> `recording-002.webm`. */
export function segmentFileName(segment: number): string {
  if (segment <= 1) return RECORDING_FILE_NAME;
  return `recording-${String(segment).padStart(3, "0")}.webm`;
}

/** Every segment with bytes, in order, named per KTD15; `replacements` stand in for segments the caller holds itself. */
export async function assembleRecordingSegments(
  store: SegmentStore,
  sessionId: string,
  replacements: ReadonlyMap<number, Blob> = new Map()
): Promise<Blob[]> {
  const segments = await store.listSegments(sessionId);
  const blobs: Blob[] = [];
  for (const meta of segments.sort((a, b) => a.segment - b.segment)) {
    const blob = replacements.get(meta.segment) ?? (await store.readSegment(sessionId, meta.segment));
    if (blob && blob.size > 0) blobs.push(blob);
  }
  return blobs;
}

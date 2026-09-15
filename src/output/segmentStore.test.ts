import { describe, expect, it } from "vitest";
import {
  MemorySegmentStore,
  RECORDING_FILE_PATTERN,
  assembleRecordingSegments,
  createDefaultSegmentStore,
  isRecordingFileName,
  segmentFileName
} from "./segmentStore";

async function text(blob: Blob | null): Promise<string | null> {
  return blob ? blob.text() : null;
}

describe("segment naming (KTD15)", () => {
  it("names the first segment recording.webm and later ones recording-NNN.webm", () => {
    expect(segmentFileName(1)).toBe("recording.webm");
    expect(segmentFileName(2)).toBe("recording-002.webm");
    expect(segmentFileName(12)).toBe("recording-012.webm");
  });

  it("recognises the whole recording family and nothing else", () => {
    expect(isRecordingFileName("recording.webm")).toBe(true);
    expect(isRecordingFileName("recording-002.webm")).toBe(true);
    expect(isRecordingFileName("voice.webm")).toBe(false);
    expect(isRecordingFileName("recording-2.webm")).toBe(false);
    expect(isRecordingFileName("frames/recording.webm")).toBe(false);
    expect(RECORDING_FILE_PATTERN.test("recording-0002.webm")).toBe(false);
  });
});

describe("MemorySegmentStore", () => {
  it("numbers segments per session, persists chunks in order, and reads them back joined", async () => {
    const store = new MemorySegmentStore();

    expect(await store.openSegment("s1", "video/webm")).toBe(1);
    await store.appendChunk("s1", 1, 0, new Blob(["a"]));
    await store.appendChunk("s1", 1, 1, new Blob(["b"]));
    await store.closeSegment("s1", 1);
    expect(await store.openSegment("s1", "video/webm")).toBe(2);
    await store.appendChunk("s1", 2, 0, new Blob(["c"]));
    expect(await store.openSegment("other", "video/webm")).toBe(1);

    expect(await store.listSegments("s1")).toEqual([
      { sessionId: "s1", segment: 1, mimeType: "video/webm", closed: true, chunkCount: 2 },
      { sessionId: "s1", segment: 2, mimeType: "video/webm", closed: false, chunkCount: 1 }
    ]);
    expect(await text(await store.readSegment("s1", 1))).toBe("ab");
    expect((await store.readSegment("s1", 1))?.type).toBe("video/webm");
    expect(await text(await store.readSegment("s1", 2))).toBe("c");
    expect(await store.readSegment("s1", 3)).toBeNull();
  });

  it("orders chunks by index even when appended out of order and skips empty ones", async () => {
    const store = new MemorySegmentStore();
    await store.openSegment("s1", "video/webm");
    await store.appendChunk("s1", 1, 2, new Blob(["c"]));
    await store.appendChunk("s1", 1, 0, new Blob(["a"]));
    await store.appendChunk("s1", 1, 1, new Blob([]));

    expect(await text(await store.readSegment("s1", 1))).toBe("ac");
  });

  it("assembles every non-empty segment in order and clears one session only", async () => {
    const store = new MemorySegmentStore();
    await store.openSegment("s1", "video/webm");
    await store.appendChunk("s1", 1, 0, new Blob(["first"]));
    await store.openSegment("s1", "video/webm");
    await store.openSegment("s1", "video/webm");
    await store.appendChunk("s1", 3, 0, new Blob(["third"]));
    await store.openSegment("s2", "video/webm");
    await store.appendChunk("s2", 1, 0, new Blob(["other"]));

    const segments = await assembleRecordingSegments(store, "s1");
    expect(await Promise.all(segments.map((segment) => segment.text()))).toEqual(["first", "third"]);

    await store.clear("s1");
    expect(await store.listSegments("s1")).toEqual([]);
    expect(await store.readSegment("s1", 1)).toBeNull();
    expect(await text(await store.readSegment("s2", 1))).toBe("other");
  });

  it("is the default store where IndexedDB is unavailable", () => {
    expect(createDefaultSegmentStore()).toBeInstanceOf(MemorySegmentStore);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySegmentStore, type SegmentStore } from "../output/segmentStore";
import {
  DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO,
  RECORDING_TIMESLICE_MS,
  ScreenCapture,
  type ScreenCaptureOptions,
} from "./screen";

describe("ScreenCapture", () => {
  let getDisplayMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDisplayMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [],
    });

    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    vi.stubGlobal(
      "MediaRecorder",
      class {
        state = "recording" as const;
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        constructor(_stream: MediaStream, _opts?: { mimeType?: string }) {}
        start(_timeslice?: number): void {}
        stop(): void {}
        static isTypeSupported = (): boolean => true;
      }
    );
  });

  it("uses top-level display media defaults for current-tab sharing", async () => {
    const capture = new ScreenCapture();
    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      ...DEFAULT_DISPLAY_MEDIA_OPTIONS,
      video: DEFAULT_DISPLAY_MEDIA_VIDEO,
    });
  });

  it("merges displayMedia and displayMediaVideo overrides for getDisplayMedia", async () => {
    const capture = new ScreenCapture(
      { monitorTypeSurfaces: "include", video: { frameRate: 10 } },
      { frameRate: 12 }
    );
    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      ...DEFAULT_DISPLAY_MEDIA_OPTIONS,
      monitorTypeSurfaces: "include",
      video: { ...DEFAULT_DISPLAY_MEDIA_VIDEO, frameRate: 10 },
    });
  });
});

/** A `MediaRecorder` that emits one chunk per timeslice tick and flushes on `requestData`/`stop`. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  timeslice = 0;
  ticks = 0;
  readonly mimeType: string;

  constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "video/webm";
    FakeRecorder.instances.push(this);
  }

  static isTypeSupported = (): boolean => true;

  start(timeslice?: number): void {
    this.state = "recording";
    this.timeslice = timeslice ?? 0;
  }

  /** One timeslice elapsed. */
  tick(label = `chunk${this.ticks}`): void {
    this.ticks += 1;
    this.ondataavailable?.({ data: new Blob([label], { type: this.mimeType }) });
  }

  requestData(): void {
    this.tick("flushed");
  }

  stop(): void {
    this.state = "inactive";
    this.tick("tail");
    this.onstop?.(new Event("stop"));
  }
}

class FakeTrack extends EventTarget {
  readyState: "live" | "ended" = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
  });

  end(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

function fakeStream(track = new FakeTrack()) {
  return {
    track,
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
  };
}

describe("ScreenCapture segmented recording (KTD15)", () => {
  let getDisplayMedia: ReturnType<typeof vi.fn>;
  let pageHideTarget: EventTarget;

  beforeEach(() => {
    FakeRecorder.instances = [];
    pageHideTarget = new EventTarget();
    getDisplayMedia = vi.fn().mockImplementation(async () => fakeStream().stream);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    vi.stubGlobal("MediaRecorder", FakeRecorder);
  });

  function capture(store: SegmentStore, options: Partial<ScreenCaptureOptions> = {}) {
    return new ScreenCapture({}, {}, { segmentStore: store, sessionId: "sess_1", pageHideTarget, ...options });
  }

  it("covers AE7: chunks persist every second; a reload closes the segment and the next share starts recording-002", async () => {
    const store = new MemorySegmentStore();
    const closed: Array<[number | null, string]> = [];
    const first = capture(store, { onSegmentClosed: (segment, reason) => closed.push([segment, reason]) });

    expect(await first.tryStart()).toBe("recording");
    expect(first.currentSegment).toBe(1);
    expect(first.displayStream).not.toBeNull();
    const recorder = FakeRecorder.instances[0];
    expect(recorder.timeslice).toBe(RECORDING_TIMESLICE_MS);
    recorder.tick("one");
    recorder.tick("two");
    expect((await store.listSegments("sess_1"))[0].chunkCount).toBe(2);

    pageHideTarget.dispatchEvent(new Event("pagehide"));
    await first.collectSegments();
    expect(closed).toEqual([[1, "pagehide"]]);
    expect((await store.listSegments("sess_1"))[0]).toMatchObject({ segment: 1, closed: true, chunkCount: 3 });

    const reloaded = capture(store);
    expect(await reloaded.hasPersistedSegments()).toBe(true);
    expect(await reloaded.collectSegments()).toHaveLength(1);
    expect(reloaded.isRecording()).toBe(false);

    expect(await reloaded.tryStart()).toBe("recording");
    expect(reloaded.currentSegment).toBe(2);
    FakeRecorder.instances[1].tick("after");
    const blob = await reloaded.stop();
    expect(await blob?.text()).toBe("aftertail");

    const segments = await reloaded.collectSegments();
    expect(await Promise.all(segments.map((segment) => segment.text()))).toEqual(["onetwoflushed", "aftertail"]);
    expect((await store.listSegments("sess_1")).map((meta) => meta.closed)).toEqual([true, true]);
  });

  it("treats a declined share as an outcome and reports an unsupported browser", async () => {
    const declined = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    getDisplayMedia.mockRejectedValueOnce(declined);
    const store = new MemorySegmentStore();
    const onError = vi.fn();
    const screen = capture(store, { onError });

    expect(await screen.tryStart()).toBe("declined");
    expect(onError).not.toHaveBeenCalled();
    expect(await store.listSegments("sess_1")).toEqual([]);
    expect(screen.displayStream).toBeNull();

    getDisplayMedia.mockRejectedValueOnce(new Error("device busy"));
    expect(await screen.tryStart()).toBe("unavailable");
    expect(onError).toHaveBeenCalledOnce();

    vi.stubGlobal("navigator", {});
    expect(await capture(store).tryStart()).toBe("unavailable");
  });

  it("closes the segment and signals a needed re-share when the display track ends", async () => {
    const { stream, track } = fakeStream();
    getDisplayMedia.mockResolvedValueOnce(stream);
    const store = new MemorySegmentStore();
    const onStreamEnded = vi.fn();
    const closed: string[] = [];
    const screen = capture(store, { onStreamEnded, onSegmentClosed: (_segment, reason) => closed.push(reason) });
    await screen.tryStart();
    FakeRecorder.instances[0].tick("live");

    track.end();
    await vi.waitFor(() => expect(screen.isRecording()).toBe(false));

    expect(onStreamEnded).toHaveBeenCalledOnce();
    expect(closed).toEqual(["track_ended"]);
    expect(screen.displayStream).toBeNull();
    const segments = await screen.collectSegments();
    expect(await segments[0].text()).toBe("livetail");
    expect(await screen.stop()).toBeNull();
  });

  it("without a segment store, stop returns the recording and collectSegments lists it", async () => {
    const screen = new ScreenCapture({}, {}, { pageHideTarget });
    await screen.start();
    expect(screen.isSegmented).toBe(false);
    expect(screen.currentSegment).toBeNull();
    FakeRecorder.instances[0].tick("classic");

    const blob = await screen.stop();
    expect(await blob?.text()).toBe("classictail");
    expect(await screen.collectSegments()).toEqual([blob]);
  });

  it("reports store failures without interrupting the recording", async () => {
    const store = new MemorySegmentStore();
    const append = store.appendChunk.bind(store);
    store.appendChunk = vi.fn((sessionId: string, segment: number, index: number, chunk: Blob) => {
      if (index > 0) return Promise.reject(new Error("idb closed"));
      return append(sessionId, segment, index, chunk);
    });
    const onError = vi.fn();
    const screen = capture(store, { onError });
    await screen.tryStart();
    FakeRecorder.instances[0].tick("x");

    expect(screen.isRecording()).toBe(true);
    expect(await (await screen.stop())?.text()).toBe("xtail");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));

    const segments = await screen.collectSegments();
    expect(await Promise.all(segments.map((segment) => segment.text()))).toEqual(["xtail"]);
  });
});

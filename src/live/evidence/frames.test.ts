// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveFrame } from "../contract";
import { FRAME_BUFFER_CAPACITY, FrameBuffer, PERIODIC_FRAME_MS, createDisplayFrameGrabber, dataUrlToBase64 } from "./frames";

function harness(overrides: Partial<ConstructorParameters<typeof FrameBuffer>[0]> = {}) {
  let clock = 1000;
  let ids = 0;
  const frames: LiveFrame[] = [];
  let grabs = 0;
  const grabber = vi.fn(async () => {
    grabs += 1;
    return `jpeg-${grabs}`;
  });
  const buffer = new FrameBuffer({
    now: () => clock,
    route: () => "/settings",
    createId: () => `frame_${String(++ids).padStart(4, "0")}`,
    grabber,
    onFrame: (frame) => frames.push(frame),
    ...overrides
  });
  return {
    buffer,
    frames,
    grabber,
    advance(ms: number) {
      clock += ms;
    },
    get clock() {
      return clock;
    }
  };
}

describe("FrameBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers a gesture frame stamped with the gesture time, route, and a fresh id", async () => {
    const h = harness();

    const frame = await h.buffer.capture("gesture", 640);

    expect(frame).toEqual({ id: "frame_0001", t: 640, route: "/settings", kind: "gesture", jpeg_base64: "jpeg-1" });
    expect(h.frames).toEqual([frame]);
    expect(h.buffer.latest()).toEqual(frame);
  });

  it("yields nothing without a display source, and units then have no frame to take", async () => {
    const h = harness({ grabber: null });

    expect(h.buffer.hasSource).toBe(false);
    expect(await h.buffer.capture("gesture")).toBeNull();
    expect(h.buffer.nearest(0)).toBeNull();
    expect(h.frames).toEqual([]);
  });

  it("picks the buffered frame nearest a unit's first anchor, not the latest", async () => {
    const h = harness();
    await h.buffer.capture("gesture", 500);
    await h.buffer.capture("periodic", 3000);
    await h.buffer.capture("gesture", 6100);

    expect(h.buffer.nearest(520)?.id).toBe("frame_0001");
    expect(h.buffer.nearest(2900)?.id).toBe("frame_0002");
    expect(h.buffer.nearest(9000)?.id).toBe("frame_0003");
  });

  it("keeps only the last 12 frames", async () => {
    const h = harness();
    for (let i = 0; i < FRAME_BUFFER_CAPACITY + 3; i += 1) await h.buffer.capture("gesture", i * 10);

    const all = h.buffer.all();
    expect(all).toHaveLength(FRAME_BUFFER_CAPACITY);
    expect(all[0].id).toBe("frame_0004");
    expect(h.buffer.nearest(0)?.id).toBe("frame_0004");
    expect(h.frames).toHaveLength(FRAME_BUFFER_CAPACITY + 3);
  });

  it("captures on the periodic timer every 10 s until stopped or the source is lost", async () => {
    const h = harness();
    h.buffer.startPeriodic();
    expect(h.buffer.isPeriodicRunning).toBe(true);

    await vi.advanceTimersByTimeAsync(PERIODIC_FRAME_MS);
    await vi.advanceTimersByTimeAsync(PERIODIC_FRAME_MS);
    expect(h.frames.map((frame) => frame.kind)).toEqual(["periodic", "periodic"]);

    h.buffer.setGrabber(null);
    expect(h.buffer.isPeriodicRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(PERIODIC_FRAME_MS * 2);
    expect(h.frames).toHaveLength(2);

    h.buffer.startPeriodic();
    expect(h.buffer.isPeriodicRunning).toBe(false);
  });

  it("pause stops new frames and resume restores them", async () => {
    const h = harness();
    h.buffer.startPeriodic();
    h.buffer.pause();

    expect(await h.buffer.capture("gesture")).toBeNull();
    await vi.advanceTimersByTimeAsync(PERIODIC_FRAME_MS);
    expect(h.frames).toEqual([]);
    expect(h.grabber).not.toHaveBeenCalled();

    h.buffer.resume();
    expect(await h.buffer.capture("gesture")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(PERIODIC_FRAME_MS);
    expect(h.frames.map((frame) => frame.kind)).toEqual(["gesture", "periodic"]);
  });

  it("reports a failing grabber and keeps going", async () => {
    const onError = vi.fn();
    const h = harness({ grabber: vi.fn().mockRejectedValue(new Error("boom")), onError });

    expect(await h.buffer.capture("gesture")).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(h.buffer.pendingCaptures).toBe(0);
  });

  it("drops frames that resolve after dispose", async () => {
    let resolve: (value: string) => void = () => {};
    const h = harness({ grabber: () => new Promise<string>((r) => (resolve = r)) });
    const pending = h.buffer.capture("gesture");
    h.buffer.dispose();
    resolve("late");

    expect(await pending).toBeNull();
    expect(h.frames).toEqual([]);
  });
});

describe("display grabber", () => {
  it("strips the data-url prefix from JPEG output only", () => {
    expect(dataUrlToBase64("data:image/jpeg;base64,AAAA")).toBe("AAAA");
    expect(dataUrlToBase64("data:image/png;base64,AAAA")).toBeNull();
    expect(dataUrlToBase64("data:image/jpeg;base64,")).toBeNull();
  });

  it("resolves null while the video has no decoded frame or the track has ended", async () => {
    const track = { readyState: "live" } as MediaStreamTrack;
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const grab = createDisplayFrameGrabber(stream);

    expect(await grab()).toBeNull();
    (track as { readyState: string }).readyState = "ended";
    expect(await grab()).toBeNull();
    play.mockRestore();
  });
});

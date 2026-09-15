import { describe, expect, it, vi } from "vitest";
import { AudioClipRecorder, clipFileName, type AudioClip, type ClipRecorderLike } from "./audioClip";

class FakeRecorder implements ClipRecorderLike {
  state: ClipRecorderLike["state"] = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ClipRecorderLike["ondataavailable"] = null;
  onstop: ClipRecorderLike["onstop"] = null;
  onerror: ClipRecorderLike["onerror"] = null;
  started = 0;

  start(): void {
    this.state = "recording";
    this.started += 1;
  }

  /** Flushes a chunk and fires `stop` like `MediaRecorder` does after `stop()`. */
  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["pcm"], { type: this.mimeType }) });
    this.onstop?.(undefined);
  }
}

function harness(options: { stream?: MediaStream | null } = {}) {
  let clock = 0;
  let ids = 0;
  const recorders: FakeRecorder[] = [];
  const clips: AudioClip[] = [];
  const recorder = new AudioClipRecorder({
    now: () => clock,
    createId: () => `clip_${String(++ids).padStart(4, "0")}`,
    stream: options.stream === undefined ? ({} as MediaStream) : options.stream,
    mimeType: "audio/webm",
    createRecorder: () => {
      const fake = new FakeRecorder();
      recorders.push(fake);
      return fake;
    },
    onClip: (clip) => clips.push(clip)
  });
  return {
    recorder,
    recorders,
    clips,
    tick(ms: number) {
      clock += ms;
    }
  };
}

describe("AudioClipRecorder", () => {
  it("records one clip per utterance between speech_started and speech_stopped and attaches it to the unit", () => {
    const h = harness();

    const started = h.recorder.speechStarted();
    expect(started?.id).toBe("clip_0001");
    expect(h.recorder.isRecording).toBe(true);
    expect(h.recorders[0].started).toBe(1);

    h.tick(1800);
    const stopped = h.recorder.speechStopped();
    expect(stopped).toBe(started);
    expect(stopped?.t_start).toBe(0);
    expect(stopped?.t_end).toBe(1800);
    expect(stopped?.blob?.size).toBeGreaterThan(0);
    expect(h.clips).toEqual([stopped]);

    expect(h.recorder.pendingClipId()).toBe("clip_0001");
    expect(h.recorder.claim("unit_0001")).toBe("clip_0001");
    expect(stopped?.unit_id).toBe("unit_0001");
    expect(h.recorder.pendingClipId()).toBeNull();
    expect(h.recorder.claim("unit_0002")).toBeNull();
  });

  it("the clip id is known before the bytes arrive, so record_unit can reference it", () => {
    const h = harness();
    h.recorder.speechStarted();
    h.recorders[0].stop = function (this: FakeRecorder) {
      this.state = "inactive";
    };

    const clip = h.recorder.speechStopped();
    expect(clip?.blob).toBeNull();
    expect(h.recorder.claim("unit_0001")).toBe("clip_0001");

    h.recorders[0].ondataavailable?.({ data: new Blob(["late"]) });
    h.recorders[0].onstop?.(undefined);
    expect(clip?.blob?.size).toBe(4);
    expect(h.clips.map((entry) => entry.id)).toEqual(["clip_0001"]);
  });

  it("does nothing without a microphone stream and resumes when one is set", () => {
    const h = harness({ stream: null });

    expect(h.recorder.hasSource).toBe(false);
    expect(h.recorder.speechStarted()).toBeNull();
    expect(h.recorder.speechStopped()).toBeNull();
    expect(h.recorder.pendingClipId()).toBeNull();

    h.recorder.setStream({} as MediaStream);
    expect(h.recorder.speechStarted()?.id).toBe("clip_0001");
  });

  it("a new utterance before the last one stopped closes the previous clip", () => {
    const h = harness();
    h.recorder.speechStarted();
    h.tick(500);
    h.recorder.speechStarted();

    expect(h.recorders).toHaveLength(2);
    expect(h.recorders[0].state).toBe("inactive");
    expect(h.recorder.all().map((clip) => clip.t_end)).toEqual([500, null]);
  });

  it("lists archive files for clips with bytes, named by id and container", () => {
    const h = harness();
    h.recorder.speechStarted();
    h.recorder.speechStopped();
    h.recorder.speechStarted();

    expect(Object.keys(h.recorder.archiveFiles())).toEqual(["clip_0001.webm"]);
    expect(clipFileName({ id: "clip_9", mimeType: "audio/ogg;codecs=opus" })).toBe("clip_9.ogg");
  });

  it("reports recorder errors and still settles the clip", () => {
    const onError = vi.fn();
    const recorder = new AudioClipRecorder({
      now: () => 0,
      createId: () => "clip_e",
      stream: {} as MediaStream,
      mimeType: "audio/webm",
      createRecorder: () => {
        throw new Error("no MediaRecorder");
      },
      onError
    });

    expect(recorder.speechStarted()).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect(recorder.isRecording).toBe(false);
  });
});

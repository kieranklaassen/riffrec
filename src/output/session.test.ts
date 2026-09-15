// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveAnnotation, LiveTranscript, LiveUnit } from "../live/contract";
import type { CaptureOutputs } from "../types";
import { createSessionDirName, SessionWriter } from "./session";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSessionDirName", () => {
  it("uses the documented riffrec date-time prefix", () => {
    const name = createSessionDirName(new Date("2026-04-22T08:45:00"));

    expect(name).toMatch(/^riffrec-2026-04-22-0845-[a-zA-Z0-9-]{6}$/);
  });

  it("downloads a zip without prompting for a folder", async () => {
    const showDirectoryPicker = vi.fn();
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: showDirectoryPicker
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:riffrec");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const outputs: CaptureOutputs = {
      sessionId: "session-1",
      startedAt: new Date("2026-04-22T08:45:00"),
      durationSeconds: 4,
      events: [],
      screenBlob: new Blob(["screen"], { type: "video/webm" }),
      voiceBlob: null
    };

    const result = await new SessionWriter({ reactVersion: "19.0.0" }).stop(outputs);

    expect(showDirectoryPicker).not.toHaveBeenCalled();
    expect(result.method).toBe("zip");
    expect(result.sessionId).toBe("session-1");
    expect(result.filename).toBe(result.sessionPath);
    expect(result.archive).toBeInstanceOf(Blob);
    expect(result.archive.type).toBe("application/zip");
    expect(result.sessionPath).toMatch(/^riffrec-\d{4}-\d{2}-\d{2}-\d{4}-.+\.zip$/);
    expect(result.filesPresent).toEqual(["session.json", "events.json", "recording.webm"]);
  });

  it("returns the archive without downloading when the host manages output", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:riffrec");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const outputs: CaptureOutputs = {
      sessionId: "session-upload",
      startedAt: new Date("2026-04-22T08:45:00"),
      durationSeconds: 4,
      events: [],
      screenBlob: new Blob(["screen"], { type: "video/webm" }),
      voiceBlob: null
    };

    const result = await new SessionWriter({ reactVersion: "19.0.0" }).stop(outputs, {
      download: false
    });

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(result.sessionId).toBe("session-upload");
    expect(result.filename).toMatch(/^riffrec-.+\.zip$/);
    expect(result.archive.size).toBeGreaterThan(0);
  });
});

describe("SessionWriter live archive additions", () => {
  const outputs: CaptureOutputs = {
    sessionId: "session-live",
    startedAt: new Date("2026-04-22T08:45:00"),
    durationSeconds: 4,
    events: [],
    screenBlob: new Blob(["screen"], { type: "video/webm" }),
    voiceBlob: new Blob(["voice"], { type: "audio/webm" })
  };

  const unit: LiveUnit = {
    id: "unit_0001",
    statement: "Make it red",
    transcript_excerpt: "make it red",
    anchors: [],
    evidence: { frame_ids: [], annotation_ids: ["ann_0001"], transcript_span: { t_start: 0, t_end: 1 } },
    status: "accepted",
    confirmed: { element: true, change: true }
  };

  const annotation: LiveAnnotation = {
    id: "ann_0001",
    kind: "stroke",
    points: [{ x: 0, y: 0 }],
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    anchor: { route: "/", selector: "div", rect: { x: 0, y: 0, width: 1, height: 1 }, t: 0 },
    unit_id: "unit_0001"
  };

  const transcript: LiveTranscript[] = [
    { id: "tr_0001", role: "riffer", text: "make it red", t_start: 0, t_end: 900, final: true }
  ];

  async function readEntries(archive: Blob): Promise<Record<string, string>> {
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    return Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, strFromU8(bytes)]));
  }

  it("covers AE5: a no-endpoint session adds annotations.json and no transcript.json", async () => {
    const result = await new SessionWriter().stop(outputs, {
      download: false,
      live: { transcript: null, units: null, annotations: [annotation] }
    });

    expect(result.filesPresent).toEqual([
      "session.json",
      "events.json",
      "recording.webm",
      "voice.webm",
      "annotations.json"
    ]);
    const entries = await readEntries(result.archive);
    expect(Object.keys(entries).sort()).toEqual(result.filesPresent.slice().sort());
    expect(JSON.parse(entries["annotations.json"])).toEqual([annotation]);
    expect(JSON.parse(entries["session.json"]).files_present).toEqual(result.filesPresent);
    expect(JSON.parse(entries["events.json"])).toMatchObject({ version: "1", session_id: "session-live", events: [] });
  });

  it("a lost-endpoint session adds transcript.json and units.json with confirmations", async () => {
    const result = await new SessionWriter().stop(outputs, {
      download: false,
      live: { transcript, units: [unit], annotations: [annotation] }
    });

    expect(result.filesPresent).toEqual([
      "session.json",
      "events.json",
      "recording.webm",
      "voice.webm",
      "transcript.json",
      "units.json",
      "annotations.json"
    ]);
    const entries = await readEntries(result.archive);
    expect(JSON.parse(entries["transcript.json"])).toEqual(transcript);
    expect(JSON.parse(entries["units.json"])[0].confirmed).toEqual({ element: true, change: true });
  });

  it("writes frames and clips under their directories and lists them in files_present", async () => {
    const result = await new SessionWriter().stop(outputs, {
      download: false,
      live: {
        annotations: [],
        frames: { "frame_0001.jpg": new Blob(["jpeg"], { type: "image/jpeg" }) },
        clips: { "clip_0001.webm": new Blob(["audio"], { type: "audio/webm" }) }
      }
    });

    expect(result.filesPresent).toEqual([
      "session.json",
      "events.json",
      "recording.webm",
      "voice.webm",
      "annotations.json",
      "frames/frame_0001.jpg",
      "clips/clip_0001.webm"
    ]);
    const entries = await readEntries(result.archive);
    expect(entries["frames/frame_0001.jpg"]).toBe("jpeg");
    expect(entries["clips/clip_0001.webm"]).toBe("audio");
  });

  it("leaves a classic session unchanged when no live inputs are given", async () => {
    const result = await new SessionWriter().stop(outputs, { download: false });

    expect(result.filesPresent).toEqual(["session.json", "events.json", "recording.webm", "voice.webm"]);
  });

  it("covers AE7 (KTD15): recording segments replace the single recording and are named in order", async () => {
    const result = await new SessionWriter().stop(outputs, {
      download: false,
      live: { annotations: [] },
      recordingSegments: [
        new Blob(["before reload"], { type: "video/webm" }),
        new Blob([], { type: "video/webm" }),
        new Blob(["after re-share"], { type: "video/webm" })
      ]
    });

    expect(result.filesPresent).toEqual([
      "session.json",
      "events.json",
      "recording.webm",
      "recording-002.webm",
      "voice.webm",
      "annotations.json"
    ]);
    const entries = await readEntries(result.archive);
    expect(entries["recording.webm"]).toBe("before reload");
    expect(entries["recording-002.webm"]).toBe("after re-share");
    expect(JSON.parse(entries["session.json"]).files_present).toEqual(result.filesPresent);
  });

  it("falls back to the screen blob when the segment list is empty", async () => {
    const result = await new SessionWriter().stop(outputs, { download: false, recordingSegments: [] });

    expect(result.filesPresent).toEqual(["session.json", "events.json", "recording.webm", "voice.webm"]);
  });
});

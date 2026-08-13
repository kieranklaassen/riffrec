// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(result.sessionPath).toMatch(/^riffrec-\d{4}-\d{2}-\d{2}-\d{4}-.+\.zip$/);
    expect(result.filesPresent).toEqual(["session.json", "events.json", "recording.webm"]);
    expect(result.downloaded).toBe(true);
  });

  it("skips the download when onArchive returns false", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:riffrec");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const outputs: CaptureOutputs = {
      sessionId: "session-2",
      startedAt: new Date("2026-04-22T08:45:00"),
      durationSeconds: 4,
      events: [],
      screenBlob: null,
      voiceBlob: null
    };

    const onArchive = vi.fn().mockResolvedValue(false);
    const result = await new SessionWriter({ reactVersion: "19.0.0", onArchive }).stop(outputs);

    expect(onArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-2",
        filename: expect.stringMatching(/\.zip$/),
        blob: expect.any(Blob),
        filesPresent: ["session.json", "events.json"]
      })
    );
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result.downloaded).toBe(false);
    expect(result.sessionPath).toMatch(/\.zip$/);
  });

  it("still downloads when onArchive throws, reporting via onArchiveError", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:riffrec");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const outputs: CaptureOutputs = {
      sessionId: "session-3",
      startedAt: new Date("2026-04-22T08:45:00"),
      durationSeconds: 4,
      events: [],
      screenBlob: null,
      voiceBlob: null
    };

    const onArchiveError = vi.fn();
    const result = await new SessionWriter({
      reactVersion: "19.0.0",
      onArchive: () => Promise.reject(new Error("upload down")),
      onArchiveError
    }).stop(outputs);

    expect(onArchiveError).toHaveBeenCalledWith(expect.any(Error));
    expect(click).toHaveBeenCalled();
    expect(result.downloaded).toBe(true);
  });
});

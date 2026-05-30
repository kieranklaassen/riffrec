// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISPLAY_MEDIA_OPTIONS,
  DEFAULT_DISPLAY_MEDIA_VIDEO,
  ScreenCapture,
} from "./screen";

describe("ScreenCapture", () => {
  let getDisplayMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDisplayMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
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

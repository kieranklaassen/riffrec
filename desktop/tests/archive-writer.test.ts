import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { CaptureSession } from "../src/session/capture-session";
import { writeSessionArchive } from "../src/session/archive-writer";

describe("writeSessionArchive", () => {
  it("writes staged media into a compatible root-level archive", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "riffrec-test-"));
    const recordingPath = path.join(directory, "recording.webm");
    const voicePath = path.join(directory, "voice.webm");
    const destination = path.join(directory, "session.zip");
    await writeFile(recordingPath, Buffer.from([1, 2, 3]));
    await writeFile(voicePath, Buffer.from([4, 5]));
    const capture = new CaptureSession({
      initialState: {
        url: "https://example.test",
        title: "Example",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        canRecord: true
      },
      options: { microphone: true, captureClicks: false },
      outcomes: { screen: "captured", microphone: "captured" },
      appVersion: "0.1.0",
      electronVersion: "42.3.0",
      viewport: { width: 800, height: 600, device_pixel_ratio: 1, zoom_factor: 1 }
    });
    const completed = capture.complete();

    const present = await writeSessionArchive(
      destination,
      completed,
      { directory, recordingPath, voicePath, hasRecording: true, hasVoice: true },
      "Broken submit button."
    );
    const archive = unzipSync(await readFile(destination));

    expect(present).toContain("recording.webm");
    expect(Object.keys(archive).sort()).toEqual([
      "context.json",
      "events.json",
      "notes.md",
      "recording.webm",
      "session.json",
      "voice.webm"
    ]);
    expect(Buffer.from(archive["recording.webm"])).toEqual(Buffer.from([1, 2, 3]));
    await rm(directory, { recursive: true, force: true });
  });

  it("preserves an existing destination when archive generation fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "riffrec-test-"));
    const destination = path.join(directory, "existing.zip");
    await writeFile(destination, "previous export");
    const capture = new CaptureSession({
      initialState: {
        url: "https://example.test",
        title: "Example",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        canRecord: true
      },
      options: { microphone: false, captureClicks: false },
      outcomes: { screen: "captured", microphone: "disabled" },
      appVersion: "0.1.0",
      electronVersion: "42.3.0",
      viewport: { width: 800, height: 600, device_pixel_ratio: 1, zoom_factor: 1 }
    });

    await expect(
      writeSessionArchive(
        destination,
        capture.complete(),
        {
          directory: path.join(directory, "missing-draft"),
          recordingPath: path.join(directory, "missing-draft", "recording.webm"),
          voicePath: path.join(directory, "missing-draft", "voice.webm"),
          hasRecording: true,
          hasVoice: false
        },
        ""
      )
    ).rejects.toThrow();
    expect(await readFile(destination, "utf8")).toBe("previous export");
    await rm(directory, { recursive: true, force: true });
  });
});

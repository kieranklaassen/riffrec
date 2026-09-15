import { describe, expect, it } from "vitest";
import { filterZipSessionFiles, MAX_RECORDING_IN_ZIP_BYTES } from "./zip";

function sized(bytes: number): Blob {
  const blob = new Blob(["x"]);
  Object.defineProperty(blob, "size", { value: bytes });
  return blob;
}

describe("filterZipSessionFiles", () => {
  it("excludes oversized screen recordings from zip fallback", () => {
    const files = new Map<string, Blob>([
      ["session.json", new Blob(["{}"])],
      ["events.json", new Blob(["{}"])],
      ["recording.webm", sized(MAX_RECORDING_IN_ZIP_BYTES + 1)]
    ]);

    expect(Array.from(filterZipSessionFiles(files).keys())).toEqual(["session.json", "events.json"]);
  });

  it("KTD15: excludes every recording segment once their total exceeds the guard and keeps everything else", () => {
    const half = Math.ceil(MAX_RECORDING_IN_ZIP_BYTES / 2);
    const files = new Map<string, Blob>([
      ["session.json", new Blob(["{}"])],
      ["events.json", new Blob(["{}"])],
      ["recording.webm", sized(half)],
      ["recording-002.webm", sized(half)],
      ["recording-003.webm", sized(10)],
      ["voice.webm", sized(1000)],
      ["annotations.json", new Blob(["[]"])],
      ["frames/frame_0001.jpg", sized(20)]
    ]);

    expect(Array.from(filterZipSessionFiles(files).keys())).toEqual([
      "session.json",
      "events.json",
      "voice.webm",
      "annotations.json",
      "frames/frame_0001.jpg"
    ]);
  });

  it("keeps recording segments whose total fits the guard", () => {
    const files = new Map<string, Blob>([
      ["events.json", new Blob(["{}"])],
      ["recording.webm", sized(MAX_RECORDING_IN_ZIP_BYTES - 10)],
      ["recording-002.webm", sized(10)]
    ]);

    expect(Array.from(filterZipSessionFiles(files).keys())).toEqual(["events.json", "recording.webm", "recording-002.webm"]);
  });
});

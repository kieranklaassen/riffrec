import { describe, expect, it } from "vitest";
import { filterZipSessionFiles, MAX_RECORDING_IN_ZIP_BYTES } from "./zip";

describe("filterZipSessionFiles", () => {
  it("excludes oversized screen recordings from zip fallback", () => {
    const recording = new Blob(["x"]);
    Object.defineProperty(recording, "size", { value: MAX_RECORDING_IN_ZIP_BYTES + 1 });
    const files = new Map<string, Blob>([
      ["session.json", new Blob(["{}"])],
      ["events.json", new Blob(["{}"])],
      ["recording.webm", recording]
    ]);

    expect(Array.from(filterZipSessionFiles(files).keys())).toEqual(["session.json", "events.json"]);
  });
});

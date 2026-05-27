// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterZipSessionFiles, MAX_RECORDING_IN_ZIP_BYTES, ZipWriter } from "./zip";

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

describe("ZipWriter.writeSession", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let anchorClick: ReturnType<typeof vi.fn>;
  let lastAnchor: HTMLAnchorElement | null;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    anchorClick = vi.fn();
    lastAnchor = null;
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName) as HTMLAnchorElement;
      if (tagName.toLowerCase() === "a") {
        element.click = anchorClick as unknown as () => void;
        lastAnchor = element;
      }
      return element;
    });
    // createContextualFragment creates the anchor we trigger; intercept it too.
    vi.spyOn(Range.prototype, "createContextualFragment").mockImplementation(function (
      this: Range,
      html: string
    ) {
      const template = originalCreateElement("template") as HTMLTemplateElement;
      template.innerHTML = html;
      const anchor = template.content.querySelector("a") as HTMLAnchorElement | null;
      if (anchor) {
        anchor.click = anchorClick as unknown as () => void;
        lastAnchor = anchor;
      }
      return template.content;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the bundle with the .riffrec extension", async () => {
    const writer = new ZipWriter();
    const files = new Map<string, Blob>([["session.json", new Blob(["{}"])]]);

    const result = await writer.writeSession("riffrec-2026-05-26-1430-abcdef", files);

    expect(result).toBe("riffrec-2026-05-26-1430-abcdef.riffrec");
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(lastAnchor?.download).toBe("riffrec-2026-05-26-1430-abcdef.riffrec");
  });
});

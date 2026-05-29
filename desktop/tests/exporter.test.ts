import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { CaptureSession } from "../src/session/capture-session";
import { buildSessionArchive, createSessionName } from "../src/session/exporter";

function makeSession() {
  const session = new CaptureSession({
    initialState: {
      url: "https://shop.example.test/checkout?token=private",
      title: "Checkout",
      canGoBack: false,
      canGoForward: false,
      isLoading: false
    },
    options: { microphone: true, captureClicks: true },
    outcomes: { screen: "captured", microphone: "captured" },
    appVersion: "0.1.0",
    electronVersion: "42.3.0"
  });
  session.addClick({
    component: null,
    element: { tag: "button", text: "Pay", id: "pay", selector: "button#pay" }
  });
  session.beginNetwork(1, "POST", "https://shop.example.test/pay?api_key=hidden", 100);
  session.completeNetwork(1, 500, 124);
  return session.complete(new Date(session.startedAt.getTime() + 5000));
}

describe("buildSessionArchive", () => {
  it("exports compatible required files and redacted events", async () => {
    const archive = await buildSessionArchive(makeSession());
    const files = unzipSync(archive.bytes);
    const sessionJson = JSON.parse(Buffer.from(files["session.json"]).toString("utf8"));
    const eventsJson = JSON.parse(Buffer.from(files["events.json"]).toString("utf8"));

    expect(Object.keys(files).sort()).toEqual(["context.json", "events.json", "session.json"]);
    expect(sessionJson.files_present).toEqual(["session.json", "events.json", "context.json"]);
    expect(eventsJson.schema_version).toBe("1.0.0");
    expect(eventsJson.url).toContain("token=[redacted]");
    expect(eventsJson.events[1].url).toContain("api_key=[redacted]");
  });

  it("keeps recordings and notes at archive root even when recording is large", async () => {
    const recording = new Uint8Array(51 * 1024 * 1024);
    const archive = await buildSessionArchive(makeSession(), {
      recording,
      voice: new Uint8Array([1, 2, 3]),
      notes: "Button froze after payment."
    });
    const files = unzipSync(archive.bytes);

    expect(files["recording.webm"].byteLength).toBe(recording.byteLength);
    expect(files["voice.webm"].byteLength).toBe(3);
    expect(Buffer.from(files["notes.md"]).toString("utf8")).toBe("Button froze after payment.\n");
  });
});

describe("createSessionName", () => {
  it("matches the established Riffrec timestamp convention", () => {
    expect(createSessionName(new Date("2026-05-29T12:34:00"), "abcdef")).toBe(
      "riffrec-2026-05-29-1234-abcdef"
    );
  });
});

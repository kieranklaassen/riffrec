// @vitest-environment jsdom
import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiffrecContext, RiffrecProvider } from "./RiffrecProvider";
import type { RiffrecSessionOptions, SessionResult } from "./types";

const mocks = vi.hoisted(() => ({
  writerStop: vi.fn()
}));

vi.mock("./capture/screen", () => ({
  ScreenCapture: class {
    async start() {}
    async stop() { return new Blob(["screen"], { type: "video/webm" }); }
  }
}));
vi.mock("./capture/voice", () => ({
  VoiceCapture: class {
    async start() {}
    async stop() { return null; }
  }
}));
vi.mock("./capture/console", () => ({
  ConsoleCapture: class {
    start() {}
    stop() {}
  }
}));
vi.mock("./capture/events", () => ({
  EventCapture: class {
    start() {}
    stop() {}
  }
}));
vi.mock("./capture/network", () => ({
  NetworkCapture: class {
    start() {}
    stop() {}
  }
}));
vi.mock("./output/session", () => ({
  SessionWriter: class {
    stop = mocks.writerStop;
  }
}));

const result: SessionResult = {
  sessionPath: "riffrec-test.zip",
  method: "zip",
  filesPresent: ["session.json", "events.json", "recording.webm"],
  sessionId: "session-test",
  filename: "riffrec-test.zip",
  archive: new Blob(["PK\x03\x04"])
};

function Controls({ options }: { options: RiffrecSessionOptions }) {
  const context = useContext(RiffrecContext)!;
  return (
    <>
      <button type="button" onClick={() => void context.start(options)}>Start test</button>
      <output data-testid="status">{context.status}</output>
    </>
  );
}

describe("RiffrecProvider session completion", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.writerStop.mockReset().mockResolvedValue(result);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete window.__RIFFREC_PATCHED__;
  });

  it("invokes the captured callback when stopped from the provider overlay", async () => {
    const onSessionComplete = vi.fn(async () => {});
    await renderProvider({ download: false, onSessionComplete });

    await clickButton("Start test");
    await clickButton("Stop and save");

    await vi.waitFor(() => expect(onSessionComplete).toHaveBeenCalledWith(result));
    expect(mocks.writerStop).toHaveBeenCalledWith(expect.any(Object), { download: false });
    expect(container.querySelector("[data-testid='status']")?.textContent).toBe("idle");
    expect(container.textContent).not.toContain("We downloaded the zip file.");
  });

  it("routes an asynchronous callback rejection through provider error handling", async () => {
    const error = new Error("upload failed");
    const onError = vi.fn();
    await renderProvider({
      download: false,
      onSessionComplete: async () => { throw error; }
    }, onError);

    await clickButton("Start test");
    await clickButton("Stop and save");

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(container.querySelector("[data-testid='status']")?.textContent).toBe("error");
    expect(container.textContent).not.toContain("We downloaded the zip file.");
  });

  async function renderProvider(options: RiffrecSessionOptions, onError = vi.fn()) {
    await act(async () => {
      root.render(
        <RiffrecProvider forceEnable onError={onError}>
          <Controls options={options} />
        </RiffrecProvider>
      );
    });
  }

  async function clickButton(name: string) {
    const button = [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === name);
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  }
});

// @vitest-environment jsdom
import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiffrecContext, RiffrecProvider } from "./RiffrecProvider";
import type { LiveEnvelope } from "./live/contract";
import { LIVE_CURRENT_SESSION_KEY } from "./live/session";
import { createFakeEndpoint, type FakeEndpoint } from "./live/testing/fakeEndpoint";
import { FakeRealtime } from "./live/testing/fakeRealtime";
import { LIVE_BOOTSTRAP_STORAGE_KEY } from "./live/tokenBootstrap";
import type { RiffrecContextValue, RiffrecLiveConfig, RiffrecSessionOptions, SessionResult } from "./types";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  writerStop: vi.fn(),
  liveChunkLoaded: vi.fn(),
  screenTryStart: vi.fn(async () => "declined" as const),
  screenHasPersisted: vi.fn(async () => false),
  realtime: null as FakeRealtimeLike | null
}));

interface FakeRealtimeLike {
  connect(handlers: { onEvent: (event: unknown) => void | Promise<void> }): void;
  readonly connected: boolean;
  muted: boolean;
  close(): void;
}

// The live chunk: a wrapper that records evaluation so the classic tests can assert it never loads.
vi.mock("./live/LiveOverlay", async (importOriginal) => {
  mocks.liveChunkLoaded();
  return importOriginal();
});
vi.mock("./live/realtime/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./live/realtime/client")>();
  return {
    ...actual,
    createRealtimeConnector: () => ({
      connect: () => mocks.realtime!,
      dispose: () => {},
      route: null,
      client: null
    })
  };
});
vi.mock("./capture/screen", () => ({
  ScreenCapture: class {
    displayStream = null;
    async start() {}
    async tryStart() {
      return mocks.screenTryStart();
    }
    async stop() {
      return null;
    }
    async collectSegments() {
      return [new Blob(["segment"], { type: "video/webm" })];
    }
    hasPersistedSegments() {
      return mocks.screenHasPersisted();
    }
    async clearSegments() {}
  }
}));
vi.mock("./capture/voice", () => ({
  VoiceCapture: class {
    stream: MediaStream | null = null;
    async start(stream?: MediaStream) {
      this.stream = stream ?? null;
      return true;
    }
    async stop() {
      return this.stream ? new Blob(["voice"], { type: "audio/webm" }) : null;
    }
  }
}));
vi.mock("./output/session", () => ({
  SessionWriter: class {
    stop = mocks.writerStop;
  }
}));

class FakeTrack {
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  clone(): FakeTrack {
    const track = new FakeTrack();
    track.enabled = this.enabled;
    return track;
  }
  stop(): void {
    this.readyState = "ended";
  }
}

class FakeMediaStream {
  constructor(private readonly tracks: FakeTrack[] = [new FakeTrack()]) {}
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true;
  }
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  state: "inactive" | "recording" = "inactive";
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

const archive: SessionResult = {
  sessionPath: "riffrec-live.zip",
  method: "zip",
  filesPresent: ["session.json", "events.json", "annotations.json"],
  sessionId: "sess_live",
  filename: "riffrec-live.zip",
  archive: new Blob(["PK"])
};

let latest: RiffrecContextValue | null = null;

function Probe({ options }: { options: RiffrecSessionOptions }) {
  const context = useContext(RiffrecContext)!;
  latest = context;
  return (
    <>
      <button type="button" onClick={() => void context.start(options)}>
        Start test
      </button>
      <button type="button" onClick={() => void context.stop()}>
        Stop test
      </button>
      <output data-testid="status">{context.status}</output>
      <output data-testid="live-status">{context.live.status}</output>
      <output data-testid="mode">{context.live.mode}</output>
      <output data-testid="muted">{String(context.live.muted)}</output>
    </>
  );
}

describe("RiffrecProvider live mode (U7)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let endpoint: FakeEndpoint;
  let hostFetch: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;
  const onError = vi.fn();
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    latest = null;
    endpoint = createFakeEndpoint({ baseUrl: "http://127.0.0.1:4310" });
    mocks.realtime = new FakeRealtime();
    mocks.writerStop.mockReset().mockResolvedValue(archive);
    mocks.liveChunkLoaded.mockClear();
    mocks.screenTryStart.mockClear();
    mocks.screenHasPersisted.mockClear();
    onError.mockClear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/settings");

    hostFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input), window.location.href);
      if (url.origin === endpoint.baseUrl) return endpoint.fetch(input as string, init);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", hostFetch);
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    getUserMedia = vi.fn(async () => new FakeMediaStream() as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    delete window.__RIFFREC_PATCHED__;
    process.env.NODE_ENV = originalEnv;
  });

  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector);
  const text = (testId: string) => q(`[data-testid='${testId}']`)?.textContent;
  const click = async (name: string) => {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
    expect(button, `button "${name}"`).toBeTruthy();
    await act(async () => button!.click());
  };
  const clickSelector = async (selector: string) => {
    const element = q<HTMLElement>(selector);
    expect(element, selector).toBeTruthy();
    await act(async () => element!.click());
  };
  const received = (type: LiveEnvelope["type"]) => endpoint.received.filter((entry) => entry.type === type);

  async function render(live: RiffrecLiveConfig | undefined, options: RiffrecSessionOptions = {}, extra: { forceEnable?: boolean } = {}) {
    await act(async () => {
      root.render(
        <RiffrecProvider forceEnable={extra.forceEnable ?? true} live={live} onError={onError}>
          <Probe options={options} />
        </RiffrecProvider>
      );
    });
  }

  /**
   * Fragment bootstrap (KTD3), mount, start, and accept consent with the microphone.
   * The fragment would auto-start by default; these flows exercise the manual `start()` path.
   */
  async function goLive(options: RiffrecSessionOptions = {}, live: RiffrecLiveConfig = {}) {
    window.history.replaceState(null, "", `/settings#riffrec_live=${endpoint.pageToken}&endpoint=${encodeURIComponent(endpoint.baseUrl)}`);
    await render({ autoStart: false, ...live }, options);
    await vi.waitFor(() => expect(text("live-status")).toBe("idle"));
    await click("Start test");
    await vi.waitFor(() => expect(q("[data-riffrec-consent]")).toBeTruthy());
    await clickSelector("[data-riffrec-consent] input[type=checkbox]");
    await clickSelector("[data-riffrec-consent-accept]");
    await vi.waitFor(() => expect(text("live-status")).toBe("live"));
    await vi.waitFor(() => expect(mocks.realtime!.connected).toBe(true));
  }

  describe("a host without live", () => {
    it("behaves as before, never loads the live chunk, and makes no network calls", async () => {
      await render(undefined, { download: false });

      expect(text("live-status")).toBe("disabled");
      expect(text("mode")).toBe("smart");
      await click("Start test");
      await vi.waitFor(() => expect(text("status")).toBe("recording"));
      await click("Stop and save");
      await vi.waitFor(() => expect(text("status")).toBe("idle"));

      expect(mocks.writerStop).toHaveBeenCalledWith(expect.any(Object), { download: false });
      expect(mocks.liveChunkLoaded).not.toHaveBeenCalled();
      expect(hostFetch).not.toHaveBeenCalled();
      expect(q("[data-riffrec-live-overlay]")).toBeNull();
      await latest!.live.setMode("collect");
      expect(await latest!.live.send()).toBe(false);
    });
  });

  describe("production guard", () => {
    it("renders nothing for live and makes no network calls without forceEnable", async () => {
      process.env.NODE_ENV = "production";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      window.history.replaceState(null, "", `/settings#riffrec_live=${endpoint.pageToken}&endpoint=${encodeURIComponent(endpoint.baseUrl)}`);

      await render({ autoStart: true }, {}, { forceEnable: false });
      await click("Start test");
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(text("status")).toBe("disabled");
      expect(text("live-status")).toBe("disabled");
      expect(mocks.liveChunkLoaded).not.toHaveBeenCalled();
      expect(hostFetch).not.toHaveBeenCalled();
      expect(q("[data-riffrec-live-overlay]")).toBeNull();
      expect(endpoint.received).toHaveLength(0);
      warn.mockRestore();
    });
  });

  describe("a live session", () => {
    it("bootstraps from the fragment, streams with the bearer token, and mints through the endpoint", async () => {
      await goLive();

      expect(window.location.hash).toBe("");
      expect(text("status")).toBe("live");
      expect(mocks.liveChunkLoaded).toHaveBeenCalledTimes(1);
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(received("mic").map((entry) => (entry.payload as { state: string }).state)).toEqual(["granted"]);
      const mint = hostFetch.mock.calls.find(([input]) => String(input).endsWith("/mint"));
      expect(mint).toBeTruthy();
      expect(new Headers((mint![1] as RequestInit).headers).get("authorization")).toBe(`Bearer ${endpoint.pageToken}`);
      // The consent stream is shared, never re-acquired per consumer (KTD21).
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it("excludes its own traffic from network capture and strips the live fragment from captured URLs", async () => {
      await goLive();
      const before = received("network_request").length;

      await window.fetch(`${endpoint.baseUrl}/status`);
      await window.fetch("https://api.openai.com/v1/realtime/calls", { method: "POST" });
      await window.fetch("/api/orders?token=abc#riffrec_live=pt_leak&endpoint=http%3A%2F%2Fother.test");
      await vi.waitFor(() => expect(received("network_request").length).toBe(before + 1));

      const [event] = received("network_request").slice(before);
      expect(event.payload).toMatchObject({ method: "GET", url: "/api/orders?token=[redacted]" });
      expect(JSON.stringify(endpoint.received)).not.toContain("pt_leak");
    });

    it("setMode changes the mode carried on the next checkpoint and setMuted mutes every consumer", async () => {
      await goLive();
      const realtime = mocks.realtime as FakeRealtime;

      await act(async () => latest!.live.setMode("collect"));
      await vi.waitFor(() => expect(text("mode")).toBe("collect"));
      await vi.waitFor(() => expect(received("mode").map((entry) => (entry.payload as { mode: string }).mode)).toEqual(["collect"]));

      await act(async () => {
        await realtime.emit({ type: "speech_started", t: 100 });
        await realtime.emit({ type: "speech_stopped", t: 900 });
        await realtime.emit({
          type: "tool_call",
          call: { call_id: "call_1", name: "record_unit", arguments: { statement: "Make the save button red", anchors: [], transcript_excerpt: "make the save button red" } }
        });
      });
      await vi.waitFor(() => expect(received("unit")).toHaveLength(1));
      await act(async () => {
        await latest!.live.send();
      });
      await vi.waitFor(() => expect(received("checkpoint")).toHaveLength(1));
      expect(received("checkpoint")[0].payload).toMatchObject({ trigger: "send", mode: "collect" });

      await act(async () => latest!.live.setMuted(true));
      await vi.waitFor(() => expect(text("muted")).toBe("true"));
      expect(realtime.muted).toBe(true);
      await vi.waitFor(() => expect(received("mic").map((entry) => (entry.payload as { state: string }).state)).toContain("muted"));
      const mic = getUserMedia.mock.results[0]!.value as Promise<FakeMediaStream>;
      expect((await mic).getAudioTracks().every((track) => !track.enabled)).toBe(true);
    });

    it("stop() ends the session, assembles the archive with the live files, and clears storage", async () => {
      const onSessionComplete = vi.fn();
      await goLive({ download: false, onSessionComplete });

      await click("Stop test");
      await vi.waitFor(() => expect(mocks.writerStop).toHaveBeenCalledTimes(1));
      const [outputs, options] = mocks.writerStop.mock.calls[0] as [{ voiceBlob: Blob | null; events: unknown[] }, Record<string, unknown>];
      expect(outputs.voiceBlob).toBeInstanceOf(Blob);
      expect(options).toMatchObject({ download: false, recordingSegments: [expect.any(Blob)] });
      expect(options.live).toMatchObject({ annotations: [], units: [] });
      await vi.waitFor(() => expect(onSessionComplete).toHaveBeenCalledWith(archive));
      expect(text("status")).toBe("idle");
      expect(text("live-status")).toBe("ended");
      expect(sessionStorage.getItem(LIVE_CURRENT_SESSION_KEY)).toBeNull();
      expect(sessionStorage.getItem(LIVE_BOOTSTRAP_STORAGE_KEY)).toBeNull();
      expect((mocks.realtime as FakeRealtime).closed).toBe(true);
      expect(container.textContent).not.toContain("We downloaded the zip file.");
    });

    it("assembles the archive when the endpoint ends the session and shows the ended card instead of the notice", async () => {
      await goLive({ download: true });

      await act(async () => {
        await endpoint.fetch("/session/end", { method: "POST", headers: endpoint.pageHeaders(), body: "{}" });
      });
      await vi.waitFor(() => expect(mocks.writerStop).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(text("status")).toBe("idle"));
      expect(q("[data-riffrec-live-overlay='ended']")).toBeTruthy();
      expect(container.textContent).not.toContain("We downloaded the zip file.");
    });

    it("declining consent returns to idle without an archive", async () => {
      window.history.replaceState(null, "", `/settings#riffrec_live=${endpoint.pageToken}&endpoint=${encodeURIComponent(endpoint.baseUrl)}`);
      await render({});
      // The fragment auto-starts (I5): consent opens without a Start click.
      await vi.waitFor(() => expect(q("[data-riffrec-consent]")).toBeTruthy());
      expect(text("status")).toBe("live");

      await clickSelector("[data-riffrec-consent-decline]");
      await vi.waitFor(() => expect(text("status")).toBe("idle"));
      expect(mocks.writerStop).not.toHaveBeenCalled();
      expect(endpoint.received).toHaveLength(0);
    });

    it("runs without an endpoint: no interviewer, no mint, annotations in the archive (R4)", async () => {
      await render({});
      await click("Start test");
      await vi.waitFor(() => expect(q("[data-riffrec-consent]")).toBeTruthy());
      await clickSelector("[data-riffrec-consent] input[type=checkbox]");
      await clickSelector("[data-riffrec-consent-accept]");
      await vi.waitFor(() => expect(text("live-status")).toBe("live_novoice"));

      expect(hostFetch).not.toHaveBeenCalled();
      expect((mocks.realtime as FakeRealtime).connected).toBe(false);
      await click("Stop test");
      await vi.waitFor(() => expect(mocks.writerStop).toHaveBeenCalledTimes(1));
      const options = mocks.writerStop.mock.calls[0]![1] as { live: { annotations: unknown[]; transcript: unknown } };
      expect(options.live.annotations).toEqual([]);
      expect(options.live.transcript).toBeNull();
    });

    it("autoStart opens consent as soon as the live chunk is ready", async () => {
      await render({ autoStart: true });
      await vi.waitFor(() => expect(q("[data-riffrec-consent]")).toBeTruthy());
    });

    it("live={{}} auto-starts when the page carries #riffrec_live= credentials (I5, KTD3)", async () => {
      window.history.replaceState(null, "", `/settings#riffrec_live=${endpoint.pageToken}&endpoint=${encodeURIComponent(endpoint.baseUrl)}`);
      await render({});
      await vi.waitFor(() => expect(q("[data-riffrec-consent]")).toBeTruthy());
      expect(window.location.hash).not.toContain("riffrec_live");
    });

    it("live={{}} stays idle without credentials, and autoStart: false overrides the fragment", async () => {
      await render({});
      await vi.waitFor(() => expect(text("live-status")).toBe("idle"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(q("[data-riffrec-consent]")).toBeNull();

      await act(async () => root.unmount());
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      window.history.replaceState(null, "", `/settings#riffrec_live=${endpoint.pageToken}&endpoint=${encodeURIComponent(endpoint.baseUrl)}`);
      await render({ autoStart: false });
      await vi.waitFor(() => expect(text("live-status")).toBe("idle"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(q("[data-riffrec-consent]")).toBeNull();
    });
  });

  describe("unmounting mid-session (KTD16, AE13)", () => {
    it("does not call the archive writer and rehydrates on the next mount", async () => {
      await goLive();
      const sessionId = received("mic")[0].session_id;
      mocks.screenHasPersisted.mockResolvedValue(true);

      await act(async () => root.unmount());

      expect(mocks.writerStop).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(LIVE_CURRENT_SESSION_KEY)).toBe(sessionId);
      expect(window.__RIFFREC_PATCHED__).toBeUndefined();
      expect((mocks.realtime as FakeRealtime).closed).toBe(true);

      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      mocks.realtime = new FakeRealtime();
      await render({});

      await vi.waitFor(() => expect(text("status")).toBe("live"));
      await vi.waitFor(() => expect(mocks.realtime!.connected).toBe(true));
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(q("[data-riffrec-live-reshare]")).toBeTruthy();
      expect(q("[data-riffrec-consent]")).toBeNull();
      const postReload = received("mic").concat(received("stream_state"));
      expect(postReload.every((entry) => entry.session_id === sessionId)).toBe(true);
      expect(mocks.writerStop).not.toHaveBeenCalled();

      await click("Share screen");
      expect(mocks.screenTryStart).toHaveBeenCalledTimes(2);
      await vi.waitFor(() => expect(q("[data-riffrec-live-reshare]")).toBeNull());
    });
  });
});

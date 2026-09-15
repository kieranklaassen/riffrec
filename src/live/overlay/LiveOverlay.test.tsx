// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFrameStore } from "../buffer";
import type { LiveAnchor, LiveAnnotation, LiveEnvelope, LivePoint } from "../contract";
import { LiveSession, type FinishResult, type LiveSessionOptions } from "../session";
import { createFakeEndpoint, type FakeEndpoint } from "../testing/fakeEndpoint";
import type { ConsentResult } from "./ConsentDialog";
import { LiveOverlay, type LiveOverlayProps } from "./LiveOverlay";
import { OVERLAY_ATTRIBUTE } from "./strokeAnchor";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

interface Harness {
  endpoint: FakeEndpoint;
  storage: FakeStorage;
  requests: Array<{ url: string; init: RequestInit | undefined }>;
  options(overrides?: Partial<LiveSessionOptions>): LiveSessionOptions;
}

function harness(): Harness {
  const endpoint = createFakeEndpoint();
  const storage = new FakeStorage();
  const frameStore = new MemoryFrameStore();
  const requests: Harness["requests"] = [];
  let clock = 1_000_000;
  const fetchImpl: typeof fetch = (input, init) => {
    requests.push({ url: String(input), init });
    return endpoint.fetch(input, init);
  };
  return {
    endpoint,
    storage,
    requests,
    options: (overrides = {}) => ({
      bootstrap: { token: endpoint.pageToken, endpoint: endpoint.baseUrl },
      storage,
      frameStore,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      route: () => "/settings",
      pageHideTarget: null,
      now: () => (clock += 10),
      sessionId: "sess_overlay_0001",
      backoffMs: [5, 5, 5],
      ...overrides
    })
  };
}

function anchor(t = 100): LiveAnchor {
  return { route: "/settings", selector: "button.save", component: "Save", rect: { x: 1, y: 2, width: 3, height: 4 }, t };
}

function stroke(id: string): LiveAnnotation {
  return {
    id,
    kind: "stroke",
    points: [
      { x: 10, y: 10 },
      { x: 40, y: 12 },
      { x: 70, y: 30 },
      { x: 90, y: 60 }
    ],
    bbox: { x: 10, y: 10, width: 80, height: 50 },
    anchor: anchor()
  };
}

function fakeStream(): MediaStream {
  return { id: "mic", getTracks: () => [] } as unknown as MediaStream;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pointer(type: "pointerdown" | "pointermove" | "pointerup", point: LivePoint): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: point.x,
    clientY: point.y
  });
}

const sessions: LiveSession[] = [];

function track(session: LiveSession): LiveSession {
  sessions.push(session);
  return session;
}

async function settled(session: LiveSession): Promise<void> {
  await vi.waitFor(() => expect(session.sequence.queueLength).toBe(0));
}

function received(endpoint: FakeEndpoint, type: LiveEnvelope["type"]): LiveEnvelope[] {
  return endpoint.received.filter((entry) => entry.type === type);
}

describe("LiveOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: LiveOverlayProps) => {
    await act(async () => {
      root.render(<LiveOverlay getUserMedia={() => Promise.resolve(fakeStream())} {...props} />);
    });
  };

  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector);
  const click = async (selector: string) => {
    const element = q<HTMLButtonElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    await act(async () => element.click());
  };
  const indicatorState = () => q("[data-riffrec-live-indicator]")!.getAttribute("data-riffrec-live-indicator");

  /** Consent with the microphone granted; the session lands in `connecting`. */
  const consentGranted = async (session: LiveSession, props: Partial<LiveOverlayProps> = {}) => {
    session.beginConsent();
    await render({ session, ...props });
    await act(async () => q<HTMLInputElement>("[data-riffrec-consent] input[type=checkbox]")!.click());
    await click("[data-riffrec-consent-accept]");
  };

  /** Consent with the microphone denied; the session lands in `live_novoice`. */
  const consentDenied = async (session: LiveSession, props: Partial<LiveOverlayProps> = {}) => {
    session.beginConsent();
    await render({
      session,
      getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
      ...props
    });
    await act(async () => q<HTMLInputElement>("[data-riffrec-consent] input[type=checkbox]")!.click());
    await click("[data-riffrec-consent-accept]");
    await click("[data-riffrec-consent-continue-novoice]");
  };

  const liveSession = async (h: Harness, props: Partial<LiveOverlayProps> = {}, overrides: Partial<LiveSessionOptions> = {}) => {
    const session = track(LiveSession.create(h.options(overrides)));
    await consentGranted(session, props);
    await act(async () => session.voiceConnected());
    await vi.waitFor(() => expect(h.requests.some((request) => request.url.endsWith("/stream"))).toBe(true));
    return session;
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    for (const session of sessions.splice(0)) {
      if (session.status !== "ended") await session.stop();
    }
  });

  it("renders nothing while idle and the consent dialog once consent begins", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    await render({ session });
    expect(container.innerHTML).toBe("");

    await act(async () => session.beginConsent());
    expect(q("[data-riffrec-consent]")).not.toBeNull();
    expect(q("[data-riffrec-consent]")!.textContent).toContain(h.endpoint.baseUrl);
  });

  it("covers AE14: declining consent leaves the session idle and emits no events", async () => {
    const h = harness();
    const onDecline = vi.fn();
    const session = track(LiveSession.create(h.options()));
    session.beginConsent();
    await render({ session, onDecline });
    await click("[data-riffrec-consent-decline]");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(session.status).toBe("idle");
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(h.requests).toEqual([]);
    expect(h.endpoint.received).toEqual([]);
    expect(h.storage.keys()).toEqual([]);
    expect(container.innerHTML).toBe("");
  });

  it("starts the session on accept, hands the shared microphone stream over, and streams mic: granted", async () => {
    const h = harness();
    const onConsent = vi.fn<(result: ConsentResult) => void>();
    const session = track(LiveSession.create(h.options()));
    await consentGranted(session, { onConsent });

    expect(session.status).toBe("connecting");
    expect(onConsent).toHaveBeenCalledTimes(1);
    expect(onConsent.mock.calls[0][0].mic).toBe("granted");
    expect(onConsent.mock.calls[0][0].stream).not.toBeNull();
    await settled(session);
    expect(received(h.endpoint, "mic").map((entry) => entry.payload)).toEqual([{ state: "granted" }]);
    expect(indicatorState()).toBe("connecting");
    expect(q("[data-riffrec-live-panel]")).not.toBeNull();
  });

  it("mic denied: the session is live without voice, the indicator shows muted, board and drawing stay usable, and a typed reply produces an answer", async () => {
    const h = harness();
    const onConsent = vi.fn<(result: ConsentResult) => void>();
    const session = track(LiveSession.create(h.options()));
    await consentDenied(session, { onConsent });

    expect(session.status).toBe("live_novoice");
    expect(onConsent).toHaveBeenCalledWith({ stream: null, mic: "denied" });
    expect(indicatorState()).toBe("muted");
    expect(q("[data-riffrec-board]")).not.toBeNull();
    expect(q("[data-riffrec-draw-surface]")).not.toBeNull();
    await settled(session);
    expect(received(h.endpoint, "mic").map((entry) => entry.payload)).toEqual([{ state: "denied" }]);

    let unitId = "";
    await act(async () => {
      unitId = session.recordUnit({ statement: "Move the toggle up", transcript_excerpt: "toggle up", anchors: [anchor()] }).id;
    });
    await act(async () => {
      await session.send();
    });
    await settled(session);
    await act(async () => {
      await h.endpoint.ask(unitId, "Into the header or the sidebar?");
    });
    await vi.waitFor(() => expect(q("[data-riffrec-unit-question]")).not.toBeNull());
    expect(q(`[data-riffrec-unit="${unitId}"]`)!.getAttribute("data-riffrec-unit-status")).toBe("needs_info");

    const form = q<HTMLFormElement>("[data-riffrec-unit-reply]")!;
    expect(form.querySelector("input")!.placeholder).toBe("Type your answer");
    await act(async () => setInputValue(form.querySelector("input")!, "the header"));
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settled(session);

    expect(received(h.endpoint, "answer").map((entry) => entry.payload)).toEqual([{ unit_id: unitId, text: "the header" }]);
    await vi.waitFor(() => expect(q("[data-riffrec-unit-question]")).toBeNull());
  });

  it("toggles mute from the indicator and streams the mic state", async () => {
    const h = harness();
    const session = await liveSession(h);
    expect(indicatorState()).toBe("streaming");

    await click("[data-riffrec-live-mute]");
    expect(session.isMuted).toBe(true);
    expect(indicatorState()).toBe("muted");

    await click("[data-riffrec-live-mute]");
    expect(session.isMuted).toBe(false);
    expect(indicatorState()).toBe("streaming");
    await settled(session);
    expect(received(h.endpoint, "mic").map((entry) => entry.payload)).toEqual([{ state: "granted" }, { state: "muted" }, { state: "unmuted" }]);
  });

  it("pauses frame and stream capture from the indicator and reports it", async () => {
    const h = harness();
    const onPauseChange = vi.fn();
    await liveSession(h, { onPauseChange });
    await click("[data-riffrec-live-pause]");
    expect(onPauseChange).toHaveBeenCalledWith(true);
    expect(indicatorState()).toBe("paused");
    await click("[data-riffrec-live-pause]");
    expect(onPauseChange).toHaveBeenCalledWith(false);
    expect(indicatorState()).toBe("streaming");
  });

  it("withdraw on an initial unit marks it withdrawn and keeps it out of the next batch; the button is absent once released", async () => {
    const h = harness();
    const session = await liveSession(h);
    let keep = "";
    let drop = "";
    await act(async () => {
      keep = session.recordUnit({ statement: "Make this red", transcript_excerpt: "red", anchors: [anchor()] }).id;
      drop = session.recordUnit({ statement: "Forget that", transcript_excerpt: "forget", anchors: [anchor()] }).id;
    });
    await settled(session);

    await click(`[data-riffrec-unit="${drop}"] [data-riffrec-unit-withdraw]`);
    expect(q(`[data-riffrec-unit="${drop}"]`)!.getAttribute("data-riffrec-unit-status")).toBe("withdrawn");
    expect(q(`[data-riffrec-unit="${drop}"] [data-riffrec-unit-statement]`)!.getAttribute("style")).toContain("line-through");
    expect(q(`[data-riffrec-unit="${drop}"] [data-riffrec-unit-withdraw]`)).toBeNull();

    await click("[data-riffrec-send]");
    await settled(session);
    const batch = await h.endpoint.wait();
    expect((batch.body as { units: Array<{ id: string }> }).units.map((unit) => unit.id)).toEqual([keep]);

    await vi.waitFor(() => expect(q(`[data-riffrec-unit="${keep}"]`)!.getAttribute("data-riffrec-unit-status")).toBe("triaging"));
    expect(q(`[data-riffrec-unit="${keep}"] [data-riffrec-unit-withdraw]`)).toBeNull();
  });

  it("Send emits one send checkpoint and a second Send with nothing held emits none", async () => {
    const h = harness();
    const session = await liveSession(h);
    await act(async () => {
      session.recordUnit({ statement: "Make this red", transcript_excerpt: "red", anchors: [anchor()] });
    });
    expect(q("[data-riffrec-send]")!.textContent).toBe("Send (1)");

    await click("[data-riffrec-send]");
    await settled(session);
    expect(received(h.endpoint, "checkpoint").map((entry) => entry.payload)).toMatchObject([{ trigger: "send", mode: "smart" }]);

    await click("[data-riffrec-send]");
    await settled(session);
    expect(received(h.endpoint, "checkpoint")).toHaveLength(1);
    expect(q("[data-riffrec-send-note]")!.textContent).toBe("Nothing held");
  });

  it("a mode change emits no page checkpoint and keeps the pending hint until the endpoint acts on the new mode (KTD12)", async () => {
    const h = harness();
    const session = await liveSession(h);
    const pendingSeen: Array<string | null> = [];
    session.subscribe((snapshot) => pendingSeen.push(snapshot.pendingMode));

    // Into Collect: nothing wakes the agent, so the hint stays until a checkpoint stamped `collect` is acked.
    await click('[data-riffrec-mode-option="collect"]');
    await settled(session);
    expect(received(h.endpoint, "mode").map((entry) => entry.payload)).toEqual([{ mode: "collect" }]);
    expect(received(h.endpoint, "checkpoint")).toHaveLength(0);
    expect(h.endpoint.mode).toBe("collect");
    expect(q('[data-riffrec-mode-option="collect"]')!.getAttribute("aria-checked")).toBe("true");
    expect(q("[data-riffrec-mode-pending]")!.getAttribute("data-riffrec-mode-pending")).toBe("collect");

    await act(async () => {
      session.recordUnit({ statement: "Make this red", transcript_excerpt: "red", anchors: [anchor()] });
    });
    expect(q("[data-riffrec-mode-pending]")).not.toBeNull();
    await click("[data-riffrec-send]");
    await settled(session);
    expect(received(h.endpoint, "checkpoint").map((entry) => entry.payload)).toMatchObject([{ trigger: "send", mode: "collect" }]);
    await vi.waitFor(() => expect(q("[data-riffrec-mode-pending]")).toBeNull());

    // Out of Collect: the endpoint wakes the agent on the `mode` event itself (the backlog batch), so the
    // hint shows at the switch and clears once that envelope is acked, with no page checkpoint emitted.
    await click('[data-riffrec-mode-option="smart"]');
    await settled(session);
    expect(received(h.endpoint, "mode").map((entry) => entry.payload)).toEqual([{ mode: "collect" }, { mode: "smart" }]);
    expect(received(h.endpoint, "checkpoint")).toHaveLength(1);
    expect(h.endpoint.mode).toBe("smart");
    expect(pendingSeen).toContain("smart");
    await vi.waitFor(() => expect(q("[data-riffrec-mode-pending]")).toBeNull());
    expect(q('[data-riffrec-mode-option="smart"]')!.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the pending hint from rehydrated session state after a reload", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.setMode("collect");
    await settled(session);
    // Simulated reload: the old page object is gone; a fresh session rebuilds from storage.
    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored.snapshot().pendingMode).toBe("collect");
    await render({ session: restored });
    expect(q("[data-riffrec-mode-pending]")!.getAttribute("data-riffrec-mode-pending")).toBe("collect");
  });

  it("Done runs the confirmation pass, emits one unit_update with confirmed per unit, then exactly one final checkpoint, and shows the ended card", async () => {
    const h = harness();
    const onFinished = vi.fn<(result: FinishResult) => void>();
    const session = await liveSession(h, { onFinished });
    let first = "";
    let second = "";
    let withdrawn = "";
    await act(async () => {
      first = session.recordUnit({ statement: "Make this red", transcript_excerpt: "red", anchors: [anchor()] }).id;
      second = session.recordUnit({ statement: "Move the toggle", transcript_excerpt: "toggle", anchors: [anchor()] }).id;
      withdrawn = session.recordUnit({ statement: "Never mind", transcript_excerpt: "never mind", anchors: [anchor()] }).id;
      session.withdrawUnit(withdrawn);
    });
    await click("[data-riffrec-send]");
    await settled(session);
    await act(async () => {
      await h.endpoint.setUnitStatus(first, "applied");
      await h.endpoint.setUnitStatus(second, "blocked", { note: "Beyond polish" });
    });
    await vi.waitFor(() => expect(q(`[data-riffrec-unit="${second}"]`)!.getAttribute("data-riffrec-unit-status")).toBe("blocked"));

    await click("[data-riffrec-done]");
    expect(q("[data-riffrec-confirmation]")).not.toBeNull();
    expect(q(`[data-riffrec-confirm-unit="${withdrawn}"]`)).toBeNull();
    await act(async () => q<HTMLInputElement>(`[data-riffrec-confirm-unit="${second}"] [data-riffrec-confirm-change]`)!.click());

    await click("[data-riffrec-confirm-finish]");
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));

    const result = onFinished.mock.calls[0][0];
    expect(result.checkpoint.trigger).toBe("final");
    expect(result.finalAcked).toBe(true);
    expect(result.ended).toBe(true);

    const tail = h.endpoint.received.slice(-3);
    expect(tail.map((entry) => entry.type)).toEqual(["unit_update", "unit_update", "checkpoint"]);
    expect(tail[0].payload).toEqual({ unit_id: first, confirmed: { element: true, change: true } });
    expect(tail[1].payload).toEqual({ unit_id: second, confirmed: { element: true, change: false } });
    expect(received(h.endpoint, "checkpoint").filter((entry) => (entry.payload as { trigger: string }).trigger === "final")).toHaveLength(1);
    const posts = h.requests.filter((request) => request.init?.method === "POST").map((request) => request.url);
    expect(posts[posts.length - 1]).toMatch(/\/session\/end$/);
    expect(h.endpoint.ended).toBe(true);
    expect(session.status).toBe("ended");

    const card = q("[data-riffrec-ended-card]")!;
    expect(card).not.toBeNull();
    expect(card.querySelector('[data-riffrec-ended-count="applied"]')!.textContent).toBe("Applied1");
    expect(card.querySelector('[data-riffrec-ended-count="blocked"]')!.textContent).toBe("Blocked1");
    expect(card.querySelector('[data-riffrec-ended-count="withdrawn"]')!.textContent).toBe("Withdrawn1");
    expect(card.textContent).not.toMatch(/zip|download/i);
    expect(q("[data-riffrec-live-panel]")).toBeNull();
  });

  it("Done emits the final checkpoint even with nothing held", async () => {
    const h = harness();
    const onFinished = vi.fn<(result: FinishResult) => void>();
    await liveSession(h, { onFinished });
    await click("[data-riffrec-done]");
    await click("[data-riffrec-confirm-finish]");
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));

    expect(received(h.endpoint, "checkpoint").map((entry) => entry.payload)).toMatchObject([{ trigger: "final", mode: "smart" }]);
    expect(received(h.endpoint, "unit_update")).toHaveLength(0);
    expect(h.endpoint.ended).toBe(true);
    expect(q("[data-riffrec-ended-card]")!.textContent).toMatch(/No units were recorded/);
  });

  it("a double click on Finish emits exactly one final checkpoint", async () => {
    const h = harness();
    const onFinished = vi.fn<(result: FinishResult) => void>();
    await liveSession(h, { onFinished });
    await click("[data-riffrec-done]");
    const finish = q<HTMLButtonElement>("[data-riffrec-confirm-finish]")!;
    await act(async () => {
      finish.click();
      finish.click();
    });
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received(h.endpoint, "checkpoint")).toHaveLength(1);
    expect(h.requests.filter((request) => request.url.endsWith("/session/end"))).toHaveLength(1);
  });

  it("cannot collapse to the pill, and so cannot Send, while the confirmation pass is open", async () => {
    const h = harness();
    await liveSession(h);
    await click("[data-riffrec-done]");
    expect(q("[data-riffrec-live-collapse]")).toBeNull();
    expect(q("[data-riffrec-send]")).toBeNull();
    expect(q("[data-riffrec-confirmation]")).not.toBeNull();

    await click("[data-riffrec-confirm-cancel]");
    expect(q("[data-riffrec-live-collapse]")).not.toBeNull();
  });

  it("keeps riffing when the confirmation pass is cancelled", async () => {
    const h = harness();
    await liveSession(h);
    await click("[data-riffrec-done]");
    await click("[data-riffrec-confirm-cancel]");
    expect(q("[data-riffrec-confirmation]")).toBeNull();
    expect(q("[data-riffrec-board]")).not.toBeNull();
    expect(received(h.endpoint, "checkpoint")).toHaveLength(0);
  });

  it("shows the ended card when the endpoint ends the session, and nothing after a local stop()", async () => {
    const h = harness();
    const session = await liveSession(h);
    await act(async () => {
      await h.endpoint.handle({ method: "POST", path: "/session/end", headers: h.endpoint.pageHeaders(session.id), body: {} });
    });
    await vi.waitFor(() => expect(q("[data-riffrec-ended-card]")).not.toBeNull());
    expect(q("[data-riffrec-ended-reason]")).toBeNull();

    await click("[data-riffrec-ended-dismiss]");
    expect(container.innerHTML).toBe("");

    const h2 = harness();
    const other = await liveSession(h2);
    await act(async () => {
      await other.stop();
    });
    expect(container.innerHTML).toBe("");
  });

  it("strokes from the session store rehydrate into the drawing layer after a simulated reload", async () => {
    const h = harness();
    const session = track(LiveSession.create(h.options()));
    session.start();
    session.addAnnotation(stroke("ann_0001"));
    session.addAnnotation(stroke("ann_0002"));
    await settled(session);
    // Simulated reload: the old page object is gone; a fresh session rebuilds from storage.
    const restored = track(LiveSession.rehydrate(h.options({ sessionId: undefined }))!);
    expect(restored.snapshot().annotations.map((entry) => entry.id)).toEqual(["ann_0001", "ann_0002"]);
    await render({ session: restored });

    expect(q('[data-riffrec-stroke="ann_0001"]')).not.toBeNull();
    expect(q('[data-riffrec-stroke="ann_0002"]')).not.toBeNull();
    expect(q('[data-riffrec-stroke="ann_0001"]')!.getAttribute("d")).toMatch(/^M/);
  });

  it("adds a drawn stroke to the session with a session-relative anchor time", async () => {
    const h = harness();
    // Real clock: the overlay's default `now` is milliseconds since `session.startedAt`.
    const session = await liveSession(h, {}, { now: undefined });
    (document as Document & { elementsFromPoint?: (x: number, y: number) => Element[] }).elementsFromPoint = () => [];

    await click("[data-riffrec-draw-toggle]");
    expect(q("[data-riffrec-draw-active]")).not.toBeNull();
    expect(q("[data-riffrec-draw-toggle]")!.getAttribute("aria-pressed")).toBe("true");

    const surface = q<SVGSVGElement>("[data-riffrec-draw-surface]")!;
    await act(async () => {
      surface.dispatchEvent(pointer("pointerdown", { x: 10, y: 10 }));
      surface.dispatchEvent(pointer("pointermove", { x: 60, y: 20 }));
      surface.dispatchEvent(pointer("pointermove", { x: 120, y: 80 }));
      surface.dispatchEvent(pointer("pointerup", { x: 160, y: 140 }));
    });

    const annotations = session.allAnnotations();
    expect(annotations).toHaveLength(1);
    expect(annotations[0].kind).toBe("stroke");
    expect(annotations[0].anchor.t).toBeGreaterThanOrEqual(0);
    expect(annotations[0].anchor.t).toBeLessThan(60_000);
    await settled(session);
    expect(received(h.endpoint, "annotation")).toHaveLength(1);
    expect(q(`[data-riffrec-stroke="${annotations[0].id}"]`)).not.toBeNull();

    await click("[data-riffrec-draw-toggle]");
    expect(q("[data-riffrec-draw-active]")).toBeNull();
  });

  it("collapses to a pill with the indicator and Send, and marks the whole surface as overlay", async () => {
    const h = harness();
    await liveSession(h);
    const rootElement = container.firstElementChild!;
    expect(rootElement.hasAttribute(OVERLAY_ATTRIBUTE)).toBe(true);
    expect(q("[data-riffrec-live-panel]")!.closest(`[${OVERLAY_ATTRIBUTE}]`)).toBe(rootElement);

    await click("[data-riffrec-live-collapse]");
    expect(q("[data-riffrec-live-panel]")).toBeNull();
    const pill = q("[data-riffrec-live-pill]")!;
    expect(pill.querySelector("[data-riffrec-live-indicator]")).not.toBeNull();
    expect(pill.querySelector("[data-riffrec-send]")).not.toBeNull();
    expect(pill.querySelector("[data-riffrec-done]")).toBeNull();
    expect(pill.querySelector("[data-riffrec-live-indicator-label]")!.textContent).toBe("Live");

    await click("[data-riffrec-live-expand]");
    expect(q("[data-riffrec-live-panel]")).not.toBeNull();
  });
});

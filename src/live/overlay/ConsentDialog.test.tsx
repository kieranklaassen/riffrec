// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentDialog, type ConsentDialogProps, type ConsentResult } from "./ConsentDialog";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = "http://127.0.0.1:4321";

function fakeStream(): MediaStream {
  return { id: "mic", getTracks: () => [] } as unknown as MediaStream;
}

describe("ConsentDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onAccept: ReturnType<typeof vi.fn<(result: ConsentResult) => void>>;
  let onDecline: ReturnType<typeof vi.fn<() => void>>;

  const render = async (props: Partial<ConsentDialogProps> = {}) => {
    await act(async () => {
      root.render(
        <ConsentDialog
          endpoint={ORIGIN}
          onAccept={onAccept}
          onDecline={onDecline}
          getUserMedia={() => Promise.resolve(fakeStream())}
          {...props}
        />
      );
    });
  };

  const q = <T extends Element = HTMLButtonElement>(selector: string) => container.querySelector<T>(selector);
  const click = async (selector: string) => {
    const element = q(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    await act(async () => element.click());
  };
  const press = async (key: string) => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  };
  const step = () => q<HTMLElement>("[data-riffrec-consent-step]")!.getAttribute("data-riffrec-consent-step");
  const accept = () => q("[data-riffrec-consent-accept]");
  const continueNoVoice = () => q("[data-riffrec-consent-continue-novoice]");

  /** Steps 1 and 2 with the defaults: consent ticked, landing on the microphone step. */
  const toMicrophone = async () => {
    await click("[data-riffrec-consent-next]");
    await click("[data-riffrec-consent-agree]");
    await click("[data-riffrec-consent-next]");
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onAccept = vi.fn();
    onDecline = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the profile-derived copy with the endpoint origin and the retention sentence on step 2", async () => {
    await render({ profile: { audio_clip: true }, endpointOwner: "ce-polish" });
    expect(step()).toBe("1");
    await click("[data-riffrec-consent-next]");
    const dialog = q("[role=dialog]")!;
    expect(dialog.textContent).toContain(`ce-polish (${ORIGIN})`);
    expect(dialog.textContent).toMatch(/audio clips/);
    expect(q("[data-riffrec-consent-retention]")!.textContent).toMatch(/until you delete it/);
    expect(q("[data-riffrec-consent-destination=openai]")).not.toBeNull();
  });

  it("blocks step 2 until the riffer ticks the consent box", async () => {
    await render();
    await click("[data-riffrec-consent-next]");
    const next = q("[data-riffrec-consent-next]")!;
    expect(next.disabled).toBe(true);
    await click("[data-riffrec-consent-agree]");
    expect(next.disabled).toBe(false);
    await click("[data-riffrec-consent-next]");
    expect(step()).toBe("3");
  });

  it("acquires a single microphone stream on start and hands it over as granted with the setup", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    await render({ getUserMedia });
    await click('[data-riffrec-consent-mode="collect"]');
    await toMicrophone();
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => accept()!.click());

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(onAccept).toHaveBeenCalledWith({ stream, mic: "granted", mode: "collect", frames: true });
  });

  it("acquires one stream even when Start is clicked twice before the request settles (KTD21)", async () => {
    let resolve: (stream: MediaStream) => void = () => {};
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => (resolve = r)));
    await render({ getUserMedia });
    await toMicrophone();
    const button = accept()!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(button.textContent).toMatch(/Waiting/);

    await act(async () => resolve(fakeStream()));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("covers AE14: declining calls onDecline and never asks for the microphone", async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(fakeStream()));
    await render({ getUserMedia });
    await click("[data-riffrec-consent-decline]");
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports a denied microphone and offers drawing-and-board-only", async () => {
    await render({ getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")) });
    await toMicrophone();
    await act(async () => accept()!.click());

    const notice = q("[data-riffrec-consent-mic-denied]")!;
    expect(notice.textContent).toMatch(/Microphone unavailable/);
    expect(notice.textContent).toMatch(/Permission denied/);
    expect(onAccept).not.toHaveBeenCalled();
    expect(accept()).toBeNull();
    expect(q("[data-riffrec-consent-summary]")!.textContent).toContain("Voice unavailable");

    await act(async () => continueNoVoice()!.click());
    expect(onAccept).toHaveBeenCalledWith({ stream: null, mic: "denied", mode: "smart", frames: true });
  });

  it("still lets the riffer close after a denied microphone", async () => {
    await render({ getUserMedia: () => Promise.reject(new Error("no mic")) });
    await toMicrophone();
    await act(async () => accept()!.click());
    await click("[data-riffrec-consent-close]");
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("with voice off, names no OpenAI destination, never asks for the microphone, and starts without voice", async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(fakeStream()));
    await render({ getUserMedia });
    await click("[data-riffrec-consent-voice]");
    expect(q("[data-riffrec-consent-voice]")!.getAttribute("aria-checked")).toBe("false");
    await click("[data-riffrec-consent-next]");
    expect(q("[data-riffrec-consent-destination=openai]")).toBeNull();
    expect(q("[data-riffrec-consent-destination=endpoint]")!.textContent).not.toMatch(/transcript/);
    await click("[data-riffrec-consent-agree]");
    await click("[data-riffrec-consent-next]");
    expect(accept()).toBeNull();
    expect(continueNoVoice()!.textContent).toMatch(/Start session/);

    await act(async () => continueNoVoice()!.click());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onAccept).toHaveBeenCalledWith({ stream: null, mic: "denied", mode: "smart", frames: true });
  });

  it("with screenshots off, drops them from what is shared and reports frames: false", async () => {
    await render();
    await click("[data-riffrec-consent-frames]");
    await click("[data-riffrec-consent-next]");
    expect(q("[role=dialog]")!.textContent).not.toMatch(/screenshots/i);
    await click("[data-riffrec-consent-agree]");
    await click("[data-riffrec-consent-next]");
    expect(q("[data-riffrec-consent-summary]")!.textContent).toContain("Screenshots off");
    await act(async () => accept()!.click());
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ mic: "granted", frames: false }));
  });

  it("Change returns to setup and Back steps down one", async () => {
    await render();
    await toMicrophone();
    await click("[data-riffrec-consent-change]");
    expect(step()).toBe("1");
    await click("[data-riffrec-consent-next]");
    await click("[data-riffrec-consent-back]");
    expect(step()).toBe("1");
  });

  it("drives every step from the keyboard", async () => {
    const stream = fakeStream();
    await render({ getUserMedia: () => Promise.resolve(stream) });
    await press("1");
    expect(q('[data-riffrec-consent-mode="instant"]')!.getAttribute("aria-checked")).toBe("true");
    await press("f");
    expect(q("[data-riffrec-consent-frames]")!.getAttribute("aria-checked")).toBe("false");
    await press("Enter");
    expect(step()).toBe("2");
    await press("Enter");
    expect(step()).toBe("2");
    await press(" ");
    await press("Enter");
    expect(step()).toBe("3");
    await press("Escape");
    expect(step()).toBe("2");
    await press("Enter");
    await press("Enter");
    expect(onAccept).toHaveBeenCalledWith({ stream, mic: "granted", mode: "instant", frames: false });
  });

  it("closes on Escape from step 1", async () => {
    await render();
    await press("Escape");
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("shows the local-archive copy and no OpenAI destination without an endpoint", async () => {
    await render({ endpoint: null });
    await click("[data-riffrec-consent-next]");
    expect(q("[data-riffrec-consent-destination=openai]")).toBeNull();
    expect(q("[data-riffrec-consent-destination=local]")).not.toBeNull();
    expect(q("[data-riffrec-consent-retention]")).toBeNull();
  });
});

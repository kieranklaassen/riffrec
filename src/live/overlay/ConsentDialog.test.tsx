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

  const checkbox = () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  const accept = () => container.querySelector<HTMLButtonElement>("[data-riffrec-consent-accept]");
  const decline = () => container.querySelector<HTMLButtonElement>("[data-riffrec-consent-decline]")!;
  const continueNoVoice = () => container.querySelector<HTMLButtonElement>("[data-riffrec-consent-continue-novoice]");

  const tick = async () => {
    await act(async () => {
      checkbox().click();
    });
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

  it("renders the profile-derived copy with the endpoint origin and the retention sentence", async () => {
    await render({ profile: { audio_clip: true }, endpointOwner: "ce-polish" });
    const dialog = container.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain(`ce-polish (${ORIGIN})`);
    expect(dialog.textContent).toMatch(/audio clips/);
    expect(container.querySelector("[data-riffrec-consent-retention]")!.textContent).toMatch(/until you delete it/);
    expect(container.querySelector("[data-riffrec-consent-destination=openai]")).not.toBeNull();
  });

  it("keeps Accept disabled until the riffer ticks the consent box", async () => {
    await render();
    expect(accept()!.disabled).toBe(true);
    await tick();
    expect(accept()!.disabled).toBe(false);
  });

  it("acquires a single microphone stream on accept and hands it over as granted", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    await render({ getUserMedia });
    await tick();
    await act(async () => accept()!.click());

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(onAccept).toHaveBeenCalledWith({ stream, mic: "granted" });
  });

  it("acquires one stream even when Accept is clicked twice before the request settles (KTD21)", async () => {
    let resolve: (stream: MediaStream) => void = () => {};
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => (resolve = r)));
    await render({ getUserMedia });
    await tick();
    const button = accept()!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => resolve(fakeStream()));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("covers AE14: declining calls onDecline and never asks for the microphone", async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(fakeStream()));
    await render({ getUserMedia });
    await act(async () => decline().click());
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports a denied microphone and offers drawing-and-board-only", async () => {
    await render({ getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")) });
    await tick();
    await act(async () => accept()!.click());

    const notice = container.querySelector("[data-riffrec-consent-mic-denied]")!;
    expect(notice.textContent).toMatch(/Microphone unavailable/);
    expect(notice.textContent).toMatch(/Permission denied/);
    expect(onAccept).not.toHaveBeenCalled();
    expect(accept()).toBeNull();

    await act(async () => continueNoVoice()!.click());
    expect(onAccept).toHaveBeenCalledWith({ stream: null, mic: "denied" });
  });

  it("still lets the riffer decline after a denied microphone", async () => {
    await render({ getUserMedia: () => Promise.reject(new Error("no mic")) });
    await tick();
    await act(async () => accept()!.click());
    await act(async () => decline().click());
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("shows the local-archive copy and no OpenAI destination without an endpoint", async () => {
    await render({ endpoint: null });
    expect(container.querySelector("[data-riffrec-consent-destination=openai]")).toBeNull();
    expect(container.querySelector("[data-riffrec-consent-destination=local]")).not.toBeNull();
    expect(container.querySelector("[data-riffrec-consent-retention]")).toBeNull();
  });
});

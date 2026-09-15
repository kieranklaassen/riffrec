// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendControl, type SendControlProps } from "./SendControl";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("SendControl", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: Partial<SendControlProps> = {}) => {
    await act(async () => {
      root.render(<SendControl onSend={() => Promise.resolve(true)} onDone={() => {}} {...props} />);
    });
  };

  const send = () => container.querySelector<HTMLButtonElement>("[data-riffrec-send]")!;
  const done = () => container.querySelector<HTMLButtonElement>("[data-riffrec-done]");

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("calls the session's send once per click and shows the held count", async () => {
    const onSend = vi.fn(() => Promise.resolve(true));
    await render({ onSend, heldCount: 2 });
    expect(send().textContent).toBe("Send (2)");
    await act(async () => send().click());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-riffrec-send-note]")).toBeNull();
  });

  it("says nothing was held when the send emitted no checkpoint", async () => {
    await render({ onSend: () => Promise.resolve(false) });
    await act(async () => send().click());
    expect(container.querySelector("[data-riffrec-send-note]")!.textContent).toBe("Nothing held");
  });

  it("disables Send while a send is in flight", async () => {
    let resolve: (emitted: boolean) => void = () => {};
    await render({ onSend: () => new Promise((r) => (resolve = r)) });
    await act(async () => send().click());
    expect(send().disabled).toBe(true);
    expect(send().textContent).toBe("Sending…");
    await act(async () => resolve(true));
    expect(send().disabled).toBe(false);
  });

  it("renders Done beside Send and opens the confirmation flow", async () => {
    const onDone = vi.fn();
    await render({ onDone });
    await act(async () => done()!.click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("drops Done in the compact pill form", async () => {
    await render({ compact: true });
    expect(done()).toBeNull();
    expect(send()).not.toBeNull();
  });
});

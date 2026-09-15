// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSelector } from "../../capture/element";
import type { LiveAnnotation } from "../contract";
import { Pin, PinComposer, buildPinRecord, getAccessibleName } from "./Pin";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

function mount(html: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper;
}

describe("getAccessibleName", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers aria-label, then aria-labelledby", () => {
    const wrapper = mount(
      '<span id="lbl">Billing email</span><input aria-labelledby="lbl" value="secret@example.com"><button aria-label="Close">×</button>'
    );
    expect(getAccessibleName(wrapper.querySelector("input")!)).toBe("Billing email");
    expect(getAccessibleName(wrapper.querySelector("button")!)).toBe("Close");
  });

  it("uses the associated label, placeholder, or name for inputs and never the value", () => {
    const wrapper = mount(
      '<label for="email">Email address</label><input id="email" value="kieran@example.com">' +
        '<input placeholder="Search" value="typed query">' +
        '<input name="promo" value="SAVE20">' +
        '<textarea>private note</textarea>'
    );
    const [labelled, placeholder, named] = Array.from(wrapper.querySelectorAll("input"));
    expect(getAccessibleName(labelled)).toBe("Email address");
    expect(getAccessibleName(placeholder)).toBe("Search");
    expect(getAccessibleName(named)).toBe("promo");
    expect(getAccessibleName(wrapper.querySelector("textarea")!)).toBeNull();
  });

  it("strips wrapped control contents from labels, labelledby targets, and containers", () => {
    const wrapper = mount(
      '<label class="wrap">Notes<textarea>private draft</textarea></label>' +
        '<div id="pick-lbl">Plan<select><option>Pro tier</option></select></div><input aria-labelledby="pick-lbl" value="x">' +
        '<div class="group"><span>Message</span><textarea>typed body</textarea></div>'
    );
    expect(getAccessibleName(wrapper.querySelector(".wrap textarea")!)).toBe("Notes");
    expect(getAccessibleName(wrapper.querySelector("input")!)).toBe("Plan");
    expect(getAccessibleName(wrapper.querySelector(".group")!)).toBe("Message");
  });

  it("uses visible text for other elements", () => {
    const wrapper = mount('<button>  Save   changes </button><img alt="Logo">');
    expect(getAccessibleName(wrapper.querySelector("button")!)).toBe("Save changes");
    expect(getAccessibleName(wrapper.querySelector("img")!)).toBe("Logo");
  });
});

describe("buildPinRecord", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("records the input's selector and accessible name but no typed value", () => {
    const wrapper = mount(
      '<form data-component="SignupForm"><label for="pw">Password hint</label><input id="pw" class="field" value="hunter2"></form>'
    );
    const input = wrapper.querySelector<HTMLInputElement>("#pw")!;
    input.getBoundingClientRect = () =>
      ({ x: 10, y: 20, width: 200, height: 32, top: 20, left: 10, right: 210, bottom: 52, toJSON: () => ({}) }) as DOMRect;

    const record = buildPinRecord(input, "make this wider");

    expect(record).toEqual({
      selector: buildSelector(input),
      component: "SignupForm",
      snippet: "Password hint",
      rect: { x: 10, y: 20, width: 200, height: 32 },
      comment: "make this wider"
    });
    expect(document.querySelector(record.selector)).toBe(input);
    expect(JSON.stringify(record)).not.toContain("hunter2");
  });
});

describe("Pin components", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a numbered marker at the pin's point", async () => {
    const annotation: LiveAnnotation = {
      id: "ann_pin",
      kind: "pin",
      points: [{ x: 40, y: 60 }],
      bbox: { x: 40, y: 60, width: 0, height: 0 },
      anchor: { route: "/", selector: "button", component: null, rect: { x: 0, y: 0, width: 10, height: 10 }, t: 1 },
      text: "bigger"
    };

    await act(async () => {
      root.render(
        <svg>
          <Pin annotation={annotation} index={3} />
        </svg>
      );
    });

    const marker = container.querySelector('[data-riffrec-pin="ann_pin"]')!;
    expect(marker.getAttribute("transform")).toBe("translate(40 60)");
    expect(marker.querySelector("text")!.textContent).toBe("3");
    expect(marker.getAttribute("aria-label")).toBe("Pin 3: bigger");
  });

  it("shows the target's accessible name and submits the trimmed comment", async () => {
    const target = document.createElement("input");
    target.setAttribute("aria-label", "Coupon code");
    target.value = "SAVE20";
    document.body.appendChild(target);
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(<PinComposer point={{ x: 10, y: 10 }} target={target} onSubmit={onSubmit} onCancel={onCancel} />);
    });

    const composer = container.querySelector("[data-riffrec-pin-composer]")!;
    expect(composer.textContent).toContain("Coupon code");
    expect(composer.textContent).not.toContain("SAVE20");
    expect(document.activeElement).toBe(composer.querySelector("textarea"));

    const submit = composer.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      const textarea = composer.querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "  needs a hint  ");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(submit.disabled).toBe(false);
    await act(async () => {
      submit.click();
    });

    expect(onSubmit).toHaveBeenCalledWith("needs a hint");
    expect(onCancel).not.toHaveBeenCalled();
    target.remove();
  });

  it("cancels on Escape", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(<PinComposer point={{ x: 10, y: 10 }} target={null} onSubmit={onSubmit} onCancel={onCancel} />);
    });

    await act(async () => {
      container
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

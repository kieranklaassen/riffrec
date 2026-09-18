// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { RiffrecEvent } from "../types";
import { buildElementInfo, buildFullPath, buildSelector } from "./element";
import { EventCapture } from "./events";

describe("EventCapture", () => {
  it("records clicks, skipping targets the caller asked it to ignore", () => {
    document.body.innerHTML = '<main><button id="host">Host</button></main><div data-riffrec-overlay=""><button id="panel">Done</button></div>';
    const events: RiffrecEvent[] = [];
    const capture = new EventCapture();
    capture.start(Date.now(), (event) => events.push(event), { ignore: (target) => target.closest("[data-riffrec-overlay]") !== null });

    document.querySelector<HTMLButtonElement>("#panel")!.click();
    document.querySelector<HTMLButtonElement>("#host")!.click();
    capture.stop();
    document.querySelector<HTMLButtonElement>("#host")!.click();

    expect(events.map((event) => event.type === "click" && event.element.id)).toEqual(["host"]);
  });

  it("records every click when nothing is ignored", () => {
    document.body.innerHTML = '<div data-riffrec-overlay=""><button id="panel">Done</button></div>';
    const events: RiffrecEvent[] = [];
    const capture = new EventCapture();
    capture.start(Date.now(), (event) => events.push(event));
    document.querySelector<HTMLButtonElement>("#panel")!.click();
    capture.stop();
    expect(events).toHaveLength(1);
  });
});

describe("event element capture", () => {
  it("builds a stable selector and element metadata", () => {
    document.body.innerHTML =
      '<main><button id="save" class="primary wide" aria-label="Save changes">Save</button></main>';
    const button = document.querySelector("button")!;

    expect(buildSelector(button)).toBe("html > body > main > button#save.primary.wide");
    expect(buildElementInfo(button)).toMatchObject({
      tag: "button",
      text: "Save",
      id: "save",
      selector: "html > body > main > button#save.primary.wide",
      name: "button [Save changes]",
      fullPath: "body > main > button#save",
      classes: ["primary", "wide"],
      ariaLabel: "Save changes"
    });
  });

  it("drops textarea, select, and contenteditable contents from the text of a wrapping element", () => {
    document.body.innerHTML =
      '<label id="wrap">Notes <textarea>my private draft</textarea> <select><option>Chosen option</option></select> <div contenteditable="true">typed here</div> <span>visible hint</span></label>';
    const label = document.querySelector("#wrap")!;
    const info = buildElementInfo(label);

    expect(info.text).toBe("Notes visible hint");
    expect(info.name).toBe('label "Notes visible hint"');
    expect(JSON.stringify(info)).not.toMatch(/private draft|Chosen option|typed here/);
  });

  it("does not capture text from password or hidden inputs", () => {
    document.body.innerHTML = '<input id="password" type="password" value="secret" />';
    const input = document.querySelector("input")!;

    expect(buildElementInfo(input).text).toBeNull();
  });

  it("uses non-sensitive input attributes instead of values", () => {
    document.body.innerHTML =
      '<label>Email</label><input id="email" name="email" placeholder="Work email" value="secret@example.com" />';
    const input = document.querySelector("input")!;
    const info = buildElementInfo(input);

    expect(info.name).toBe('input "Work email"');
    expect(info.text).toBeNull();
    expect(info.nearbyText).toContain("Email");
    expect(JSON.stringify(info)).not.toContain("secret@example.com");
  });

  it("cleans class hashes from class output", () => {
    document.body.innerHTML = '<div class="CheckoutForm_a1b2c3 primary">Pay</div>';
    const div = document.querySelector("div")!;

    expect(buildElementInfo(div).classes).toEqual(["CheckoutForm", "primary"]);
  });

  it("marks shadow DOM boundaries in full paths", () => {
    document.body.innerHTML = '<section id="host"></section>';
    const host = document.querySelector("#host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<button class="inside">Pay</button>';
    const button = shadow.querySelector("button")!;

    expect(buildFullPath(button)).toBe("body > section#host > [shadow] button.inside");
  });
});

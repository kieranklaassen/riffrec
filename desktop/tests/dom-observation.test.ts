import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { observationForElement } from "../src/session/dom-observation";

function element(html: string, selector: string): Element {
  const dom = new JSDOM(html);
  const result = dom.window.document.querySelector(selector);
  if (!result) {
    throw new Error(`Missing fixture element: ${selector}`);
  }
  return result;
}

describe("observationForElement", () => {
  it("never captures user-visible text within editable fields", () => {
    for (const target of [
      element("<input value='private token'>", "input"),
      element("<textarea>secret note</textarea>", "textarea"),
      element("<div contenteditable='true'>draft password</div>", "div"),
      element("<div role='textbox'>payment card</div>", "div")
    ]) {
      expect(observationForElement(target).element.text).toBeNull();
    }
  });

  it("keeps bounded descriptive text for ordinary clickable controls", () => {
    const button = element(
      `<main data-component="Checkout"><button id="pay" class="primary large">${"Pay ".repeat(80)}</button></main>`,
      "button"
    );
    const observation = observationForElement(button);

    expect(observation.component).toBe("Checkout");
    expect(observation.element.selector).toContain("button#pay.primary.large");
    expect(observation.element.text?.length).toBe(200);
  });
});

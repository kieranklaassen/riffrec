// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElementInfo, buildFullPath, buildSelector } from "./element";

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

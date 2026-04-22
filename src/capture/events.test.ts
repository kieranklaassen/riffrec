// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElementInfo, buildSelector } from "./events";

describe("event element capture", () => {
  it("builds a stable selector and element metadata", () => {
    document.body.innerHTML = '<main><button id="save" class="primary wide">Save</button></main>';
    const button = document.querySelector("button")!;

    expect(buildSelector(button)).toBe("html > body > main > button#save.primary.wide");
    expect(buildElementInfo(button)).toEqual({
      tag: "button",
      text: "Save",
      id: "save",
      selector: "html > body > main > button#save.primary.wide"
    });
  });

  it("does not capture text from password or hidden inputs", () => {
    document.body.innerHTML = '<input id="password" type="password" value="secret" />';
    const input = document.querySelector("input")!;

    expect(buildElementInfo(input).text).toBeNull();
  });
});

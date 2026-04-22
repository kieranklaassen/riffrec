// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getComponentName } from "./fiber";

describe("getComponentName", () => {
  it("uses data-component when Fiber metadata is absent", () => {
    document.body.innerHTML = '<div data-component="CheckoutButton"><button>Pay</button></div>';
    const button = document.querySelector("button")!;

    expect(getComponentName(button)).toBe("CheckoutButton");
  });

  it("walks React Fiber metadata for function display names", () => {
    document.body.innerHTML = "<button>Pay</button>";
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function CheckoutButton() {}
    button.__reactFiber$test = {
      type: "button",
      return: {
        type: CheckoutButton,
        return: null
      }
    };

    expect(getComponentName(button)).toBe("CheckoutButton");
  });

  it("falls back to data-component when Fiber names are minified", () => {
    document.body.innerHTML = '<div data-component="ReadableName"><button>Pay</button></div>';
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function t() {}
    button.__reactFiber$test = {
      type: "button",
      return: {
        type: t,
        return: null
      }
    };

    expect(getComponentName(button)).toBe("ReadableName");
  });
});

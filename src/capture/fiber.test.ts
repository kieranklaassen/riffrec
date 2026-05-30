// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getComponentName, getComponentPath } from "./fiber";

describe("getComponentName", () => {
  it("uses data-component when Fiber metadata is absent", () => {
    document.body.innerHTML = '<div data-component="CheckoutButton"><button>Pay</button></div>';
    const button = document.querySelector("button")!;

    expect(getComponentName(button)).toBe("CheckoutButton");
    expect(getComponentPath(button)).toEqual(["CheckoutButton"]);
  });

  it("walks React Fiber metadata for function display names", () => {
    document.body.innerHTML = "<button>Pay</button>";
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function CheckoutButton() {}
    button.__reactFiber$test = {
      tag: 5,
      type: "button",
      return: {
        tag: 0,
        type: CheckoutButton,
        return: null
      }
    };

    expect(getComponentName(button)).toBe("CheckoutButton");
    expect(getComponentPath(button)).toEqual(["CheckoutButton"]);
  });

  it("falls back to data-component when Fiber names are minified", () => {
    document.body.innerHTML = '<div data-component="ReadableName"><button>Pay</button></div>';
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function t() {}
    button.__reactFiber$test = {
      tag: 5,
      type: "button",
      return: {
        tag: 0,
        type: t,
        return: null
      }
    };

    expect(getComponentName(button)).toBe("ReadableName");
  });

  it("returns an outer-to-inner component path", () => {
    document.body.innerHTML = "<button>Pay</button>";
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function App() {}
    function CheckoutPage() {}
    function CheckoutButton() {}
    button.__reactFiber$test = {
      tag: 5,
      type: "button",
      return: {
        tag: 0,
        type: CheckoutButton,
        return: {
          tag: 0,
          type: CheckoutPage,
          return: {
            tag: 0,
            type: App,
            return: null
          }
        }
      }
    };

    expect(getComponentName(button)).toBe("CheckoutButton");
    expect(getComponentPath(button)).toEqual(["App", "CheckoutPage", "CheckoutButton"]);
  });

  it("unwraps memo and forwardRef component names", () => {
    document.body.innerHTML = "<button>Pay</button>";
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function MemoButton() {}
    function ForwardedButton() {}
    button.__reactFiber$test = {
      tag: 5,
      type: "button",
      return: {
        tag: 14,
        elementType: { type: MemoButton },
        type: null,
        return: {
          tag: 11,
          elementType: { render: ForwardedButton },
          type: null,
          return: null
        }
      }
    };

    expect(getComponentPath(button)).toEqual(["ForwardedButton", "MemoButton"]);
  });

  it("filters framework wrapper names", () => {
    document.body.innerHTML = "<button>Pay</button>";
    const button = document.querySelector("button")! as unknown as Element & Record<string, unknown>;
    function AppRouter() {}
    function CheckoutButton() {}
    button.__reactFiber$test = {
      tag: 5,
      type: "button",
      return: {
        tag: 0,
        type: CheckoutButton,
        return: {
          tag: 0,
          type: AppRouter,
          return: null
        }
      }
    };

    expect(getComponentPath(button)).toEqual(["CheckoutButton"]);
  });
});

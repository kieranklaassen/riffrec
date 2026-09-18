// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSelector } from "../../capture/element";
import type { ElementBoundingBox } from "../../types";
import { validateEnvelope, type LiveAnnotation, type LivePoint } from "../contract";
import { DrawingLayer, type DrawingLayerProps } from "./DrawingLayer";
import { DEFAULT_DRAW_SHORTCUT, createDrawToggle, matchesShortcut, parseShortcut } from "./shortcuts";
import { rectContains } from "./strokeAnchor";

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type HitTestDocument = Omit<Document, "elementsFromPoint"> & { elementsFromPoint?: (x: number, y: number) => Element[] };

function setRect(element: Element, rect: ElementBoundingBox): void {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => rect
    }) as DOMRect;
}

/** jsdom has no hit-testing; emulate the browser's stacking: overlay surface first, then the app. */
function stubHitTest(appElementsAt: (point: LivePoint) => Element[]): void {
  (document as HitTestDocument).elementsFromPoint = (x, y) => {
    const surface = document.querySelector("[data-riffrec-draw-surface]");
    const app = appElementsAt({ x, y });
    return surface ? [surface, ...app] : app;
  };
}

function pointer(type: "pointerdown" | "pointermove" | "pointerup", point: LivePoint): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: point.x,
    clientY: point.y
  });
}

function surface(): SVGSVGElement {
  return document.querySelector<SVGSVGElement>("[data-riffrec-draw-surface]")!;
}

function toggleButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("[data-riffrec-draw-toggle]")!;
}

async function draw(points: LivePoint[]): Promise<void> {
  const [first, ...rest] = points;
  const last = rest.pop() ?? first;
  await act(async () => {
    surface().dispatchEvent(pointer("pointerdown", first));
    for (const point of rest) surface().dispatchEvent(pointer("pointermove", point));
    surface().dispatchEvent(pointer("pointerup", last));
  });
}

function envelopeFor(annotation: LiveAnnotation): unknown {
  return { schema_version: "live/1", session_id: "s", seq: 1, t: 0, type: "annotation", payload: annotation };
}

describe("DrawingLayer", () => {
  let app: HTMLDivElement;
  let container: HTMLDivElement;
  let root: Root;
  let onAnnotation: ReturnType<typeof vi.fn<(annotation: LiveAnnotation) => void>>;

  const render = async (props: Partial<DrawingLayerProps> = {}) => {
    await act(async () => {
      root.render(
        <DrawingLayer annotations={[]} onAnnotation={onAnnotation} route="/pricing" now={() => 4200} {...props} />
      );
    });
  };

  beforeEach(() => {
    app = document.createElement("div");
    app.className = "app-shell";
    setRect(app, { x: 0, y: 0, width: 1024, height: 768 });
    document.body.appendChild(app);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onAnnotation = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    app.remove();
    delete (document as HitTestDocument).elementsFromPoint;
  });

  it("anchors a closed stroke around a card to that card and emits a valid annotation (AE4)", async () => {
    app.innerHTML =
      '<section class="card" id="pricing-card" data-component="PricingCard"><h2 class="card-title">Pro</h2></section>';
    const card = app.querySelector("#pricing-card")!;
    const title = app.querySelector(".card-title")!;
    setRect(card, { x: 100, y: 100, width: 200, height: 120 });
    setRect(title, { x: 110, y: 110, width: 180, height: 40 });
    stubHitTest(() => [title, card, app, document.body]);

    await render({ defaultActive: true });
    await draw([
      { x: 90, y: 90 },
      { x: 200, y: 86 },
      { x: 310, y: 92 },
      { x: 312, y: 232 },
      { x: 200, y: 236 },
      { x: 88, y: 230 },
      { x: 90, y: 90 }
    ]);

    expect(onAnnotation).toHaveBeenCalledTimes(1);
    const annotation = onAnnotation.mock.calls[0][0];
    expect(annotation.kind).toBe("stroke");
    expect(annotation.points).toHaveLength(7);
    expect(annotation.anchor.selector).toBe(buildSelector(card));
    expect(document.querySelector(annotation.anchor.selector)).toBe(card);
    expect(annotation.anchor.component).toBe("PricingCard");
    expect(annotation.anchor.route).toBe("/pricing");
    expect(annotation.anchor.t).toBe(4200);
    expect(rectContains(annotation.bbox, annotation.anchor.rect)).toBe(true);
    expect(validateEnvelope(envelopeFor(annotation))).toBe(true);
    expect(document.querySelector("[data-riffrec-stroke-draft]")).toBeNull();
  });

  it("anchors a stroke across two elements to the one with the largest overlap", async () => {
    app.innerHTML = '<div class="row"><button class="left">Left</button><button class="right">Right</button></div>';
    setRect(app.querySelector(".row")!, { x: 0, y: 0, width: 200, height: 100 });
    setRect(app.querySelector(".left")!, { x: 0, y: 0, width: 100, height: 100 });
    const right = app.querySelector(".right")!;
    setRect(right, { x: 100, y: 0, width: 100, height: 100 });
    stubHitTest(() => []);

    await render({ defaultActive: true });
    await draw([{ x: 60, y: 40 }, { x: 100, y: 50 }, { x: 150, y: 60 }]);

    expect(onAnnotation.mock.calls[0][0].anchor.selector).toBe(buildSelector(right));
  });

  it("captures pointer input and shows the affordance while active; is inert when inactive", async () => {
    app.innerHTML = '<button class="underneath">Underneath</button>';
    const underneath = app.querySelector<HTMLButtonElement>(".underneath")!;
    const onUnderneathClick = vi.fn();
    underneath.addEventListener("click", onUnderneathClick);
    setRect(underneath, { x: 10, y: 10, width: 120, height: 40 });
    stubHitTest(() => [underneath, app, document.body]);

    await render({ defaultActive: true });

    const svg = surface();
    expect(svg.style.pointerEvents).toBe("auto");
    expect(svg.style.cursor).toBe("crosshair");
    expect(document.querySelector("[data-riffrec-draw-active]")).not.toBeNull();
    expect(document.querySelector("[data-riffrec-draw-tint]")).not.toBeNull();
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");

    // With the layer on top, the browser delivers the click to the overlay, not the button.
    await act(async () => {
      svg.dispatchEvent(pointer("pointerdown", { x: 40, y: 20 }));
      svg.dispatchEvent(pointer("pointerup", { x: 40, y: 20 }));
      svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 40, clientY: 20 }));
    });
    expect(onUnderneathClick).not.toHaveBeenCalled();
    expect(document.querySelector("[data-riffrec-pin-composer]")).not.toBeNull();

    // A pointer-down elsewhere dismisses the composer without placing a mark.
    await act(async () => {
      svg.dispatchEvent(pointer("pointerdown", { x: 400, y: 400 }));
    });
    expect(document.querySelector("[data-riffrec-pin-composer]")).toBeNull();
    expect(onAnnotation).not.toHaveBeenCalled();
    await draw([{ x: 40, y: 20 }]);
    expect(document.querySelector("[data-riffrec-pin-composer]")).not.toBeNull();

    await act(async () => {
      toggleButton().click();
    });

    expect(surface().style.pointerEvents).toBe("none");
    expect(surface().style.cursor).toBe("default");
    expect(document.querySelector("[data-riffrec-draw-active]")).toBeNull();
    expect(document.querySelector("[data-riffrec-draw-tint]")).toBeNull();
    expect(document.querySelector("[data-riffrec-pin-composer]")).toBeNull();
    expect(toggleButton().getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      underneath.click();
    });
    expect(onUnderneathClick).toHaveBeenCalledTimes(1);

    // Pointer input on an inactive surface never produces a mark.
    await draw([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 90 }]);
    expect(onAnnotation).not.toHaveBeenCalled();
  });

  it("pins an input with its selector and accessible name but no typed value", async () => {
    app.innerHTML =
      '<form data-component="SignupForm"><label for="email">Email address</label><input id="email" class="field" value="kieran@example.com"></form>';
    const input = app.querySelector<HTMLInputElement>("#email")!;
    setRect(input, { x: 10, y: 20, width: 200, height: 32 });
    stubHitTest(() => [input, app, document.body]);

    await render({ defaultActive: true });
    await draw([{ x: 60, y: 36 }]);

    const composer = document.querySelector("[data-riffrec-pin-composer]")!;
    expect(composer.textContent).toContain("Email address");
    expect(composer.textContent).not.toContain("kieran@example.com");

    await act(async () => {
      const textarea = composer.querySelector<HTMLTextAreaElement>("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "make it wider");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      composer.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onAnnotation).toHaveBeenCalledTimes(1);
    const annotation = onAnnotation.mock.calls[0][0];
    expect(annotation.kind).toBe("pin");
    expect(annotation.text).toBe("make it wider");
    expect(annotation.points).toEqual([{ x: 60, y: 36 }]);
    expect(annotation.anchor.selector).toBe(buildSelector(input));
    expect(document.querySelector(annotation.anchor.selector)).toBe(input);
    expect(annotation.anchor.component).toBe("SignupForm");
    expect(annotation.anchor.rect).toEqual({ x: 10, y: 20, width: 200, height: 32 });
    expect(JSON.stringify(annotation)).not.toContain("kieran@example.com");
    expect(validateEnvelope(envelopeFor(annotation))).toBe(true);
    expect(document.querySelector("[data-riffrec-pin-composer]")).toBeNull();
  });

  it("keeps to one tool: draw never pins on a tap, pin never strokes on a drag", async () => {
    stubHitTest(() => [app, document.body]);

    await render({ defaultActive: true, tool: "draw" });
    await draw([{ x: 60, y: 36 }]);
    expect(document.querySelector("[data-riffrec-pin-composer]")).toBeNull();

    await render({ defaultActive: true, tool: "pin" });
    expect(surface().style.cursor).toBe("cell");
    await draw([
      { x: 60, y: 36 },
      { x: 160, y: 136 }
    ]);
    expect(document.querySelector("[data-riffrec-stroke-draft]")).toBeNull();
    expect(document.querySelector("[data-riffrec-pin-composer]")).toBeNull();
    expect(onAnnotation).toHaveBeenCalledTimes(1);
    expect(onAnnotation.mock.calls[0][0]).toMatchObject({ kind: "pin", points: [{ x: 60, y: 36 }] });
    expect(onAnnotation.mock.calls[0][0].text).toBeUndefined();
  });

  it("renders annotations passed by prop after a remount", async () => {
    const anchor = { route: "/", selector: "button", component: null, rect: { x: 0, y: 0, width: 10, height: 10 }, t: 1 };
    const annotations: LiveAnnotation[] = [
      { id: "ann_a", kind: "stroke", points: [{ x: 1, y: 1 }, { x: 40, y: 12 }, { x: 80, y: 30 }], bbox: { x: 1, y: 1, width: 79, height: 29 }, anchor },
      { id: "ann_b", kind: "pin", points: [{ x: 20, y: 20 }], bbox: { x: 20, y: 20, width: 0, height: 0 }, anchor, text: "here" },
      { id: "ann_c", kind: "pin", points: [{ x: 60, y: 60 }], bbox: { x: 60, y: 60, width: 0, height: 0 }, anchor, text: "there" }
    ];

    const expectRendered = () => {
      const stroke = document.querySelector('[data-riffrec-stroke="ann_a"]')!;
      expect(stroke.getAttribute("d")).toMatch(/^M.*Z$/);
      expect(document.querySelector('[data-riffrec-pin="ann_b"] text')!.textContent).toBe("1");
      expect(document.querySelector('[data-riffrec-pin="ann_c"] text')!.textContent).toBe("2");
    };

    await render({ annotations });
    expectRendered();

    await act(async () => root.unmount());
    root = createRoot(container);
    await render({ annotations });
    expectRendered();
    expect(onAnnotation).not.toHaveBeenCalled();
  });

  it("toggles with the default shortcut and honours a custom drawShortcut", async () => {
    const onActiveChange = vi.fn();
    await render({ onActiveChange });
    expect(document.querySelector("[data-riffrec-draw-active]")).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "D", code: "KeyD", altKey: true, shiftKey: true, bubbles: true }));
    });
    expect(document.querySelector("[data-riffrec-draw-active]")).not.toBeNull();
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-riffrec-draw-active]")).toBeNull();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);

    await render({ onActiveChange, shortcut: "Mod+Shift+P" });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "D", code: "KeyD", altKey: true, shiftKey: true, bubbles: true }));
    });
    expect(document.querySelector("[data-riffrec-draw-active]")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "P", code: "KeyP", ctrlKey: true, shiftKey: true, bubbles: true }));
    });
    expect(document.querySelector("[data-riffrec-draw-active]")).not.toBeNull();
    expect(toggleButton().title).toBe("Draw (Mod+Shift+P)");
  });

  it("follows a controlled active prop and reports toggle requests", async () => {
    const onActiveChange = vi.fn();
    await render({ active: false, onActiveChange });

    await act(async () => {
      toggleButton().click();
    });
    expect(onActiveChange).toHaveBeenCalledWith(true);
    expect(document.querySelector("[data-riffrec-draw-active]")).toBeNull();

    await render({ active: true, onActiveChange });
    expect(document.querySelector("[data-riffrec-draw-active]")).not.toBeNull();
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("unbinds the previous shortcut when the binding changes and on unmount", async () => {
    const onActiveChange = vi.fn();
    const press = (key: string, code: string) =>
      act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, code, altKey: true, shiftKey: true, bubbles: true }));
      });

    await render({ onActiveChange, shortcut: "Alt+Shift+D" });
    await render({ onActiveChange, shortcut: "Alt+Shift+K" });
    await press("D", "KeyD");
    expect(onActiveChange).not.toHaveBeenCalled();
    await press("K", "KeyK");
    expect(onActiveChange).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    root = createRoot(container);
    await press("K", "KeyK");
    expect(onActiveChange).toHaveBeenCalledTimes(1);
  });

  it("records only the pathname in the default route", async () => {
    window.history.replaceState(null, "", "/settings?code=oauth-secret&state=abc#frag");
    stubHitTest(() => []);
    await render({ defaultActive: true, route: undefined });
    await draw([{ x: 5, y: 5 }, { x: 30, y: 30 }, { x: 60, y: 10 }]);

    const annotation = onAnnotation.mock.calls[0][0];
    expect(annotation.anchor.route).toBe("/settings");
    expect(JSON.stringify(annotation)).not.toContain("oauth-secret");
    window.history.replaceState(null, "", "/");
  });

  it("hides the toggle control when asked", async () => {
    await render({ showToggle: false, shortcut: null });
    expect(document.querySelector("[data-riffrec-draw-toggle]")).toBeNull();
  });
});

describe("shortcuts", () => {
  it("parses modifier combinations and rejects malformed strings", () => {
    expect(parseShortcut(DEFAULT_DRAW_SHORTCUT)).toEqual({ key: "d", alt: true, ctrl: false, meta: false, shift: true, mod: false });
    expect(parseShortcut("mod+k")).toEqual({ key: "k", alt: false, ctrl: false, meta: false, shift: false, mod: true });
    expect(parseShortcut("Ctrl+Alt+F2")).toEqual({ key: "f2", alt: true, ctrl: true, meta: false, shift: false, mod: false });
    expect(parseShortcut("Alt+")).toBeNull();
    expect(parseShortcut("A+B")).toBeNull();
    expect(parseShortcut("Shift")).toBeNull();
  });

  it("matches by key or physical code so Option-modified keys still work", () => {
    const parsed = parseShortcut("Alt+Shift+D")!;
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "∂", code: "KeyD", altKey: true, shiftKey: true }), parsed)).toBe(true);
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "d", code: "KeyD", altKey: true }), parsed)).toBe(false);
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "D", code: "KeyD", altKey: true, shiftKey: true, ctrlKey: true }), parsed)).toBe(false);
  });

  it("exposes a programmatic toggle and unbinds on dispose", () => {
    const onChange = vi.fn();
    const target = new EventTarget();
    const toggle = createDrawToggle({ shortcut: "Alt+Shift+D", target, onChange });

    expect(toggle.toggle()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    toggle.setActive(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    toggle.sync(false);
    expect(toggle.isActive()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);

    const press = () =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "D", code: "KeyD", altKey: true, shiftKey: true, cancelable: true }));
    press();
    expect(toggle.isActive()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    toggle.dispose();
    press();
    expect(toggle.isActive()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores modifier-free shortcuts while typing in a field", () => {
    const onChange = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const toggle = createDrawToggle({ shortcut: "d", target: window, onChange });

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(true);

    toggle.dispose();
    input.remove();
  });
});

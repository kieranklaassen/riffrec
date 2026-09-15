// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildSelector } from "../../capture/element";
import type { ElementBoundingBox } from "../../types";
import type { LivePoint } from "../contract";
import {
  OVERLAY_ATTRIBUTE,
  anchorStroke,
  buildAnchor,
  computeBbox,
  intersectionArea,
  rectContains,
  resolvePointTarget,
  resolveStrokeTarget
} from "./strokeAnchor";

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

function stubHitTest(resolve: (point: LivePoint) => Element[]): void {
  (document as HitTestDocument).elementsFromPoint = (x, y) => resolve({ x, y });
}

function clearHitTest(): void {
  delete (document as HitTestDocument).elementsFromPoint;
}

function mount(html: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "app-shell";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  setRect(wrapper, { x: 0, y: 0, width: 1024, height: 768 });
  return wrapper;
}

afterEach(() => {
  document.body.innerHTML = "";
  clearHitTest();
});

describe("computeBbox", () => {
  it("returns the tight bounds of the points", () => {
    expect(computeBbox([{ x: 10, y: 40 }, { x: 30, y: 20 }, { x: 25, y: 60 }])).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 40
    });
  });

  it("returns an empty rect for no points", () => {
    expect(computeBbox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("rect helpers", () => {
  it("measures intersection and containment", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    expect(intersectionArea(a, b)).toBe(2500);
    expect(intersectionArea(a, { x: 200, y: 0, width: 10, height: 10 })).toBe(0);
    expect(rectContains(a, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
    expect(rectContains(a, b)).toBe(false);
    expect(rectContains(a, { x: -2, y: 0, width: 50, height: 50 }, 4)).toBe(true);
  });
});

describe("resolveStrokeTarget", () => {
  it("anchors a closed stroke around a card to the card, not the child under the centroid (AE4)", () => {
    const wrapper = mount(
      '<section class="card" id="pricing-card"><h2 class="card-title">Pro</h2><p class="card-body">$12/mo</p></section>'
    );
    const card = wrapper.querySelector("#pricing-card")!;
    const title = wrapper.querySelector(".card-title")!;
    const body = wrapper.querySelector(".card-body")!;
    setRect(card, { x: 100, y: 100, width: 200, height: 120 });
    setRect(title, { x: 110, y: 110, width: 180, height: 40 });
    setRect(body, { x: 110, y: 160, width: 180, height: 40 });
    stubHitTest(() => [title, card, wrapper, document.body, document.documentElement]);

    const loop: LivePoint[] = [
      { x: 90, y: 90 },
      { x: 310, y: 92 },
      { x: 312, y: 232 },
      { x: 88, y: 230 },
      { x: 90, y: 90 }
    ];

    expect(resolveStrokeTarget(loop)).toBe(card);

    const anchor = anchorStroke(loop, { route: "/pricing", t: 4200 });
    expect(anchor.selector).toBe(buildSelector(card));
    expect(document.querySelector(anchor.selector)).toBe(card);
    expect(anchor.rect).toEqual({ x: 100, y: 100, width: 200, height: 120 });
    expect(anchor.route).toBe("/pricing");
    expect(anchor.t).toBe(4200);
    expect(rectContains(computeBbox(loop), anchor.rect)).toBe(true);
  });

  it("keeps the element under the centroid when the stroke does not enclose its parent", () => {
    const wrapper = mount('<section class="card"><button class="cta">Buy</button></section>');
    const card = wrapper.querySelector(".card")!;
    const button = wrapper.querySelector(".cta")!;
    setRect(card, { x: 100, y: 100, width: 200, height: 120 });
    setRect(button, { x: 120, y: 160, width: 80, height: 32 });
    stubHitTest(() => [button, card, wrapper, document.body]);

    const scribble: LivePoint[] = [{ x: 115, y: 155 }, { x: 150, y: 180 }, { x: 205, y: 195 }];
    expect(resolveStrokeTarget(scribble)).toBe(button);
  });

  it("anchors a stroke across two elements to the one with the largest overlap", () => {
    const wrapper = mount(
      '<div class="row"><button class="left">Left</button><button class="right">Right</button></div>'
    );
    const row = wrapper.querySelector(".row")!;
    const left = wrapper.querySelector(".left")!;
    const right = wrapper.querySelector(".right")!;
    setRect(row, { x: 0, y: 0, width: 200, height: 100 });
    setRect(left, { x: 0, y: 0, width: 100, height: 100 });
    setRect(right, { x: 100, y: 0, width: 100, height: 100 });
    stubHitTest(() => []);

    const across: LivePoint[] = [{ x: 60, y: 40 }, { x: 100, y: 50 }, { x: 150, y: 60 }];
    expect(resolveStrokeTarget(across)).toBe(right);

    const acrossLeftHeavy: LivePoint[] = [{ x: 20, y: 40 }, { x: 100, y: 50 }, { x: 130, y: 60 }];
    expect(resolveStrokeTarget(acrossLeftHeavy)).toBe(left);
  });

  it("falls back to the deepest container when the stroke sits inside a single element", () => {
    const wrapper = mount('<main class="page"><section class="panel"></section></main>');
    const page = wrapper.querySelector(".page")!;
    const panel = wrapper.querySelector(".panel")!;
    setRect(page, { x: 0, y: 0, width: 1024, height: 768 });
    setRect(panel, { x: 200, y: 200, width: 400, height: 300 });
    stubHitTest(() => []);

    expect(resolveStrokeTarget([{ x: 250, y: 250 }, { x: 300, y: 280 }, { x: 260, y: 320 }])).toBe(panel);
  });

  it("never anchors to overlay-owned nodes or document chrome", () => {
    const wrapper = mount(
      `<div ${OVERLAY_ATTRIBUTE}=""><svg class="surface"></svg></div><button class="under">Under</button>`
    );
    const surface = wrapper.querySelector(".surface")!;
    const under = wrapper.querySelector(".under")!;
    setRect(surface, { x: 0, y: 0, width: 1024, height: 768 });
    setRect(under, { x: 10, y: 10, width: 50, height: 20 });
    stubHitTest(() => [surface, under, wrapper, document.body, document.documentElement]);

    expect(resolvePointTarget({ x: 20, y: 20 })).toBe(under);
    expect(resolveStrokeTarget([{ x: 12, y: 12 }, { x: 40, y: 25 }])).toBe(under);
  });

  it("returns a route-only fallback anchor when nothing is hit", () => {
    stubHitTest(() => []);
    const anchor = anchorStroke([{ x: 5, y: 5 }, { x: 15, y: 15 }], { route: "/", t: 1 });
    expect(anchor).toEqual({
      route: "/",
      selector: "body",
      component: null,
      rect: { x: 5, y: 5, width: 10, height: 10 },
      t: 1
    });
  });
});

describe("buildAnchor", () => {
  it("records selector, component from data-component, rect, route, and time", () => {
    const wrapper = mount('<div data-component="SidebarToggle"><button id="toggle">Menu</button></div>');
    const button = wrapper.querySelector("#toggle")!;
    setRect(button, { x: 24, y: 96, width: 40, height: 40 });

    expect(buildAnchor(button, { route: "/settings", t: 12120 })).toEqual({
      route: "/settings",
      selector: buildSelector(button),
      component: "SidebarToggle",
      rect: { x: 24, y: 96, width: 40, height: 40 },
      t: 12120
    });
  });
});

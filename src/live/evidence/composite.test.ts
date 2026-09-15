import { describe, expect, it, vi } from "vitest";
import type { LiveAnnotation, LiveFrame } from "../contract";
import { CompositeRenderer, type CompositeInput } from "./composite";

const base: LiveFrame = { id: "frame_base", t: 1000, route: "/settings", kind: "gesture", jpeg_base64: "base" };

function stroke(id: string, x: number): LiveAnnotation {
  return {
    id,
    kind: "stroke",
    points: [{ x, y: 0 }, { x: x + 5, y: 5 }],
    bbox: { x, y: 0, width: 5, height: 5 },
    anchor: { route: "/settings", selector: `#${id}`, rect: { x, y: 0, width: 5, height: 5 }, t: 1000 }
  };
}

function harness(draw?: (input: CompositeInput) => Promise<string | null>) {
  let ids = 0;
  let clock = 1500;
  const frames: LiveFrame[] = [];
  const drawn: CompositeInput[] = [];
  const renderer = new CompositeRenderer({
    now: () => clock,
    route: () => "/settings",
    createId: () => `frame_c${++ids}`,
    draw:
      draw ??
      (async (input) => {
        drawn.push(input);
        return `composite:${input.annotations.map((annotation) => annotation.id).join("+")}`;
      }),
    onFrame: (frame) => frames.push(frame)
  });
  return {
    renderer,
    frames,
    drawn,
    tick(ms: number) {
      clock += ms;
    }
  };
}

describe("CompositeRenderer", () => {
  it("renders the base frame plus the annotation into a composite that cross-references it", async () => {
    const h = harness();

    const result = await h.renderer.render(stroke("ann_1", 0), base);

    expect(result?.frame).toEqual({ id: "frame_c1", t: 1500, route: "/settings", kind: "composite", jpeg_base64: "composite:ann_1" });
    expect(result?.annotation.composite_frame_id).toBe("frame_c1");
    expect(h.frames).toEqual([result?.frame]);
    expect(h.drawn[0].base).toBe(base);
  });

  it("two annotations completing 10 ms apart produce two composites with the correct strokes each and distinct ids", async () => {
    const h = harness();
    const first = h.renderer.render(stroke("ann_1", 0), base);
    h.tick(10);
    const second = h.renderer.render(stroke("ann_2", 40), base);
    expect(h.renderer.pending).toBe(2);

    const [a, b] = await Promise.all([first, second]);

    expect(a?.frame.id).not.toBe(b?.frame.id);
    expect(a?.frame.jpeg_base64).toBe("composite:ann_1");
    expect(b?.frame.jpeg_base64).toBe("composite:ann_2");
    expect(a?.frame.t).toBe(1500);
    expect(b?.frame.t).toBe(1510);
    expect(h.drawn.map((input) => input.annotations.map((annotation) => annotation.id))).toEqual([["ann_1"], ["ann_2"]]);
    expect(h.renderer.pending).toBe(0);
  });

  it("serializes renders so a slow composite finishes before the next starts", async () => {
    const order: string[] = [];
    const h = harness(async (input) => {
      const id = input.annotations[0].id;
      order.push(`start:${id}`);
      await new Promise((resolve) => setTimeout(resolve, id === "ann_1" ? 20 : 0));
      order.push(`end:${id}`);
      return id;
    });

    await Promise.all([h.renderer.render(stroke("ann_1", 0), base), h.renderer.render(stroke("ann_2", 0), base)]);

    expect(order).toEqual(["start:ann_1", "end:ann_1", "start:ann_2", "end:ann_2"]);
  });

  it("produces nothing without a base frame (no display stream)", async () => {
    const h = harness();

    expect(await h.renderer.render(stroke("ann_1", 0), null)).toBeNull();
    expect(h.frames).toEqual([]);
    expect(h.drawn).toEqual([]);
  });

  it("reports a failing drawer, yields null, and keeps the queue moving", async () => {
    const onError = vi.fn();
    let failNext = true;
    const renderer = new CompositeRenderer({
      now: () => 0,
      route: () => "/",
      createId: () => "frame_x",
      draw: async () => {
        if (failNext) {
          failNext = false;
          throw new Error("no canvas");
        }
        return "ok";
      },
      onError
    });

    expect(await renderer.render(stroke("ann_1", 0), base)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect((await renderer.render(stroke("ann_2", 0), base))?.frame.jpeg_base64).toBe("ok");
    await renderer.idle();
    expect(renderer.pending).toBe(0);
  });

  it("returns null after dispose", async () => {
    const h = harness();
    h.renderer.dispose();
    expect(await h.renderer.render(stroke("ann_1", 0), base)).toBeNull();
  });
});

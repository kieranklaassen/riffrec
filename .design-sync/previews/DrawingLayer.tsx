import { DrawingLayer } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};

const anchor = {
  route: "/settings/billing",
  selector: "main > section.plan-card",
  component: "PlanCard",
  rect: { x: 48, y: 72, width: 360, height: 180 },
  t: 4200
};

// A hand-drawn loop around the plan card's price.
const loop = Array.from({ length: 40 }, (_, i) => {
  const a = (i / 39) * Math.PI * 2.15 - Math.PI / 2;
  return { x: 170 + Math.cos(a) * 112 * (1 + i * 0.004), y: 130 + Math.sin(a) * 38, pressure: 0.5 };
});

// An underline under the upgrade button.
const underline = Array.from({ length: 16 }, (_, i) => ({ x: 72 + i * 7, y: 222 + Math.sin(i / 2) * 2, pressure: 0.5 }));

const bbox = (points: { x: number; y: number }[]) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

const annotations = [
  { id: "ann_1", kind: "stroke" as const, points: loop, bbox: bbox(loop), anchor },
  { id: "ann_2", kind: "stroke" as const, points: underline, bbox: bbox(underline), anchor },
  { id: "ann_3", kind: "pin" as const, points: [{ x: 372, y: 96 }], bbox: { x: 372, y: 96, width: 0, height: 0 }, anchor, text: "Too much padding here" }
];

// The layer is a fixed full-viewport surface; the transformed stage contains it
// and stands in for the host page underneath.
const Stage = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      position: "relative",
      transform: "translateZ(0)",
      height: 360,
      background: "#f9fafb",
      overflow: "hidden",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      color: "#101828"
    }}
  >
    <div style={{ position: "absolute", left: 48, top: 24, fontSize: 18, fontWeight: 600 }}>Billing</div>
    <div
      style={{
        position: "absolute",
        left: 48,
        top: 72,
        width: 360,
        height: 180,
        background: "#ffffff",
        border: "1px solid #eaecf0",
        borderRadius: 10,
        padding: 20,
        boxSizing: "border-box"
      }}
    >
      <div style={{ fontSize: 12, color: "#667085" }}>Current plan</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>Team · $48/mo</div>
      <div style={{ marginTop: 40, display: "inline-block", padding: "6px 12px", borderRadius: 6, background: "#f2f4f7", fontSize: 13 }}>
        Upgrade
      </div>
    </div>
    {children}
  </div>
);

export const Drawing = () => (
  <Stage>
    <DrawingLayer annotations={annotations} onAnnotation={noop} active shortcut={null} />
  </Stage>
);

export const Idle = () => (
  <Stage>
    <DrawingLayer annotations={annotations} onAnnotation={noop} active={false} shortcut={null} />
  </Stage>
);

export const EmptyActive = () => (
  <Stage>
    <DrawingLayer annotations={[]} onAnnotation={noop} active shortcut={null} />
  </Stage>
);

import { Pin } from "riffrec";

const anchor = {
  route: "/settings/billing",
  selector: "main > section.plan-card",
  component: "PlanCard",
  rect: { x: 0, y: 0, width: 320, height: 160 },
  t: 4200
};

const pin = (id: string, x: number, y: number, text?: string) => ({
  id,
  kind: "pin" as const,
  points: [{ x, y }],
  bbox: { x, y, width: 0, height: 0 },
  anchor,
  ...(text ? { text } : {})
});

// Pins are SVG groups drawn by the DrawingLayer over the page.
export const OnACard = () => (
  <div style={{ position: "relative", width: 320, height: 160 }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#ffffff",
        border: "1px solid #eaecf0",
        borderRadius: 10,
        padding: 16,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        color: "#101828",
        boxSizing: "border-box"
      }}
    >
      <div style={{ fontSize: 12, color: "#667085" }}>Current plan</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>Team · $48/mo</div>
      <div style={{ marginTop: 28, display: "inline-block", padding: "6px 12px", borderRadius: 6, background: "#f2f4f7", fontSize: 13 }}>
        Upgrade
      </div>
    </div>
    <svg width={320} height={160} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <Pin annotation={pin("ann_1", 170, 40, "Price should be bigger")} index={1} />
      <Pin annotation={pin("ann_2", 96, 118, "Make this the primary button")} index={2} />
      <Pin annotation={pin("ann_3", 292, 22)} index={3} />
    </svg>
  </div>
);

export const Numbering = () => (
  <svg width={220} height={48} style={{ overflow: "visible" }}>
    {[1, 2, 9, 12].map((index, i) => (
      <Pin key={index} annotation={pin(`ann_${index}`, 24 + i * 56, 24)} index={index} />
    ))}
  </svg>
);

import { LiveOverlay, LiveSession } from "riffrec";

import { useState, type ReactNode } from "react";

const noop = () => {};

// No endpoint, no storage, no pagehide: the session renders without touching the network.
const makeSession = () =>
  LiveSession.create({ endpoint: null, bootstrap: null, storage: null, pageHideTarget: null, mode: "smart" });

const anchors = (component: string, selector: string) => [
  { route: "/settings/billing", selector, component, rect: { x: 320, y: 184, width: 240, height: 40 }, t: 4200 }
];

const running = (withUnits: boolean) => {
  const session = makeSession();
  session.start();
  session.voiceUnavailable({ kind: "refused", reason: "no_key", status: 503 });
  if (withUnits) {
    session.recordUnit({
      statement: "Make the upgrade button stand out more",
      transcript_excerpt: "make the upgrade button stand out more",
      anchors: anchors("PlanCard", "main > section.plan-card button")
    });
    session.recordUnit({
      statement: "The invoice table is too cramped on the right",
      transcript_excerpt: "the invoice table is too cramped",
      anchors: anchors("InvoiceTable", "table.invoices")
    });
  }
  return session;
};

// The overlay's panel is fixed top-right; the transformed stage contains it and
// stands in for the host page.
const Stage = ({ children, height = 560 }: { children: ReactNode; height?: number }) => (
  <div
    style={{
      position: "relative",
      transform: "translateZ(0)",
      height,
      background: "#f9fafb",
      overflow: "hidden",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      color: "#101828"
    }}
  >
    <div style={{ position: "absolute", left: 32, top: 24, fontSize: 18, fontWeight: 600 }}>Billing</div>
    <div
      style={{
        position: "absolute",
        left: 32,
        top: 64,
        width: 360,
        height: 160,
        background: "#ffffff",
        border: "1px solid #eaecf0",
        borderRadius: 10
      }}
    />
    {children}
  </div>
);

export const LiveBoard = () => {
  const [session] = useState(() => running(true));
  return (
    <Stage>
      <LiveOverlay session={session} drawShortcut={null} onRetryVoice={noop} />
    </Stage>
  );
};

export const JustStarted = () => {
  const [session] = useState(() => running(false));
  return (
    <Stage height={320}>
      <LiveOverlay session={session} drawShortcut={null} />
    </Stage>
  );
};

export const Collapsed = () => {
  const [session] = useState(() => running(true));
  return (
    <Stage height={160}>
      <LiveOverlay session={session} drawShortcut={null} defaultCollapsed />
    </Stage>
  );
};

export const Consent = () => {
  const [session] = useState(() => {
    const s = makeSession();
    s.beginConsent();
    return s;
  });
  return (
    <Stage height={680}>
      <LiveOverlay session={session} drawShortcut={null} getUserMedia={() => new Promise<MediaStream>(() => {})} />
    </Stage>
  );
};

export const NextSession = () => {
  const [session] = useState(makeSession);
  return (
    <Stage height={160}>
      <LiveOverlay
        session={session}
        drawShortcut={null}
        nextSession={{ state: "ready", endpoint: "https://polish-7f3a.trycloudflare.com" }}
        onStartNext={noop}
      />
    </Stage>
  );
};

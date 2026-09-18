import { LiveIndicator } from "riffrec";

import type { ReactNode } from "react";

// LiveIndicator inherits its font from the overlay panel header it sits in.
const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      padding: "10px 12px",
      background: "#ffffff",
      border: "1px solid #eaecf0",
      borderRadius: 10,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 13,
      color: "#101828",
      width: "fit-content"
    }}
  >
    {children}
  </div>
);
const endpoint = "https://polish-7f3a.trycloudflare.com";

export const Streaming = () => (
  <Panel>
    <LiveIndicator status="live" muted={false} mic="granted" endpoint={endpoint} />
  </Panel>
);

export const VoiceOff = () => (
  <Panel>
    <LiveIndicator
      status="live_novoice"
      muted={false}
      endpoint={endpoint}
      voiceUnavailable={{ kind: "refused", reason: "no_key", status: 503 }}
    />
  </Panel>
);

export const MutedAndPaused = () => (
  <Panel>
    <LiveIndicator status="live" muted mic="muted" endpoint={endpoint} />
    <LiveIndicator status="live" muted={false} paused endpoint={endpoint} />
  </Panel>
);

export const Transitional = () => (
  <Panel>
    <LiveIndicator status="connecting" muted={false} endpoint={endpoint} />
    <LiveIndicator status="reconnecting" muted={false} endpoint={endpoint} />
    <LiveIndicator status="buffering" muted={false} endpoint={endpoint} />
  </Panel>
);

export const Problems = () => (
  <Panel>
    <LiveIndicator status="incompatible" muted={false} expectedSchemaVersion="riffrec.live/2" />
    <LiveIndicator status="error" muted={false} error={{ reason: "unauthorized", message: "the endpoint rejected this page's token" }} />
    <LiveIndicator status="ended" muted={false} />
  </Panel>
);

export const CompactPills = () => (
  <Panel>
    <LiveIndicator compact status="live" muted={false} endpoint={endpoint} />
    <LiveIndicator compact status="live_novoice" muted={false} endpoint={endpoint} />
    <LiveIndicator compact status="buffering" muted={false} endpoint={endpoint} />
  </Panel>
);

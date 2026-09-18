import { ModeSwitch } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};

// ModeSwitch inherits its font from the overlay panel toolbar.
const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 14,
      padding: 12,
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

export const Modes = () => (
  <Panel>
    <ModeSwitch mode="instant" pendingMode={null} onChange={noop} />
    <ModeSwitch mode="smart" pendingMode={null} onChange={noop} />
    <ModeSwitch mode="collect" pendingMode={null} onChange={noop} />
  </Panel>
);

export const PendingSwitch = () => (
  <Panel>
    <ModeSwitch mode="collect" pendingMode="collect" onChange={noop} />
  </Panel>
);

export const Disabled = () => (
  <Panel>
    <ModeSwitch mode="smart" pendingMode={null} onChange={noop} disabled />
  </Panel>
);

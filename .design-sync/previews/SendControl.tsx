import { SendControl } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};
const send = () => Promise.resolve(true);

// SendControl inherits its font from the overlay panel footer.
const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
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

export const HeldUnits = () => (
  <Panel>
    <SendControl onSend={send} onDone={noop} heldCount={3} />
  </Panel>
);

export const NothingHeld = () => (
  <Panel>
    <SendControl onSend={send} onDone={noop} />
  </Panel>
);

export const Disabled = () => (
  <Panel>
    <SendControl onSend={send} onDone={noop} heldCount={2} disabled />
  </Panel>
);

export const CompactPill = () => (
  <Panel>
    <SendControl onSend={send} heldCount={1} compact />
  </Panel>
);

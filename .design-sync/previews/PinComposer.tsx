import { PinComposer } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};

// The composer is position: fixed at the pin; the transformed stage contains it.
const Stage = ({ children }: { children: ReactNode }) => (
  <div style={{ position: "relative", transform: "translateZ(0)", width: 320, height: 200 }}>{children}</div>
);

const upgradeButton = () => {
  const button = document.createElement("button");
  button.textContent = "Upgrade to Business";
  return button;
};

export const OnAnElement = () => (
  <Stage>
    <PinComposer point={{ x: -8, y: -8 }} target={upgradeButton()} onSubmit={noop} onCancel={noop} />
  </Stage>
);

export const WithDraft = () => (
  <Stage>
    <PinComposer
      point={{ x: -8, y: -8 }}
      target={upgradeButton()}
      initialValue="Make this the primary button and move it above the fold"
      onSubmit={noop}
      onCancel={noop}
    />
  </Stage>
);

export const OpenSpot = () => (
  <Stage>
    <PinComposer point={{ x: -8, y: -8 }} target={null} onSubmit={noop} onCancel={noop} />
  </Stage>
);

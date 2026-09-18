import { ConsentDialog } from "riffrec";

import type { ReactNode } from "react";

const noop = () => {};
const getUserMedia = () => new Promise<MediaStream>(() => {});

// The dialog is a fixed full-viewport backdrop; the transformed stage contains it.
const Stage = ({ children, height = 680 }: { children: ReactNode; height?: number }) => (
  <div style={{ position: "relative", transform: "translateZ(0)", height, background: "#f9fafb", overflow: "hidden" }}>
    {children}
  </div>
);

export const VoiceAndStream = () => (
  <Stage height={860}>
    <ConsentDialog
      endpoint="https://polish-7f3a.trycloudflare.com"
      endpointOwner="ce-polish on Kieran's laptop"
      voice
      profile={{ transcript: true, strokes: true, frames: true }}
      getUserMedia={getUserMedia}
      onAccept={noop}
      onDecline={noop}
    />
  </Stage>
);

export const StreamWithoutVoice = () => (
  <Stage>
    <ConsentDialog
      endpoint="http://127.0.0.1:4317"
      voice={false}
      profile={{ transcript: true, strokes: true, frames: false }}
      getUserMedia={getUserMedia}
      onAccept={noop}
      onDecline={noop}
    />
  </Stage>
);

export const LocalOnly = () => (
  <Stage>
    <ConsentDialog endpoint={null} voice={false} getUserMedia={getUserMedia} onAccept={noop} onDecline={noop} />
  </Stage>
);

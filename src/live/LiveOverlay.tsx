import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { RiffrecLiveConfig, RiffrecSessionOptions } from "../types";
import type { ExecutionMode } from "./contract";
import { LiveRuntime, type LiveCaptureConfig, type LiveStopResult } from "./liveRuntime";
import { LiveOverlay as LiveOverlayPanel } from "./overlay/LiveOverlay";
import { OVERLAY_ATTRIBUTE } from "./overlay/strokeAnchor";
import type { LiveSession, LiveSessionSnapshot } from "./session";

/**
 * The lazy-loaded live subtree (KTD1). `RiffrecProvider` renders this through
 * `React.lazy` only when `live` is configured and the production guard allows,
 * so hosts without live mode ship none of `src/live/`.
 */

/** What the provider drives once the chunk has loaded. */
export interface LiveHandle {
  begin: (options?: RiffrecSessionOptions) => void;
  stop: () => Promise<LiveStopResult | null>;
  setMode: (mode: ExecutionMode) => void;
  setMuted: (muted: boolean) => void;
  send: () => Promise<boolean>;
}

export interface LiveMountProps {
  config: RiffrecLiveConfig;
  capture: LiveCaptureConfig;
  onHandle: (handle: LiveHandle | null) => void;
  onSnapshot: (snapshot: LiveSessionSnapshot) => void;
  onEnded: () => void;
  onError: (error: Error) => void;
  /** Test seams, threaded through to the runtime. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch?: typeof fetch;
}

const resharePromptStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 24,
  transform: "translateX(-50%)",
  zIndex: 2147483001,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#101828",
  color: "#ffffff",
  boxShadow: "0 16px 48px rgba(16, 24, 40, 0.3)",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  pointerEvents: "auto"
};

const reshareButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.3)",
  borderRadius: 6,
  background: "#ffffff",
  color: "#101828",
  font: "inherit",
  fontWeight: 600,
  padding: "5px 10px",
  cursor: "pointer"
};

const reshareDismissStyle: CSSProperties = {
  ...reshareButtonStyle,
  background: "transparent",
  color: "#ffffff"
};

export default function LiveMount({
  config,
  capture,
  onHandle,
  onSnapshot,
  onEnded,
  onError,
  getUserMedia,
  fetch: fetchImpl
}: LiveMountProps) {
  const runtimeRef = useRef<LiveRuntime | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [reshareNeeded, setReshareNeeded] = useState(false);

  const callbacks = useRef({ onHandle, onSnapshot, onEnded, onError });
  callbacks.current = { onHandle, onSnapshot, onEnded, onError };
  const captureRef = useRef(capture);
  captureRef.current = capture;

  useEffect(() => {
    // Assigned below; the constructor already reports the first snapshot synchronously.
    let runtime: LiveRuntime | null = null;
    runtime = new LiveRuntime({
      config,
      capture: captureRef.current,
      getUserMedia,
      fetch: fetchImpl,
      callbacks: {
        onSnapshot: (snapshot) => {
          if (runtime) setSession(runtime.session);
          callbacks.current.onSnapshot(snapshot);
        },
        onEnded: () => callbacks.current.onEnded(),
        onReshareNeeded: setReshareNeeded,
        onError: (error) => callbacks.current.onError(error)
      }
    });
    const created = runtime;
    runtimeRef.current = created;
    setSession(created.session);
    callbacks.current.onHandle({
      begin: (options) => created.begin(options),
      stop: () => created.stop(),
      setMode: (mode) => created.setMode(mode),
      setMuted: (muted) => created.setMuted(muted),
      send: () => created.send()
    });
    return () => {
      callbacks.current.onHandle(null);
      created.suspend();
      runtimeRef.current = null;
    };
    // The runtime lives for the mount; a changed config applies to the next mount.
  }, []);

  const handlePause = useCallback((paused: boolean) => runtimeRef.current?.setPaused(paused), []);

  if (!session) return null;
  const runtime = runtimeRef.current;

  return (
    <>
      <LiveOverlayPanel
        session={session}
        profile={runtime?.consentProfile}
        endpointOwner={config.endpointOwner}
        drawShortcut={config.drawShortcut}
        getUserMedia={getUserMedia}
        onConsent={(result) => runtime?.consent(result)}
        onAnnotation={runtime?.annotation}
        onFinished={(result) => runtime?.finished(result)}
        onPauseChange={handlePause}
      />
      {reshareNeeded && runtime ? (
        <div
          {...{ [OVERLAY_ATTRIBUTE]: "" }}
          role="status"
          aria-live="polite"
          data-riffrec-live-reshare=""
          style={resharePromptStyle}
        >
          <span>The page reloaded. Share your screen again to keep recording.</span>
          <button type="button" style={reshareButtonStyle} onClick={() => void runtime.reshare()}>
            Share screen
          </button>
          <button type="button" style={reshareDismissStyle} onClick={() => runtime.dismissReshare()}>
            Not now
          </button>
        </div>
      ) : null}
    </>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ExecutionMode, LiveAnnotation, LiveUnit } from "../contract";
import type { FinishResult, LiveSession, LiveSessionSnapshot } from "../session";
import { Board, ConfirmationPass, type ConfirmationMap } from "./Board";
import { ConsentDialog, type ConsentResult } from "./ConsentDialog";
import { DrawingLayer } from "./DrawingLayer";
import { EndedCard } from "./EndedCard";
import { LiveIndicator } from "./LiveIndicator";
import { ModeSwitch } from "./ModeSwitch";
import { SendControl } from "./SendControl";
import type { ConsentEvidenceProfile } from "./consentCopy";
import { DEFAULT_DRAW_SHORTCUT } from "./shortcuts";
import { OVERLAY_ATTRIBUTE } from "./strokeAnchor";

export interface LiveOverlayProps {
  session: LiveSession;
  /** Consent-relevant view of the evidence profile; defaults to the R19 starting default. */
  profile?: Partial<ConsentEvidenceProfile>;
  /** Named endpoint owner for the consent copy (R26). */
  endpointOwner?: string;
  /** `live.drawShortcut` (I5); `null` disables the keyboard binding. */
  drawShortcut?: string | null;
  /** Route recorded on anchors; defaults to the current pathname. */
  route?: string;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Consent accepted: the shared microphone stream (or `null` when denied) for the voice and recording consumers. */
  onConsent?: (result: ConsentResult) => void;
  onDecline?: () => void;
  /** Completed stroke or pin; defaults to `session.addAnnotation`. Evidence capture (U6) may wrap this. */
  onAnnotation?: (annotation: LiveAnnotation) => void;
  /** Done flow finished: the `final` checkpoint left, and the endpoint did or did not end the session. */
  onFinished?: (result: FinishResult) => void;
  /** Controlled pause of frame and stream capture (R25); uncontrolled when omitted. */
  paused?: boolean;
  onPauseChange?: (paused: boolean) => void;
  residualHint?: string;
  zIndex?: number;
  defaultCollapsed?: boolean;
  /** Clock for `anchor.t`; defaults to milliseconds since `session.startedAt`. */
  now?: () => number;
}

export function useLiveSnapshot(session: LiveSession): LiveSessionSnapshot {
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot>(() => session.snapshot());
  useEffect(() => {
    setSnapshot(session.snapshot());
    return session.subscribe(setSnapshot);
  }, [session]);
  return snapshot;
}

const PANEL_WIDTH = 320;
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: PANEL_WIDTH,
  maxHeight: "calc(100vh - 32px)",
  display: "flex",
  flexDirection: "column",
  background: "#f9fafb",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 10,
  boxShadow: "0 16px 48px rgba(16, 24, 40, 0.22)",
  fontFamily: FONT,
  fontSize: 13,
  pointerEvents: "auto",
  overflow: "hidden"
};

const pillStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px 6px 12px",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 999,
  boxShadow: "0 8px 24px rgba(16, 24, 40, 0.18)",
  fontFamily: FONT,
  fontSize: 13,
  pointerEvents: "auto"
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid #eaecf0",
  background: "#ffffff"
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid #eaecf0",
  flexWrap: "wrap"
};

const bodyStyle: CSSProperties = {
  padding: 12,
  overflowY: "auto",
  flex: 1,
  minHeight: 0
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 12px",
  borderTop: "1px solid #eaecf0",
  background: "#ffffff"
};

const iconButtonStyle: CSSProperties = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 8px",
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const iconButtonPressedStyle: CSSProperties = {
  ...iconButtonStyle,
  background: "#d92d20",
  borderColor: "#d92d20",
  color: "#ffffff"
};

const endedWrapStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  pointerEvents: "auto"
};

type PanelView = "board" | "confirming";

/** Instant guesses and agent notes the store keeps beside the units, keyed by unit id. */
function agentNotes(snapshot: LiveSessionSnapshot, session: LiveSession) {
  const guesses: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const unit of snapshot.units) {
    const guess = session.guessFor(unit.id);
    if (guess) guesses[unit.id] = guess;
    const note = session.noteFor(unit.id);
    if (note) notes[unit.id] = note;
  }
  return { guesses, notes };
}

/**
 * The riffer-facing live surface (U5): consent, then a panel docked to the
 * right edge with the indicator, the mode switch, the draw toggle, the board,
 * Send and Done; collapsible to a pill with the indicator and Send. The whole
 * panel carries `OVERLAY_ATTRIBUTE` so strokes never anchor to it, and it
 * intercepts pointer events only within its own controls.
 */
export function LiveOverlay({
  session,
  profile,
  endpointOwner,
  drawShortcut = DEFAULT_DRAW_SHORTCUT,
  route,
  getUserMedia,
  onConsent,
  onDecline,
  onAnnotation,
  onFinished,
  paused: controlledPaused,
  onPauseChange,
  residualHint,
  zIndex = 2147483000,
  defaultCollapsed = false,
  now
}: LiveOverlayProps) {
  const snapshot = useLiveSnapshot(session);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawing, setDrawing] = useState(false);
  const [view, setView] = useState<PanelView>("board");
  const [finishing, setFinishing] = useState(false);
  const [uncontrolledPaused, setUncontrolledPaused] = useState(false);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const paused = controlledPaused ?? uncontrolledPaused;

  const onPauseChangeRef = useRef(onPauseChange);
  onPauseChangeRef.current = onPauseChange;

  // The overlay outlives a session (U7 keeps it mounted for the ended card), so the next
  // session must not inherit a dismissal, an ended reason or an open confirmation pass.
  useEffect(() => {
    setView("board");
    setEndedReason(null);
    setDismissed(false);
    setUncontrolledPaused(false);
  }, [session]);

  useEffect(() => {
    return session.on("ended", ({ reason }) => setEndedReason(reason ?? "ended"));
  }, [session]);

  const sessionNow = useMemo(() => now ?? (() => Math.max(0, Date.now() - session.startedAt)), [now, session]);

  const handleConsent = useCallback(
    (result: ConsentResult) => {
      if (result.mic === "granted") session.micGranted();
      else session.micDenied();
      session.start();
      onConsent?.(result);
    },
    [session, onConsent]
  );

  const handleDecline = useCallback(() => {
    session.declineConsent();
    onDecline?.();
  }, [session, onDecline]);

  const handleAnnotation = useCallback(
    (annotation: LiveAnnotation) => {
      if (onAnnotation) onAnnotation(annotation);
      else session.addAnnotation(annotation);
    },
    [session, onAnnotation]
  );

  const togglePause = useCallback(() => {
    const next = !paused;
    if (controlledPaused === undefined) setUncontrolledPaused(next);
    onPauseChangeRef.current?.(next);
  }, [paused, controlledPaused]);

  const handleMode = useCallback((mode: ExecutionMode) => session.setMode(mode), [session]);
  const handleSend = useCallback(() => session.send(), [session]);
  const handleWithdraw = useCallback((unitId: string) => void session.withdrawUnit(unitId, "riffer"), [session]);
  const handleAnswer = useCallback((unitId: string, text: string) => void session.answer(unitId, text), [session]);

  // A ref, not state: a second Finish click before React re-renders must not run `finish()` twice.
  const finishInFlight = useRef(false);
  const handleConfirmations = useCallback(
    async (confirmations: ConfirmationMap) => {
      if (finishInFlight.current) return;
      finishInFlight.current = true;
      setFinishing(true);
      try {
        for (const [unitId, confirmation] of Object.entries(confirmations)) {
          session.confirmUnit(unitId, confirmation);
        }
        const result = await session.finish();
        onFinished?.(result);
      } finally {
        finishInFlight.current = false;
        setFinishing(false);
        setView("board");
      }
    },
    [session, onFinished]
  );

  const running = snapshot.phase === "running";

  if (snapshot.phase === "consenting") {
    return (
      <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay="consenting">
        <ConsentDialog
          profile={profile}
          endpoint={snapshot.endpoint}
          endpointOwner={endpointOwner}
          voice={session.hasEndpoint}
          getUserMedia={getUserMedia}
          onAccept={handleConsent}
          onDecline={handleDecline}
          zIndex={zIndex + 2}
        />
      </div>
    );
  }

  if (snapshot.phase === "ended") {
    if (endedReason === "stopped" || dismissed) return null;
    return (
      <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay="ended" style={{ ...endedWrapStyle, zIndex: zIndex + 1 }}>
        <EndedCard units={snapshot.units} reason={endedReason} residualHint={residualHint} onDismiss={() => setDismissed(true)} />
      </div>
    );
  }

  if (snapshot.phase === "idle") return null;

  const { guesses, notes } = agentNotes(snapshot, session);
  const held = session.heldUnits().length;
  const confirmable: LiveUnit[] = snapshot.units.filter((unit) => unit.status !== "withdrawn");
  const errored = snapshot.phase === "error";

  const indicator = (compact: boolean) => (
    <LiveIndicator
      status={snapshot.status}
      muted={snapshot.muted}
      mic={snapshot.mic}
      paused={paused}
      expectedSchemaVersion={snapshot.expectedSchemaVersion}
      endpoint={snapshot.endpoint}
      error={snapshot.error}
      compact={compact}
      onToggleMute={running ? () => session.setMuted(!snapshot.muted) : undefined}
      onTogglePause={running ? togglePause : undefined}
    />
  );

  return (
    <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay={collapsed ? "collapsed" : "expanded"}>
      <DrawingLayer
        annotations={snapshot.annotations}
        onAnnotation={handleAnnotation}
        active={drawing && running}
        onActiveChange={setDrawing}
        shortcut={drawShortcut}
        route={route}
        now={sessionNow}
        showToggle={false}
        zIndex={zIndex}
      />
      {collapsed && view === "board" ? (
        <div data-riffrec-live-pill="" style={{ ...pillStyle, zIndex: zIndex + 1 }}>
          {indicator(true)}
          {running ? (
            <SendControl onSend={handleSend} heldCount={held} onDone={() => setView("confirming")} compact />
          ) : null}
          <button
            type="button"
            data-riffrec-live-expand=""
            aria-label="Expand live panel"
            aria-expanded={false}
            style={iconButtonStyle}
            onClick={() => setCollapsed(false)}
          >
            ▸
          </button>
        </div>
      ) : (
        <div data-riffrec-live-panel="" role="region" aria-label="Riffrec live" style={{ ...panelStyle, zIndex: zIndex + 1 }}>
          <div style={headerStyle}>
            {indicator(false)}
            {view === "board" ? (
              <button
                type="button"
                data-riffrec-live-collapse=""
                aria-label="Collapse live panel"
                aria-expanded={true}
                style={iconButtonStyle}
                onClick={() => setCollapsed(true)}
              >
                ▾
              </button>
            ) : null}
          </div>
          {view === "board" ? (
            <>
              <div style={toolbarStyle}>
                <ModeSwitch mode={snapshot.mode} pendingMode={snapshot.pendingMode} onChange={handleMode} disabled={!running} />
                <button
                  type="button"
                  data-riffrec-draw-toggle=""
                  aria-pressed={drawing && running}
                  aria-label={drawing ? "Stop drawing" : "Draw on the page"}
                  title={drawShortcut ? `Draw (${drawShortcut})` : "Draw"}
                  disabled={!running}
                  style={drawing && running ? iconButtonPressedStyle : iconButtonStyle}
                  onClick={() => setDrawing((current) => !current)}
                >
                  ✎ {drawing && running ? "Drawing" : "Draw"}
                </button>
              </div>
              <div style={bodyStyle}>
                {errored && snapshot.error ? (
                  <p role="alert" data-riffrec-live-error="" style={{ margin: "0 0 10px", color: "#b42318" }}>
                    {snapshot.error.message}
                  </p>
                ) : null}
                <Board
                  units={snapshot.units}
                  questions={snapshot.openQuestions}
                  guesses={guesses}
                  notes={notes}
                  isReleased={(id) => session.isReleased(id)}
                  mode={snapshot.mode}
                  voice={snapshot.voice === "live" || snapshot.voice === "connecting" || snapshot.voice === "reconnecting"}
                  onWithdraw={running ? handleWithdraw : undefined}
                  onAnswer={running ? handleAnswer : undefined}
                />
              </div>
              <div style={footerStyle}>
                <span style={{ fontSize: 11, color: "#667085" }}>
                  {held > 0 ? `${held} held for the next checkpoint` : "Nothing held"}
                </span>
                <SendControl onSend={handleSend} heldCount={held} onDone={() => setView("confirming")} disabled={!running} />
              </div>
            </>
          ) : (
            <div style={bodyStyle}>
              <ConfirmationPass
                units={confirmable}
                busy={finishing}
                onCancel={() => setView("board")}
                onComplete={handleConfirmations}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

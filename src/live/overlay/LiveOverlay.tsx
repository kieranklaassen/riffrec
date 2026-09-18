import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ExecutionMode, LiveAnnotation, LiveUnit } from "../contract";
import type { FinishResult, LiveSession, LiveSessionSnapshot } from "../session";
import { Board, ConfirmationPass, type ConfirmationMap } from "./Board";
import { playAppliedChime } from "./chime";
import { ConsentDialog, type ConsentResult } from "./ConsentDialog";
import { DrawingLayer } from "./DrawingLayer";
import { EndedCard } from "./EndedCard";
import { Kbd, Wordmark } from "./Kbd";
import { KeyPrompt, needsOpenAIKey } from "./KeyPrompt";
import { LiveIndicator, deriveIndicatorState, describeIndicator, voiceUnavailableCause } from "./LiveIndicator";
import { MODE_DESCRIPTIONS, MODE_LABELS, ModeSwitch } from "./ModeSwitch";
import { NextSessionLauncher, type NextSession } from "./NextSessionLauncher";
import { SendControl } from "./SendControl";
import type { ConsentEvidenceProfile } from "./consentCopy";
import { DEFAULT_DRAW_SHORTCUT, isPlainKey } from "./shortcuts";
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
  /** End flow finished: the `final` checkpoint left, and the endpoint did or did not end the session. */
  onFinished?: (result: FinishResult) => void;
  /** Controlled pause of frame and stream capture (R25); uncontrolled when omitted. */
  paused?: boolean;
  onPauseChange?: (paused: boolean) => void;
  /** Re-attempts voice after a refusal, e.g. once the riffer pasted an OpenAI key; the key prompt shows only when set. */
  onRetryVoice?: () => void;
  residualHint?: string;
  /** The remembered link still reaches its endpoint; offers another session once this one is over. */
  nextSession?: NextSession | null;
  onStartNext?: () => void;
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

/** The page tool the toolbar has picked; one at a time, `cursor` leaves the page alone. */
export type PageTool = "cursor" | "draw" | "pin";

const PANEL_WIDTH = 320;
const TOAST_MS = 900;
/** How long a captured mark stays on the page before it fades, and the fade itself. */
const MARK_HOLD_MS = 2000;
const MARK_FADE_MS = 600;
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: PANEL_WIDTH,
  maxHeight: "calc(100vh - 32px)",
  display: "flex",
  flexDirection: "column",
  background: "#fcfcfd",
  color: "#101828",
  border: "1px solid #eaecf0",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.06)",
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
  padding: "6px 6px 6px 12px",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #eaecf0",
  borderRadius: 999,
  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.06)",
  fontFamily: FONT,
  fontSize: 13,
  pointerEvents: "auto"
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 8px 10px 14px",
  background: "#ffffff"
};

const headerButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "#667085",
  font: "inherit",
  fontSize: 12,
  lineHeight: 1,
  cursor: "pointer"
};

const voiceRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "2px 12px 12px",
  background: "#ffffff",
  borderBottom: "1px solid #f2f4f7"
};

const rowButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  height: 32,
  padding: "0 10px",
  border: "1px solid #e4e7ec",
  borderRadius: 7,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#667085"
};

const bodyStyle: CSSProperties = {
  padding: "8px 12px 12px",
  overflowY: "auto",
  flex: 1,
  minHeight: 0
};

const settingsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  borderTop: "1px solid #f2f4f7",
  background: "#f9fafb"
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 8px 8px 12px",
  borderTop: "1px solid #f2f4f7",
  background: "#ffffff"
};

const settingsToggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  border: 0,
  background: "transparent",
  padding: "4px 6px",
  marginLeft: -6,
  borderRadius: 6,
  color: "#667085",
  font: "inherit",
  fontSize: 12,
  whiteSpace: "nowrap",
  cursor: "pointer"
};

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px 10px",
  marginTop: 4,
  paddingTop: 8,
  borderTop: "1px solid #eaecf0",
  fontSize: 11,
  color: "#667085"
};

const hintRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginBottom: 6,
  fontFamily: FONT,
  fontSize: 11,
  color: "#667085"
};

const endedWrapStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  pointerEvents: "auto"
};

const toolbarWrapStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 20,
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  fontFamily: FONT,
  pointerEvents: "none"
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: 4,
  background: "#ffffff",
  border: "1px solid #d0d5dd",
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(16, 24, 40, 0.08)",
  pointerEvents: "auto"
};

const toolButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 8px 0 10px",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer"
};

const captionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  whiteSpace: "nowrap"
};

const toastStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 120,
  transform: "translateX(-50%)",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#101828",
  color: "#ffffff",
  fontFamily: FONT,
  fontSize: 12,
  pointerEvents: "none"
};

const dot = (color: string, halo = false): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: color,
  flex: "none",
  boxShadow: halo ? "0 0 0 3px rgba(18, 183, 106, 0.15)" : undefined
});

const TOOLS: { tool: PageTool; icon: string; label: string; key: string; title: string }[] = [
  { tool: "cursor", icon: "↖", label: "Cursor", key: "V", title: "Cursor: use the page normally (V)" },
  { tool: "draw", icon: "✎", label: "Draw", key: "D", title: "Draw: mark up the page (D)" },
  { tool: "pin", icon: "⌖", label: "Pin", key: "N", title: "Pin: drop a numbered pin (N)" }
];

const TOOL_HINTS: Record<Exclude<PageTool, "cursor">, [string, string]> = {
  draw: ["Draw mode", "drag to circle or underline · Esc for cursor"],
  pin: ["Pin mode", "click to drop a pin, then say what it is about · Esc for cursor"]
};

const LEGEND: [string, string][] = [
  ["V", "cursor"],
  ["D", "draw"],
  ["N", "pin"],
  ["M", "mute"],
  ["S", "send"],
  ["C", "collapse"],
  ["E", "end"],
  ["K", "compound"]
];

type PanelView = "board" | "confirming";

/** Statuses where the agent holds the unit and is doing something with it. */
const BUSY_STATUSES = new Set(["triaging", "accepted", "working"]);

/** Keyframes for the busy bar and the pulsing badges; inline styles cannot declare them. */
const OVERLAY_KEYFRAMES = `
@keyframes riffrec-live-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes riffrec-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes riffrec-live-ring { 0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
@keyframes riffrec-live-rise { 0% { transform: translate(-50%, 0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-50%, -36px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { [data-riffrec-live-busy] * { animation: none !important; } }
`;

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

function voiceRunning(snapshot: LiveSessionSnapshot): boolean {
  return snapshot.voice === "live" || snapshot.voice === "connecting" || snapshot.voice === "reconnecting";
}

/** The header's one-word state: the stream, not the voice (the voice row says how that is doing). */
function streamStatus(snapshot: LiveSessionSnapshot, paused: boolean): { label: string; color: string; halo: boolean } {
  if (paused) return { label: "Paused", color: "#98a2b3", halo: false };
  switch (snapshot.status) {
    case "incompatible":
      return { label: "Incompatible", color: "#d92d20", halo: false };
    case "error":
      return { label: "Error", color: "#d92d20", halo: false };
    case "buffering":
      return { label: "Buffering", color: "#f79009", halo: false };
    default:
      return { label: "Live", color: "#12b76a", halo: true };
  }
}

const COMPOUND_STATEMENT = "/ce-compound: capture the decisions and learnings from this session";
const COMPOUND_MS = 1800;

/**
 * The compounding burst: rings that each double the last, and the count
 * climbing 1 → 2 → 4 → 8 → 16, like interest landing on interest.
 */
function CompoundBurst({ zIndex }: { zIndex: number }) {
  const steps = [1, 2, 4, 8, 16];
  return (
    <div data-riffrec-compound-burst="" aria-hidden="true" style={{ position: "fixed", left: "50%", top: "50%", zIndex, pointerEvents: "none" }}>
      {steps.map((step, index) => (
        <span
          key={step}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 40 * step ** 0.75,
            height: 40 * step ** 0.75,
            borderRadius: "50%",
            border: `${Math.max(1, 3 - index / 2)}px solid rgba(105, 65, 198, ${0.7 - index * 0.1})`,
            animation: `riffrec-live-ring 1.1s cubic-bezier(.2,.7,.3,1) ${index * 0.14}s both`
          }}
        />
      ))}
      {steps.map((step, index) => (
        <span
          key={`n${step}`}
          style={{
            position: "absolute",
            left: 0,
            top: -10,
            fontFamily: FONT,
            fontSize: 12 + index * 3,
            fontWeight: 600,
            color: "#6941c6",
            animation: `riffrec-live-rise 0.7s ease-out ${index * 0.18}s both`
          }}
        >
          {index === steps.length - 1 ? "×16 compounded" : `×${step}`}
        </span>
      ))}
    </div>
  );
}

/** Seconds since `since`, re-rendered every second while shown. */
function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : Math.max(0, Math.round((now - since) / 1000));
}

/** One line of live truth about the agent: what its wait loop is doing right now. */
function AgentStatus({ state, since, working, queued }: { state: "listening" | "working" | "away"; since: number | null; working: number; queued: number }) {
  const elapsed = useElapsed(state === "working" ? since : null);
  const view =
    state === "working"
      ? {
          color: "#6941c6",
          text: `Agent working${working > 0 ? ` on ${working}` : queued > 0 ? ` on ${queued}` : ""}${elapsed !== null ? ` · ${elapsed}s` : ""}`,
          pulse: true
        }
      : state === "listening"
        ? { color: "#12b76a", text: "Agent listening · picks up when you pause", pulse: false }
        : { color: "#98a2b3", text: "Agent not connected · run /ce-polish to pick these up", pulse: false };
  return (
    <div
      data-riffrec-live-agent={state}
      role="status"
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 0", fontSize: 11, color: view.color }}
    >
      <span aria-hidden="true" style={{ ...dot(view.color), ...(view.pulse ? { animation: "riffrec-live-pulse 1.4s ease-in-out infinite" } : {}) }} />
      {view.text}
    </div>
  );
}

function KeyHint({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Kbd>{k}</Kbd>
      {children}
    </span>
  );
}

/**
 * The riffer-facing live surface (U5): the three-step start, then a panel
 * docked to the right edge (status, voice controls, the board, mode settings
 * and Send) and a page toolbar at the bottom that picks one tool at a time.
 * Every control has a single-key shortcut. The overlay carries
 * `OVERLAY_ATTRIBUTE` so strokes never anchor to it, and it intercepts
 * pointer events only within its own controls.
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
  onRetryVoice,
  residualHint,
  nextSession,
  onStartNext,
  zIndex = 2147483000,
  defaultCollapsed = false,
  now
}: LiveOverlayProps) {
  const snapshot = useLiveSnapshot(session);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [tool, setTool] = useState<PageTool>("cursor");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cleared, setCleared] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>("board");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [uncontrolledPaused, setUncontrolledPaused] = useState(false);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const paused = controlledPaused ?? uncontrolledPaused;
  const panelRef = useRef<HTMLDivElement>(null);

  const onPauseChangeRef = useRef(onPauseChange);
  onPauseChangeRef.current = onPauseChange;
  const uncontrolledPausedRef = useRef(uncontrolledPaused);
  uncontrolledPausedRef.current = uncontrolledPaused;

  // The overlay outlives a session (U7 keeps it mounted for the ended card), so the next session
  // must not inherit a dismissal, an ended reason, a spent end flow, a tool, or cleared marks.
  useEffect(() => {
    setView("board");
    setTool("cursor");
    setSettingsOpen(false);
    setCleared(new Set());
    setFading(new Set());
    setFinished(false);
    setEndedReason(null);
    setDismissed(false);
    // Capture only learns pause through the callback, so clearing it has to notify too.
    if (uncontrolledPausedRef.current) onPauseChangeRef.current?.(false);
    setUncontrolledPaused(false);
  }, [session]);

  useEffect(() => {
    return session.on("ended", ({ reason }) => setEndedReason(reason ?? "ended"));
  }, [session]);

  // Pause holds capture, so the page goes back to the cursor and the tools wait.
  useEffect(() => {
    if (paused) setTool("cursor");
  }, [paused]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const sessionNow = useMemo(() => now ?? (() => Math.max(0, Date.now() - session.startedAt)), [now, session]);

  const handleConsent = useCallback(
    (result: ConsentResult) => {
      // Before `start()`: the interviewer reads whether frames may leave the page when it is created.
      if (!result.frames) session.disableFrames();
      if (result.mode !== session.snapshot().mode) session.setMode(result.mode);
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

  // Marks are captured when they land (annotation + composited frame), so they fade off the
  // page shortly after instead of piling up; the session keeps them all.
  const [fading, setFading] = useState<ReadonlySet<string>>(() => new Set());
  const seenMarks = useRef<Set<string>>(new Set());
  const markTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => {
    for (const annotation of snapshot.annotations) {
      if (seenMarks.current.has(annotation.id)) continue;
      seenMarks.current.add(annotation.id);
      const id = annotation.id;
      markTimers.current.push(
        setTimeout(() => setFading((current) => new Set(current).add(id)), MARK_HOLD_MS),
        setTimeout(() => setCleared((current) => new Set(current).add(id)), MARK_HOLD_MS + MARK_FADE_MS)
      );
    }
  }, [snapshot.annotations]);
  useEffect(
    () => () => {
      for (const timer of markTimers.current) clearTimeout(timer);
    },
    []
  );

  // A small bell each time the agent lands a change; units already applied at mount stay silent.
  const appliedSeen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const applied = snapshot.units.filter((unit) => unit.status === "applied").map((unit) => unit.id);
    if (appliedSeen.current === null) {
      appliedSeen.current = new Set(applied);
      return;
    }
    const fresh = applied.filter((id) => !appliedSeen.current!.has(id));
    for (const id of fresh) appliedSeen.current.add(id);
    if (fresh.length > 0) playAppliedChime();
  }, [snapshot.units]);

  const visibleAnnotations = useMemo(
    () => snapshot.annotations.filter((annotation) => !cleared.has(annotation.id)),
    [snapshot.annotations, cleared]
  );

  const handleAnnotation = useCallback(
    (annotation: LiveAnnotation) => {
      if (onAnnotation) onAnnotation(annotation);
      else session.addAnnotation(annotation);
      if (annotation.kind === "pin") {
        const pins = visibleAnnotations.filter((mark) => mark.kind === "pin").length + 1;
        flash(`Pin ${pins} added`);
      }
    },
    [session, onAnnotation, visibleAnnotations, flash]
  );

  // Clearing hides marks from the page only; what already left for the agent stays in the session.
  const clearMarks = useCallback(() => {
    setCleared(new Set(snapshot.annotations.map((annotation) => annotation.id)));
  }, [snapshot.annotations]);

  const togglePause = useCallback(() => {
    const next = !paused;
    if (controlledPaused === undefined) setUncontrolledPaused(next);
    onPauseChangeRef.current?.(next);
  }, [paused, controlledPaused]);

  const handleMode = useCallback((mode: ExecutionMode) => session.setMode(mode), [session]);
  const handleSend = useCallback(async () => {
    const emitted = await session.send();
    flash(emitted ? "Sent" : "Nothing held to send");
    return emitted;
  }, [session, flash]);
  const handleWithdraw = useCallback((unitId: string) => void session.withdrawUnit(unitId, "riffer"), [session]);
  const handleAnswer = useCallback((unitId: string, text: string) => void session.answer(unitId, text), [session]);

  // A ref, not state: a second Finish before React re-renders must not run `finish()` twice.
  const finishInFlight = useRef(false);
  const handleConfirmations = useCallback(
    async (confirmations: ConfirmationMap) => {
      if (finishInFlight.current || finished) return;
      finishInFlight.current = true;
      setFinishing(true);
      try {
        for (const [unitId, confirmation] of Object.entries(confirmations)) {
          session.confirmUnit(unitId, confirmation);
        }
        // `finish()` emits the one `final` (KTD9) whether or not the endpoint ends the session,
        // so the end flow is spent from here on even when the board comes back.
        setFinished(true);
        const result = await session.finish();
        onFinished?.(result);
      } finally {
        finishInFlight.current = false;
        setFinishing(false);
        setView("board");
      }
    },
    [session, onFinished, finished]
  );

  // A finished end flow leaves the board read-only: the endpoint may never end the session
  // (no endpoint, or a lost one), and U7's `stop()` assembles the archive from here.
  const running = snapshot.phase === "running" && !finished;
  const toolsOn = running && !paused && view === "board";
  const activeTool: PageTool = toolsOn ? tool : "cursor";
  const canMute = running && voiceRunning(snapshot) && snapshot.mic !== "denied";
  const endedCardShown = snapshot.phase === "ended" && endedReason !== "stopped" && !dismissed;

  const [compounding, setCompounding] = useState(false);
  const compound = useCallback(() => {
    session.recordUnit({ statement: COMPOUND_STATEMENT, transcript_excerpt: "", anchors: [] });
    void session.send();
    setCompounding(true);
    setTimeout(() => setCompounding(false), COMPOUND_MS);
    flash("Compounding what you decided");
  }, [session, flash]);

  const pickTool = useCallback((next: PageTool) => setTool((current) => (current === next ? "cursor" : next)), []);
  const endSession = useCallback(() => {
    setTool("cursor");
    setCollapsed(false);
    setView("confirming");
  }, []);

  // Rebuilt every render so the one window listener always sees current state.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => undefined);
  onKey.current = (event: KeyboardEvent) => {
    if (!isPlainKey(event) || event.repeat) return;
    const key = event.key.toLowerCase();
    // Enter and Space on a focused control keep their native meaning: activate that control.
    if (event.target instanceof HTMLButtonElement && (key === "enter" || key === " ")) return;

    let act: (() => void) | undefined;
    if (snapshot.phase === "ended") {
      if (key === "escape" && endedCardShown) act = () => setDismissed(true);
    } else if (snapshot.phase === "running" && view === "confirming") {
      if (key === "escape" && !finishing) act = () => setView("board");
      if (key === "enter") act = () => panelRef.current?.querySelector<HTMLButtonElement>("[data-riffrec-confirm-finish]")?.click();
    } else if (running) {
      const keys: Record<string, () => void> = {
        v: () => setTool("cursor"),
        backspace: clearMarks,
        p: togglePause,
        s: () => void handleSend(),
        c: () => setCollapsed((current) => !current),
        e: endSession,
        k: compound,
        "1": () => handleMode("instant"),
        "2": () => handleMode("smart"),
        "3": () => handleMode("collect")
      };
      if (toolsOn) {
        keys.d = () => pickTool("draw");
        keys.n = () => pickTool("pin");
      }
      if (canMute) keys.m = () => session.setMuted(!snapshot.muted);
      act = keys[key];
    }
    if (!act) return;
    event.preventDefault();
    act();
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (snapshot.phase === "consenting") {
    return (
      <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay="consenting">
        <ConsentDialog
          profile={profile}
          endpoint={snapshot.endpoint}
          endpointOwner={endpointOwner}
          voice={session.hasEndpoint}
          mode={snapshot.mode}
          getUserMedia={getUserMedia}
          onAccept={handleConsent}
          onDecline={handleDecline}
          zIndex={zIndex + 2}
        />
      </div>
    );
  }

  const launcher =
    nextSession && onStartNext ? (
      <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay="next" style={{ ...endedWrapStyle, zIndex: zIndex + 1 }}>
        <NextSessionLauncher next={nextSession} onStart={onStartNext} />
      </div>
    ) : null;

  if (snapshot.phase === "ended") {
    if (!endedCardShown) return launcher;
    return (
      <div {...{ [OVERLAY_ATTRIBUTE]: "" }} data-riffrec-live-overlay="ended" style={{ ...endedWrapStyle, zIndex: zIndex + 1 }}>
        <EndedCard
          units={snapshot.units}
          reason={endedReason}
          residualHint={residualHint}
          onDismiss={() => setDismissed(true)}
          next={onStartNext ? nextSession?.state : null}
          onStartNext={onStartNext}
        />
        <div style={{ ...hintRowStyle, marginTop: 6, marginBottom: 0 }}>
          <KeyHint k="Esc">close</KeyHint>
        </div>
      </div>
    );
  }

  if (snapshot.phase === "idle") return launcher;

  const { guesses, notes } = agentNotes(snapshot, session);
  const working = snapshot.units.filter((unit) => unit.status === "working").length;
  const queued = snapshot.units.filter((unit) => BUSY_STATUSES.has(unit.status)).length;
  // The endpoint reports the agent's real state; without it (older endpoint) fall back to the unit statuses.
  const agentState = snapshot.agent?.state ?? (queued > 0 ? "working" : null);
  const busy = agentState === "working";
  const held = session.heldUnits().length;
  const confirmable: LiveUnit[] = snapshot.units.filter((unit) => unit.status !== "withdrawn");
  const errored = snapshot.phase === "error";
  const status = streamStatus(snapshot, paused);
  const indicatorInput = {
    status: snapshot.status,
    muted: snapshot.muted,
    mic: snapshot.mic,
    paused,
    expectedSchemaVersion: snapshot.expectedSchemaVersion,
    endpoint: snapshot.endpoint,
    error: snapshot.error,
    voiceUnavailable: snapshot.voiceUnavailable
  };
  const indicatorLabel = describeIndicator(indicatorInput).label;

  const micButton = () => {
    if (!voiceRunning(snapshot)) {
      const cause = voiceUnavailableCause(snapshot.voiceUnavailable) ?? (snapshot.mic === "denied" ? "no microphone" : "not running");
      return (
        <button
          type="button"
          data-riffrec-live-mute="off"
          disabled
          title={`The voice interviewer isn't running: ${cause}. Clicks and drawings still stream.`}
          style={{ ...rowButtonStyle, flex: 1, minWidth: 0, border: "1px dashed #e4e7ec", color: "#667085", cursor: "default" }}
        >
          <span aria-hidden="true" style={dot("#f79009")} />
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>Voice off · {cause}</span>
        </button>
      );
    }
    const muted = snapshot.muted;
    const connecting = snapshot.voice !== "live";
    const label = muted
      ? "Mic muted"
      : !connecting
        ? "Listening"
        : snapshot.voice === "reconnecting"
          ? "Reconnecting voice…"
          : "Connecting voice…";
    return (
      <button
        type="button"
        data-riffrec-live-mute={muted ? "muted" : connecting ? "connecting" : "listening"}
        aria-pressed={muted}
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        title={muted ? "Unmute your mic (M)" : "Mute your mic. The session keeps streaming. (M)"}
        disabled={!canMute}
        style={{ ...rowButtonStyle, flex: 1, minWidth: 0, background: muted ? "#f2f4f7" : "#ffffff" }}
        onClick={() => session.setMuted(!muted)}
      >
        <span aria-hidden="true" style={dot(muted ? "#98a2b3" : connecting ? "#f79009" : "#12b76a")} />
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        <span style={muted ? { color: "#344054", fontWeight: 500 } : { color: "#667085" }}>{muted ? "Unmute" : "Mute"}</span>
        <Kbd>M</Kbd>
      </button>
    );
  };

  const toolbar =
    view === "board" && running ? (
      <div data-riffrec-page-tools="" style={{ ...toolbarWrapStyle, zIndex: zIndex + 1 }}>
        {activeTool === "cursor" ? (
          <span
            data-riffrec-tool-caption="cursor"
            style={{ ...captionStyle, background: "#ffffff", border: "1px solid #eaecf0", color: "#475467" }}
          >
            <b style={{ fontWeight: 600, color: "#101828" }}>Cursor</b> ·{" "}
            {paused ? "capture is paused" : "the page works as normal"}
          </span>
        ) : (
          <span data-riffrec-tool-caption={activeTool} style={{ ...captionStyle, background: "#d92d20", color: "#ffffff" }}>
            <span aria-hidden="true" style={dot("#ffffff")} />
            <b style={{ fontWeight: 600 }}>{TOOL_HINTS[activeTool][0]}</b> · {TOOL_HINTS[activeTool][1]}
          </span>
        )}
        <div data-riffrec-toolbar="" role="toolbar" aria-label="Page tools" style={toolbarStyle}>
          {TOOLS.map((item) => {
            const selected = activeTool === item.tool;
            const disabled = item.tool !== "cursor" && !toolsOn;
            const selectedStyle: CSSProperties = selected
              ? { background: item.tool === "cursor" ? "#101828" : "#d92d20", color: "#ffffff", fontWeight: 500 }
              : {};
            return (
              <button
                key={item.tool}
                type="button"
                data-riffrec-tool={item.tool}
                aria-pressed={selected}
                title={item.title}
                disabled={disabled}
                style={{ ...toolButtonStyle, ...selectedStyle, ...(disabled ? { opacity: 0.5, cursor: "default" } : {}) }}
                onClick={() => (item.tool === "cursor" ? setTool("cursor") : pickTool(item.tool))}
              >
                <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
                  {item.icon}
                </span>
                {item.label}
                <Kbd dark={selected}>{item.key}</Kbd>
              </button>
            );
          })}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: "#eaecf0", margin: "0 4px" }} />
          <button
            type="button"
            data-riffrec-tool-clear=""
            title="Clear drawings and pins (⌫)"
            style={{ ...toolButtonStyle, padding: "0 8px", color: "#667085" }}
            onClick={clearMarks}
          >
            Clear
            <Kbd>⌫</Kbd>
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div
      {...{ [OVERLAY_ATTRIBUTE]: "" }}
      data-riffrec-live-overlay={collapsed ? "collapsed" : "expanded"}
      data-riffrec-live-tool={activeTool}
    >
      <style>{OVERLAY_KEYFRAMES}</style>
      <DrawingLayer
        annotations={visibleAnnotations}
        fadingIds={fading}
        onAnnotation={handleAnnotation}
        active={activeTool !== "cursor"}
        tool={activeTool === "pin" ? "pin" : "draw"}
        onActiveChange={(on) => {
          if (!on) setTool("cursor");
          else if (toolsOn) setTool((current) => (current === "pin" ? "pin" : "draw"));
        }}
        shortcut={drawShortcut}
        route={route}
        now={sessionNow}
        showToggle={false}
        zIndex={zIndex}
      />
      {collapsed && view === "board" ? (
        <div data-riffrec-live-pill="" style={{ ...pillStyle, zIndex: zIndex + 1 }}>
          <Wordmark />
          <LiveIndicator {...indicatorInput} compact />
          {agentState === "working" ? (
            <span
              data-riffrec-live-pill-working={working || queued}
              title="The agent is working on these now"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6941c6", whiteSpace: "nowrap" }}
            >
              <span aria-hidden="true" style={{ ...dot("#7f56d9"), animation: "riffrec-live-pulse 1.4s ease-in-out infinite" }} />
              {working || queued} working
            </span>
          ) : null}
          {voiceRunning(snapshot) ? (
            <button
              type="button"
              data-riffrec-live-pill-mute={snapshot.muted ? "muted" : "live"}
              aria-pressed={snapshot.muted}
              aria-label={snapshot.muted ? "Unmute microphone" : "Mute microphone"}
              title={snapshot.muted ? "Mic muted: click to unmute (M)" : "Mic on: click to mute (M)"}
              disabled={!canMute}
              style={{
                ...rowButtonStyle,
                height: 26,
                padding: "0 8px",
                gap: 5,
                borderRadius: 999,
                ...(snapshot.muted ? { background: "#fef3f2", borderColor: "#fecdca", color: "#b42318" } : {})
              }}
              onClick={() => session.setMuted(!snapshot.muted)}
            >
              <span aria-hidden="true" style={dot(snapshot.muted ? "#f04438" : "#12b76a")} />
              {snapshot.muted ? "Muted" : "Mic on"}
            </button>
          ) : null}
          {running && held > 0 ? <SendControl onSend={handleSend} heldCount={held} compact /> : null}
          <button
            type="button"
            data-riffrec-live-expand=""
            aria-label="Expand live panel"
            aria-expanded={false}
            title="Expand (C)"
            style={headerButtonStyle}
            onClick={() => setCollapsed(false)}
          >
            ▸
          </button>
        </div>
      ) : (
        <div
          ref={panelRef}
          data-riffrec-live-panel=""
          role="region"
          aria-label="/ce-polish live"
          style={{ ...panelStyle, zIndex: zIndex + 1 }}
        >
          <div style={headerStyle}>
            <span
              data-riffrec-live-status={status.label.toLowerCase()}
              data-riffrec-live-indicator={deriveIndicatorState(indicatorInput)}
              title={indicatorLabel}
              style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
            >
              <span aria-hidden="true" style={dot(status.color, status.halo)} />
              <Wordmark />
              {/* The wordmark already says "live"; only other states get a word. */}
              {status.label === "Live" ? null : (
                <span style={{ fontSize: 11, color: "#667085", whiteSpace: "nowrap" }}>{status.label}</span>
              )}
            </span>
            <span style={{ display: "flex", gap: 2, flex: "none" }}>
              {view === "board" ? (
                <button
                  type="button"
                  data-riffrec-live-collapse=""
                  aria-label="Collapse live panel"
                  aria-expanded={true}
                  title="Collapse (C)"
                  style={headerButtonStyle}
                  onClick={() => setCollapsed(true)}
                >
                  ▾
                </button>
              ) : null}
              <button
                type="button"
                data-riffrec-live-end=""
                aria-label="End session"
                title="End session (E)"
                disabled={!running || view === "confirming"}
                style={{ ...headerButtonStyle, fontSize: 15 }}
                onClick={endSession}
              >
                ✕
              </button>
            </span>
          </div>
          {view === "board" ? (
            <>
              <div data-riffrec-voice="" style={voiceRowStyle}>
                {micButton()}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 14px 0" }}>
                <span style={sectionLabelStyle}>What you've asked for</span>
                <span data-riffrec-live-count="" style={{ fontSize: 11, color: "#98a2b3" }}>
                  {confirmable.length}
                </span>
              </div>
              {agentState ? (
                <AgentStatus state={agentState} since={snapshot.agent?.since ?? null} working={working} queued={queued} />
              ) : null}
              {busy ? (
                <div
                  data-riffrec-live-busy=""
                  role="progressbar"
                  aria-label="Agent working"
                  style={{ position: "relative", height: 2, margin: "6px 14px 0", borderRadius: 2, background: "#f4ebff", overflow: "hidden" }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      width: "40%",
                      borderRadius: 2,
                      background: "linear-gradient(90deg, transparent, #7f56d9, transparent)",
                      animation: "riffrec-live-progress 1.3s ease-in-out infinite"
                    }}
                  />
                </div>
              ) : null}
              <div style={bodyStyle}>
                {errored && snapshot.error ? (
                  <p role="alert" data-riffrec-live-error="" style={{ margin: "0 0 10px", color: "#b42318" }}>
                    {snapshot.error.message}
                  </p>
                ) : null}
                {snapshot.status === "buffering" || snapshot.voiceUnavailable?.kind === "exhausted" ? (
                  <p
                    role="alert"
                    data-riffrec-live-unreachable=""
                    style={{
                      margin: "0 0 10px",
                      padding: "8px 10px",
                      border: "1px solid #fedf89",
                      borderRadius: 8,
                      background: "#fffaeb",
                      color: "#7a2e0e",
                      fontSize: 12
                    }}
                  >
                    <strong style={{ fontWeight: 600 }}>Can't reach the /ce-polish server.</strong> If it was restarted, run
                    /ce-polish again and open the new link it gives you. What you do here is held until then.
                  </p>
                ) : null}
                {snapshot.status === "incompatible" ? (
                  <p role="alert" style={{ margin: "0 0 10px", fontSize: 12, color: "#b42318" }}>
                    {indicatorLabel}
                  </p>
                ) : null}
                {onRetryVoice && running && snapshot.status === "live_novoice" && needsOpenAIKey(snapshot.voiceUnavailable) ? (
                  <KeyPrompt reason={snapshot.voiceUnavailable} onRetry={onRetryVoice} />
                ) : null}
                <Board
                  units={snapshot.units}
                  questions={snapshot.openQuestions}
                  guesses={guesses}
                  notes={notes}
                  isReleased={(id) => session.isReleased(id)}
                  mode={snapshot.mode}
                  voice={voiceRunning(snapshot)}
                  onWithdraw={running ? handleWithdraw : undefined}
                  onAnswer={running ? handleAnswer : undefined}
                />
              </div>
              {settingsOpen ? (
                <div data-riffrec-settings="" style={settingsStyle}>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#667085" }}>
                    When the agent applies changes
                    <span style={{ display: "flex", gap: 3 }}>
                      <Kbd>1</Kbd>
                      <Kbd>2</Kbd>
                      <Kbd>3</Kbd>
                    </span>
                  </span>
                  <ModeSwitch mode={snapshot.mode} pendingMode={snapshot.pendingMode} onChange={handleMode} disabled={!running} />
                  <span style={{ fontSize: 11, lineHeight: 1.4, color: "#475467" }}>{MODE_DESCRIPTIONS[snapshot.mode]}</span>
                  <span style={legendStyle}>
                    {LEGEND.map(([key, label]) => (
                      <KeyHint key={key} k={key}>
                        {label}
                      </KeyHint>
                    ))}
                  </span>
                </div>
              ) : null}
              <div style={footerStyle}>
                <span style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
                <button
                  type="button"
                  data-riffrec-live-settings=""
                  aria-expanded={settingsOpen}
                  style={settingsToggleStyle}
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  {MODE_LABELS[snapshot.mode]} mode
                  {snapshot.pendingMode !== null ? <span style={{ color: "#b54708" }}>· pending</span> : null}
                  <span aria-hidden="true" style={{ fontSize: 10 }}>
                    {settingsOpen ? "▾" : "▸"}
                  </span>
                </button>
                <button
                  type="button"
                  data-riffrec-live-compound=""
                  title="Compound: have the agent run /ce-compound on what you decided (K)"
                  disabled={!running}
                  style={{ ...settingsToggleStyle, marginLeft: 0, color: "#6941c6" }}
                  onClick={compound}
                >
                  <span aria-hidden="true">◎</span> Compound
                </button>
                </span>
                {/* Checkpoints go out on their own when you pause; Send only shows to push held ones now. */}
                {held > 0 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                    <span data-riffrec-live-held="" title="Goes out on its own when you pause; Send (S) pushes it now" style={{ fontSize: 11, color: "#98a2b3", whiteSpace: "nowrap" }}>
                      {held} held
                    </span>
                    <SendControl onSend={handleSend} heldCount={held} disabled={!running} compact />
                  </span>
                ) : (
                  <span data-riffrec-live-held="" style={{ fontSize: 11, color: "#98a2b3", whiteSpace: "nowrap" }}>
                    Auto-sends
                  </span>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: 12, overflowY: "auto", borderTop: "1px solid #f2f4f7" }}>
              <div style={hintRowStyle}>
                <KeyHint k="Esc">keep riffing</KeyHint>
                <KeyHint k="↵">finish</KeyHint>
              </div>
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
      {toolbar}
      {compounding ? <CompoundBurst zIndex={zIndex + 3} /> : null}
      {toast ? (
        <div data-riffrec-live-toast="" role="status" style={{ ...toastStyle, zIndex: zIndex + 1 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

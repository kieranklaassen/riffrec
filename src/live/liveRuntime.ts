import { ConsoleCapture } from "../capture/console";
import { EventCapture } from "../capture/events";
import { NetworkCapture } from "../capture/network";
import { ScreenCapture } from "../capture/screen";
import { VoiceCapture } from "../capture/voice";
import type { LiveArchiveInputs } from "../output/session";
import { createDefaultSegmentStore } from "../output/segmentStore";
import type {
  CaptureOutputs,
  ClickEvent,
  RiffrecConfig,
  RiffrecEvent,
  RiffrecLiveConfig,
  RiffrecSessionOptions
} from "../types";
import type { ExecutionMode, LiveAnchor, LiveAnnotation } from "./contract";
import { LiveEvidence } from "./evidence/liveEvidence";
import { resolveEvidenceProfile, type EvidenceProfile } from "./evidence/profile";
import type { ConsentResult } from "./overlay/ConsentDialog";
import type { ConsentEvidenceProfile } from "./overlay/consentCopy";
import { SharedMicrophone } from "./realtime/audioRouting";
import { REALTIME_CALLS_URL, createRealtimeConnector, type RealtimeConnector } from "./realtime/client";
import { createInterviewer, type Interviewer } from "./realtime/interviewer";
import { LiveSession, type FinishResult, type LiveSessionSnapshot } from "./session";
import { bootstrapLiveToken } from "./tokenBootstrap";

/**
 * The live subtree's non-React half (U7): one object per provider mount that
 * owns the `LiveSession`, the interviewer, the evidence coordinator, and the
 * classic captures, and hands the provider what it needs to assemble the
 * archive. Loaded lazily with the overlay (KTD1), so a host without `live`
 * never evaluates this module.
 */

/** The host-side capture configuration the runtime needs from `RiffrecConfig`. */
export type LiveCaptureConfig = Pick<RiffrecConfig, "displayMedia" | "displayMediaVideo" | "sanitizeError">;

export interface LiveStopResult {
  outputs: CaptureOutputs;
  live: LiveArchiveInputs;
  recordingSegments: Blob[];
  options: RiffrecSessionOptions;
  /** `endpoint` when the endpoint or the Done control ended the session; `stop` for an explicit stop. */
  endedBy: "stop" | "endpoint";
}

export interface LiveRuntimeCallbacks {
  onSnapshot: (snapshot: LiveSessionSnapshot) => void;
  /** A session the runtime did not stop itself has ended; the provider runs the archive path. */
  onEnded: () => void;
  /** After a rehydrate the riffer must share the screen again before capture resumes (R17). */
  onReshareNeeded: (needed: boolean) => void;
  onError: (error: Error) => void;
}

export interface LiveRuntimeOptions {
  config: RiffrecLiveConfig;
  capture: LiveCaptureConfig;
  callbacks: LiveRuntimeCallbacks;
  /** Test seams. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch?: typeof fetch;
}

/** The view of the evidence profile the consent copy needs (U5's `ConsentEvidenceProfile`). */
export function toConsentProfile(profile: EvidenceProfile): ConsentEvidenceProfile {
  return {
    transcript: profile.transcript_excerpt,
    strokes: profile.strokes,
    frames: profile.frames !== "none",
    audio_clip: profile.audio_clip,
    telemetry_window: profile.telemetry_window
  };
}

/** KTD17: the stream must not record itself, and the Realtime call is not host traffic. */
export function liveExcludedUrls(endpoint: string | null): string[] {
  const realtimeOrigin = new URL(REALTIME_CALLS_URL).origin;
  return endpoint ? [endpoint, realtimeOrigin] : [realtimeOrigin];
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function describeAnchor(anchor: LiveAnchor): string {
  return anchor.component ? `${anchor.component} (${anchor.selector})` : anchor.selector;
}

function clickAnchor(event: ClickEvent, route: string): LiveAnchor | null {
  const box = event.element.boundingBox;
  if (!box) return null;
  return {
    route,
    selector: event.element.selector,
    ...(event.component ? { component: event.component } : {}),
    rect: { x: box.x, y: box.y, width: box.width, height: box.height },
    t: event.t * 1000
  };
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("Microphone capture is not supported in this browser."));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

interface ActiveCaptures {
  events: RiffrecEvent[];
  screen: ScreenCapture;
  voice: VoiceCapture;
  eventCapture: EventCapture;
  networkCapture: NetworkCapture;
  consoleCapture: ConsoleCapture;
  evidence: LiveEvidence;
  ownsGlobalPatchMarker: boolean;
  microphone: SharedMicrophone | null;
  connector: RealtimeConnector | null;
  interviewer: Interviewer | null;
  unsubscribe: Array<() => void>;
}

export class LiveRuntime {
  readonly profile: EvidenceProfile;
  readonly consentProfile: ConsentEvidenceProfile;

  private readonly config: RiffrecLiveConfig;
  private readonly capture: LiveCaptureConfig;
  private readonly callbacks: LiveRuntimeCallbacks;
  private readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  private readonly fetchImpl: typeof fetch | undefined;

  private current: LiveSession;
  private active: ActiveCaptures | null = null;
  private options: RiffrecSessionOptions = {};
  private sessionListeners: Array<() => void> = [];
  private paused = false;
  private stopping: Promise<LiveStopResult | null> | null = null;
  private suspended = false;

  constructor(options: LiveRuntimeOptions) {
    this.config = options.config;
    this.capture = options.capture;
    this.callbacks = options.callbacks;
    this.getUserMedia = options.getUserMedia ?? defaultGetUserMedia;
    this.fetchImpl = options.fetch;
    this.profile = resolveEvidenceProfile(options.config.profile ?? "default");
    this.consentProfile = toConsentProfile(this.profile);

    // KTD3: read and strip the fragment before any capture patches history.
    bootstrapLiveToken();
    const rehydrated = LiveSession.rehydrate(this.sessionOptions());
    this.current = rehydrated ?? LiveSession.create(this.sessionOptions());
    this.attachSession(this.current);
    if (rehydrated) this.resume(rehydrated);
  }

  get session(): LiveSession {
    return this.current;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Riffer or host asked to go live: the overlay shows the consent step. */
  begin(options: RiffrecSessionOptions = {}): void {
    if (this.suspended) return;
    if (this.current.status === "ended" || this.current.status === "error") {
      this.current = LiveSession.create(this.sessionOptions());
      this.attachSession(this.current);
    }
    if (this.current.status !== "idle") return;
    this.options = options;
    this.current.beginConsent();
  }

  /** The overlay's `onConsent`: one microphone stream fanned to every consumer (KTD21). */
  consent(result: ConsentResult): void {
    if (this.suspended || this.active) return;
    this.startCaptures(result.mic === "granted" ? result.stream : null);
  }

  /** The overlay's `onFinished`: a Done the endpoint did not end still needs the archive (R4). */
  finished(result: FinishResult): void {
    if (!result.ended && this.current.status !== "ended") this.callbacks.onEnded();
  }

  annotation = (annotation: LiveAnnotation): void => {
    const active = this.active;
    if (!active) {
      this.current.addAnnotation(annotation);
      return;
    }
    void active.evidence.annotationCompleted(annotation).catch((error) => this.callbacks.onError(toError(error)));
    active.interviewer?.announceDrawing({
      anchor: annotation.anchor,
      description: describeAnchor(annotation.anchor),
      kind: annotation.kind
    });
  };

  setMode(mode: ExecutionMode): void {
    this.current.setMode(mode);
  }

  setMuted(muted: boolean): void {
    const active = this.active;
    if (active?.interviewer) {
      active.interviewer.setMuted(muted);
      return;
    }
    active?.microphone?.setMuted(muted);
    this.current.setMuted(muted);
  }

  send(): Promise<boolean> {
    return this.current.send();
  }

  /** R25: frames, composites, and the event stream pause; the screen recording never does. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.active?.evidence.pause();
    else this.active?.evidence.resume();
  }

  /** After a reload: the riffer agreed to share the screen again. */
  async reshare(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.callbacks.onReshareNeeded(false);
    await this.shareScreen(active);
  }

  dismissReshare(): void {
    this.callbacks.onReshareNeeded(false);
  }

  /**
   * Ends the session and returns everything the archive needs; null when
   * there was nothing to archive (declined or never-started consent).
   */
  stop(): Promise<LiveStopResult | null> {
    if (!this.stopping) this.stopping = this.doStop().finally(() => (this.stopping = null));
    return this.stopping;
  }

  /** The provider is unmounting mid-session (KTD16): release the page, keep the session. */
  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    const active = this.active;
    this.active = null;
    if (active) {
      this.releaseCaptures(active);
      void active.screen.stop().catch((error) => this.callbacks.onError(toError(error)));
      void active.voice.stop().catch((error) => this.callbacks.onError(toError(error)));
      active.microphone?.stop();
    }
    if (this.current.status === "consenting") this.current.declineConsent();
    this.current.suspend();
    for (const off of this.sessionListeners.splice(0)) off();
  }

  private sessionOptions() {
    return {
      endpoint: this.config.endpoint ?? null,
      evidenceProfile: this.profile,
      ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}),
      onError: (error: unknown) => this.callbacks.onError(toError(error))
    };
  }

  private attachSession(session: LiveSession): void {
    for (const off of this.sessionListeners.splice(0)) off();
    this.sessionListeners.push(
      session.subscribe((snapshot) => this.callbacks.onSnapshot(snapshot)),
      session.on("ended", ({ reason }) => {
        if (reason !== "stopped" && !this.stopping) this.callbacks.onEnded();
      })
    );
    this.callbacks.onSnapshot(session.snapshot());
  }

  /** A rehydrated session: delivery resumes now, the microphone is re-acquired, the screen waits for a gesture. */
  private resume(session: LiveSession): void {
    session.start();
    const micDenied = session.snapshot().mic === "denied";
    if (micDenied) {
      this.startCaptures(null, { share: false });
      return;
    }
    this.getUserMedia({ audio: true })
      .then((stream) => this.startCaptures(stream, { share: false }))
      .catch(() => {
        session.micDenied();
        this.startCaptures(null, { share: false });
      });
  }

  private startCaptures(micStream: MediaStream | null, { share = true }: { share?: boolean } = {}): void {
    if (this.suspended || this.active) return;
    const session = this.current;
    const route = () => (typeof window === "undefined" ? "/" : window.location.pathname);
    const now = () => Math.max(0, Date.now() - session.startedAt);
    const events: RiffrecEvent[] = [];
    const unsubscribe: Array<() => void> = [];

    const evidence = new LiveEvidence({
      session,
      now,
      route,
      recentEvents: () => events,
      onError: (error) => this.callbacks.onError(toError(error))
    });
    const screen = new ScreenCapture(this.capture.displayMedia, this.capture.displayMediaVideo, {
      segmentStore: createDefaultSegmentStore(),
      sessionId: session.id,
      onStreamEnded: () => {
        evidence.setDisplayStream(null);
        if (this.active?.screen === screen && session.status !== "ended") this.callbacks.onReshareNeeded(true);
      },
      onError: (error) => this.callbacks.onError(toError(error))
    });
    const voice = new VoiceCapture();
    const eventCapture = new EventCapture();
    const networkCapture = new NetworkCapture();
    const consoleCapture = new ConsoleCapture();

    const ownsGlobalPatchMarker = typeof window !== "undefined" && !window.__RIFFREC_PATCHED__;
    if (ownsGlobalPatchMarker) window.__RIFFREC_PATCHED__ = true;
    else if (typeof console !== "undefined") {
      console.warn("[riffrec] Another riffrec instance is already active -- skipping global patches.");
    }

    let microphone: SharedMicrophone | null = null;
    let connector: RealtimeConnector | null = null;
    let interviewer: Interviewer | null = null;

    if (micStream) {
      microphone = new SharedMicrophone(micStream);
      microphone.setMuted(session.isMuted);
      void voice.start(microphone.clone("voice_capture"));
      evidence.setMicStream(microphone.clone("clips"));
      if (session.hasEndpoint) {
        connector = createRealtimeConnector({ microphone, elapsed: now });
        interviewer = createInterviewer({
          session,
          connect: connector.connect,
          microphone,
          ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}),
          evidence: {
            recordUnit: (input) => evidence.recordUnit(input),
            speechStarted: () => evidence.speechStarted(),
            speechStopped: () => evidence.speechStopped()
          },
          onError: (error) => this.callbacks.onError(toError(error))
        });
      }
    }

    const active: ActiveCaptures = {
      events,
      screen,
      voice,
      eventCapture,
      networkCapture,
      consoleCapture,
      evidence,
      ownsGlobalPatchMarker,
      microphone,
      connector,
      interviewer,
      unsubscribe
    };
    this.active = active;

    const onEvent = (event: RiffrecEvent): void => {
      events.push(event);
      if (!this.paused) session.recordEvent(event);
      if (event.type === "click" && interviewer) {
        const anchor = clickAnchor(event, route());
        if (anchor) interviewer.noteAnchor(anchor, describeAnchor(anchor));
      }
    };
    const sessionStart = session.startedAt;
    if (ownsGlobalPatchMarker) {
      eventCapture.start(sessionStart, onEvent);
      networkCapture.start(sessionStart, onEvent, liveExcludedUrls(session.endpoint));
      consoleCapture.start(sessionStart, onEvent, this.capture.sanitizeError);
    }

    if (interviewer) {
      const voice = interviewer;
      let lastStream = session.streamState;
      unsubscribe.push(
        session.subscribe((snapshot) => {
          if (snapshot.stream === lastStream) return;
          if (snapshot.stream === "buffering") voice.announceBuffering("buffering");
          else if (lastStream === "buffering" && snapshot.stream === "streaming") voice.announceBuffering("streaming");
          lastStream = snapshot.stream;
        })
      );
      void voice.start().catch((error) => this.callbacks.onError(toError(error)));
    }

    if (this.paused) evidence.pause();
    // R17: after a reload the screen is shared again only on the riffer's gesture, asked once.
    if (share) void this.shareScreen(active);
    else this.callbacks.onReshareNeeded(true);
  }

  private async shareScreen(active: ActiveCaptures): Promise<void> {
    const outcome = await active.screen.tryStart();
    if (this.active !== active) return;
    if (outcome === "recording") active.evidence.setDisplayStream(active.screen.displayStream);
  }

  /** Unpatches the page and stops the voice link; media is left to the caller (stop vs. suspend differ). */
  private releaseCaptures(active: ActiveCaptures): void {
    for (const off of active.unsubscribe.splice(0)) off();
    active.eventCapture.stop();
    active.networkCapture.stop();
    active.consoleCapture.stop();
    if (active.ownsGlobalPatchMarker && typeof window !== "undefined") delete window.__RIFFREC_PATCHED__;
    active.interviewer?.stop();
    active.connector?.dispose();
    active.evidence.dispose();
  }

  private async doStop(): Promise<LiveStopResult | null> {
    const session = this.current;
    if (session.status === "consenting") {
      session.declineConsent();
      return null;
    }
    if (session.status === "idle") return null;
    const endedBy: LiveStopResult["endedBy"] = session.status === "ended" ? "endpoint" : "stop";
    const active = this.active;
    this.active = null;
    this.callbacks.onReshareNeeded(false);

    let recordingSegments: Blob[] = [];
    let voiceBlob: Blob | null = null;
    const events = active?.events ?? [];
    if (active) {
      this.releaseCaptures(active);
      const [, voice] = await Promise.all([
        active.screen.stop().catch(() => null),
        active.voice.stop().catch(() => null)
      ]);
      voiceBlob = voice;
      recordingSegments = await active.screen.collectSegments();
      active.microphone?.stop();
    }
    const live = await session.stop();
    if (active) await active.screen.clearSegments().catch(() => {});

    const outputs: CaptureOutputs = {
      sessionId: session.id,
      startedAt: new Date(session.startedAt),
      durationSeconds: (Date.now() - session.startedAt) / 1000,
      events,
      screenBlob: null,
      voiceBlob
    };
    return { outputs, live, recordingSegments, options: this.options, endedBy };
  }
}

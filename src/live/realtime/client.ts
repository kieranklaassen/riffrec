import type { LiveMintResponse, LiveTranscript } from "../contract";
import { isLiveToolName, type LiveToolCall, type LiveToolResult } from "../tools";
import {
  createDefaultAudioContext,
  routeRemoteAudio,
  type AudioContextLike,
  type RemoteAudioRoute,
  type SharedMicrophone
} from "./audioRouting";
import { readSessionConfig, type RealtimeSessionConfig } from "./sessionConfig";

/**
 * Thin typed WebRTC client for the OpenAI Realtime API, ported from
 * `breathwork-live`'s `realtimeClient.ts`.
 *
 * Every OpenAI event-shape assumption lives here, in `parseRealtimeEvent`.
 * Parsing is deliberately narrow: recognized events map to the
 * `RealtimeServerEvent` union the interviewer consumes (the same shape
 * `testing/fakeRealtime.ts` scripts); anything else is ignored so a new
 * server event never crashes a session.
 *
 * Differences from the breathwork port (KTD21): the client never calls
 * `getUserMedia`; the session hands it a cloned microphone stream from the
 * consent step, and mute flips that clone. Audible routing is not done here
 * either — the remote stream is handed to `onRemoteTrack` so `audioRouting.ts`
 * can build the explicit Web Audio chain.
 */

export const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
export const DATA_CHANNEL_READY_TIMEOUT_MS = 10_000;
/**
 * How long an ICE `disconnected` may last before the call is reported lost.
 * `disconnected` is often a brief interruption that returns to `connected`;
 * only `failed`/`closed` are terminal on their own.
 */
export const PEER_DISCONNECTED_GRACE_MS = 10_000;

export type RealtimeServerEvent =
  | { type: "session_created"; session: RealtimeSessionConfig }
  | { type: "speech_started"; t: number }
  | { type: "speech_stopped"; t: number }
  | { type: "transcript"; transcript: LiveTranscript }
  | { type: "tool_call"; call: LiveToolCall }
  | { type: "response_started"; response_id: string }
  | { type: "response_done"; response_id: string }
  | { type: "error"; message: string }
  | { type: "closed"; reason?: string };

export interface RealtimeTransportHandlers {
  onEvent: (event: RealtimeServerEvent) => void | Promise<void>;
}

/**
 * What the interviewer needs from a connection. `RealtimeClient` implements it
 * over WebRTC; `FakeRealtime` implements it for tests.
 */
export interface RealtimeTransport {
  connect(handlers: RealtimeTransportHandlers): void | Promise<void>;
  readonly connected: boolean;
  sendText(text: string): void;
  /** A screenshot as a user message: the JPEG (base64, no `data:` prefix) followed by a caption. */
  sendImage(text: string, jpegBase64: string): void;
  sendToolResult(result: LiveToolResult): void;
  createResponse(): void;
  cancelResponse(): void;
  updateSession(patch: Record<string, unknown>): void;
  setMuted(muted: boolean): void;
  close(): void;
}

export type TextItemRole = "system" | "user";

export interface RealtimeClientDeps {
  fetchImpl?: typeof fetch;
  createPeerConnection?: () => RTCPeerConnection;
  createAudioElement?: () => HTMLAudioElement;
  baseUrl?: string;
  /**
   * Milliseconds since session start, stamped on speech and transcript events.
   * Defaults to time since the client was built; the connector passes the
   * session clock so spans and the re-seed window line up with the session.
   */
  elapsed?: () => number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Role used for page-side text items (`sendText`). Default `system`. */
  textRole?: TextItemRole;
  onParseError?: (error: unknown, raw: unknown) => void;
}

export interface RealtimeClientOptions {
  /** Ephemeral client secret (`ek_...`) minted by the endpoint (I2). */
  secret: string;
  model: string;
  /** Cloned microphone stream from `SharedMicrophone` (KTD21). */
  micStream: MediaStream;
  /** Receives the remote audio stream for `routeRemoteAudio`. */
  onRemoteTrack?: (stream: MediaStream) => void;
  deps?: RealtimeClientDeps;
}

// --- Event parsing ---------------------------------------------------------

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseToolArgs(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export interface UtteranceSpan {
  start: number;
  end: number | null;
}

export interface ParseContext {
  /** Milliseconds since session start. */
  t: number;
  /** When the riffer's current utterance started, for transcript spans. */
  utteranceStart: number | null;
  utteranceEnd: number | null;
  /**
   * Spans keyed by the audio item id, so a transcription that arrives after
   * the next utterance began still gets its own timestamps.
   */
  spans?: ReadonlyMap<string, UtteranceSpan>;
}

/** How many utterance spans the client remembers while their transcriptions are pending. */
export const UTTERANCE_SPAN_LIMIT = 64;

/** Maps one raw Realtime server event to the typed union; null for events the interviewer ignores. */
export function parseRealtimeEvent(raw: unknown, context: ParseContext): RealtimeServerEvent | null {
  const message = asRecord(raw);
  const type = asString(message.type);
  switch (type) {
    case "session.created":
      return { type: "session_created", session: readSessionConfig(message.session) };
    case "input_audio_buffer.speech_started":
      return { type: "speech_started", t: context.t };
    case "input_audio_buffer.speech_stopped":
      return { type: "speech_stopped", t: context.t };
    case "conversation.item.input_audio_transcription.completed": {
      const text = asString(message.transcript).trim();
      const itemId = asString(message.item_id);
      const span = itemId ? context.spans?.get(itemId) : undefined;
      const tStart = span?.start ?? context.utteranceStart ?? context.t;
      const tEnd = span ? (span.end ?? Math.max(tStart, context.t)) : (context.utteranceEnd ?? context.t);
      return {
        type: "transcript",
        transcript: {
          id: itemId || `riffer_${context.t}`,
          role: "riffer",
          text,
          t_start: tStart,
          t_end: Math.max(tStart, tEnd),
          final: true
        }
      };
    }
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const text = asString(message.transcript).trim();
      const id = asString(message.item_id) || asString(message.response_id) || `interviewer_${context.t}`;
      return {
        type: "transcript",
        transcript: { id, role: "interviewer", text, t_start: context.t, t_end: context.t, final: true }
      };
    }
    case "response.created":
      return { type: "response_started", response_id: asString(asRecord(message.response).id) };
    case "response.done":
      return { type: "response_done", response_id: asString(asRecord(message.response).id) };
    case "response.function_call_arguments.done": {
      const name = asString(message.name);
      const callId = asString(message.call_id);
      if (!isLiveToolName(name)) return { type: "error", message: `Unknown tool call: ${name || "(unnamed)"}` };
      return {
        type: "tool_call",
        call: { call_id: callId, name, arguments: parseToolArgs(message.arguments) } as unknown as LiveToolCall
      };
    }
    case "error": {
      const error = asRecord(message.error);
      const code = asString(error.code);
      const text = asString(error.message) || "Realtime error";
      return { type: "error", message: code ? `${code}: ${text}` : text };
    }
    default:
      return null;
  }
}

// --- Client ----------------------------------------------------------------

export class RealtimeClient implements RealtimeTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly createAudioElement: () => HTMLAudioElement;
  private readonly baseUrl: string;
  private readonly elapsed: () => number;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly textRole: TextItemRole;
  private readonly onParseError: ((error: unknown, raw: unknown) => void) | null;

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private handlers: RealtimeTransportHandlers | null = null;
  private muted = false;
  private closedReported = false;
  private disconnectTimer: unknown = null;
  private utteranceStart: number | null = null;
  private utteranceEnd: number | null = null;
  private readonly spans = new Map<string, UtteranceSpan>();

  constructor(private readonly options: RealtimeClientOptions) {
    const deps = options.deps ?? {};
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
    this.createPeerConnection = deps.createPeerConnection ?? (() => new RTCPeerConnection());
    this.createAudioElement =
      deps.createAudioElement ??
      (() => {
        const element = document.createElement("audio");
        element.autoplay = true;
        return element;
      });
    this.baseUrl = deps.baseUrl ?? REALTIME_CALLS_URL;
    const builtAt = Date.now();
    this.elapsed = deps.elapsed ?? (() => Date.now() - builtAt);
    this.schedule = deps.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.cancel = deps.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.textRole = deps.textRole ?? "system";
    this.onParseError = deps.onParseError ?? null;
    this.muted = options.micStream.getAudioTracks().some((track) => !track.enabled);
  }

  get connected(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Resolves once the data channel is open; rejects (and tears down) on any failure. */
  async connect(handlers: RealtimeTransportHandlers): Promise<void> {
    if (this.pc) throw new Error("RealtimeClient.connect called twice");
    this.handlers = handlers;
    this.closedReported = false;

    const pc = this.createPeerConnection();
    this.pc = pc;
    const micStream = this.options.micStream;
    for (const track of micStream.getAudioTracks()) {
      track.enabled = !this.muted;
      pc.addTrack(track, micStream);
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      // Chrome workaround: a remote audio track stays silent unless attached
      // to a media element; keep it muted and route audio through Web Audio.
      const element = this.createAudioElement();
      this.audioElement = element;
      element.muted = true;
      element.srcObject = stream;
      void Promise.resolve(element.play()).catch(() => {});
      this.options.onRemoteTrack?.(stream);
    };

    const channel = pc.createDataChannel("oai-events");
    this.dataChannel = channel;

    let settled = false;
    let readyResolve: () => void = () => {};
    let readyReject: (error: Error) => void = () => {};
    const channelReady = new Promise<void>((resolve, reject) => {
      readyResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      readyReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
    });
    channelReady.catch(() => {});

    channel.onmessage = (event) => this.handleMessage(event.data);
    channel.onopen = () => readyResolve();
    channel.onclose = () => {
      readyReject(new Error("Realtime data channel closed before opening"));
      this.reportClosed("data_channel_closed");
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "failed":
        case "closed":
          this.clearDisconnectTimer();
          readyReject(new Error(`Realtime peer connection ${pc.connectionState} before data channel opened`));
          this.reportClosed(`peer_${pc.connectionState}`);
          break;
        case "disconnected":
          if (this.disconnectTimer === null) {
            this.disconnectTimer = this.schedule(() => {
              this.disconnectTimer = null;
              if (this.pc === pc && pc.connectionState === "disconnected") {
                readyReject(new Error("Realtime peer connection stayed disconnected"));
                this.reportClosed("peer_disconnected");
              }
            }, PEER_DISCONNECTED_GRACE_MS);
          }
          break;
        case "connected":
        case "connecting":
        case "new":
          this.clearDisconnectTimer();
          break;
        default: {
          const exhaustive: never = pc.connectionState;
          return exhaustive;
        }
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await this.fetchImpl(`${this.baseUrl}?model=${encodeURIComponent(this.options.model)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.secret}`, "Content-Type": "application/sdp" },
        body: offer.sdp ?? ""
      });
      if (!response.ok) throw new Error(`Realtime SDP exchange failed: ${response.status}`);
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      this.teardown();
      throw error;
    }

    if (channel.readyState === "open") readyResolve();
    const timer = this.schedule(() => {
      readyReject(new Error("Timed out waiting for the Realtime data channel to open"));
    }, DATA_CHANNEL_READY_TIMEOUT_MS);
    try {
      await channelReady;
    } catch (error) {
      this.teardown();
      throw error;
    } finally {
      this.cancel(timer);
    }
  }

  /** A page-side fact or re-seed as a text conversation item; no response is created. */
  sendText(text: string): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: this.textRole, content: [{ type: "input_text", text }] }
    });
  }

  /**
   * A screenshot the interviewer asked for (`look_at_screen`). Image content is
   * only valid on a `user` message, so the role is fixed here regardless of
   * `textRole`; the caption travels in the same item so the model reads them
   * together.
   */
  sendImage(text: string, jpegBase64: string): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          { type: "input_image", image_url: `data:image/jpeg;base64,${jpegBase64}` },
          { type: "input_text", text }
        ]
      }
    });
  }

  /** The `function_call_output` item alone; the interviewer decides whether a response follows (KTD6). */
  sendToolResult(result: LiveToolResult): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: result.call_id, output: JSON.stringify(result.output) }
    });
  }

  createResponse(): void {
    this.send({ type: "response.create" });
  }

  cancelResponse(): void {
    this.send({ type: "response.cancel" });
  }

  updateSession(patch: Record<string, unknown>): void {
    this.send({ type: "session.update", session: patch });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of this.options.micStream.getAudioTracks()) track.enabled = !muted;
    if (!this.pc) return;
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind === "audio") sender.track.enabled = !muted;
    }
  }

  close(): void {
    this.closedReported = true;
    this.teardown();
  }

  private handleMessage(data: unknown): void {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch (error) {
      this.onParseError?.(error, data);
      return;
    }
    const t = this.elapsed();
    const event = parseRealtimeEvent(raw, {
      t,
      utteranceStart: this.utteranceStart,
      utteranceEnd: this.utteranceEnd,
      spans: this.spans
    });
    if (!event) return;
    const itemId = asString(asRecord(raw).item_id);
    if (event.type === "speech_started") {
      this.utteranceStart = event.t;
      this.utteranceEnd = null;
      if (itemId) this.rememberSpan(itemId, { start: event.t, end: null });
    } else if (event.type === "speech_stopped") {
      this.utteranceEnd = event.t;
      const span = itemId ? this.spans.get(itemId) : undefined;
      if (span) span.end = event.t;
      else if (itemId && this.utteranceStart !== null) this.rememberSpan(itemId, { start: this.utteranceStart, end: event.t });
    } else if (event.type === "transcript" && itemId) {
      this.spans.delete(itemId);
    }
    this.dispatch(event);
  }

  private dispatch(event: RealtimeServerEvent): void {
    const handlers = this.handlers;
    if (!handlers) return;
    try {
      const result = handlers.onEvent(event);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((error) => this.onParseError?.(error, event));
      }
    } catch (error) {
      this.onParseError?.(error, event);
    }
  }

  private rememberSpan(itemId: string, span: UtteranceSpan): void {
    this.spans.set(itemId, span);
    while (this.spans.size > UTTERANCE_SPAN_LIMIT) {
      const oldest = this.spans.keys().next().value;
      if (oldest === undefined) break;
      this.spans.delete(oldest);
    }
  }

  /** A lost call: tell the interviewer once, then release the peer, element, and mic clone. */
  private reportClosed(reason: string): void {
    if (this.closedReported) return;
    this.closedReported = true;
    this.dispatch({ type: "closed", reason });
    this.teardown();
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer !== null) {
      this.cancel(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private teardown(): void {
    this.clearDisconnectTimer();
    const channel = this.dataChannel;
    this.dataChannel = null;
    if (channel) {
      channel.onmessage = null;
      channel.onopen = null;
      channel.onclose = null;
      try {
        channel.close();
      } catch {
        // Already closed.
      }
    }
    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        // Already closed.
      }
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
  }

  private send(payload: Record<string, unknown>): void {
    const channel = this.dataChannel;
    if (!channel || channel.readyState !== "open") throw new Error("Realtime data channel is not open");
    channel.send(JSON.stringify(payload));
  }
}

// --- Connector -------------------------------------------------------------

export interface RealtimeConnectorOptions {
  microphone: SharedMicrophone;
  /** The session clock: milliseconds since `LiveSession.startedAt`, so transcript spans match the session. */
  elapsed: () => number;
  /** Web Audio context for the audible path; null disables routing (tests, no-audio hosts). */
  audioContext?: AudioContextLike | null;
  deps?: Omit<RealtimeClientDeps, "elapsed">;
}

export interface RealtimeConnector {
  /** The interviewer's `connect` option: one client per secret, over a fresh microphone clone. */
  connect(secret: LiveMintResponse): RealtimeClient;
  /** The current remote-audio route, for the reachability assertion (KTD6). */
  readonly route: RemoteAudioRoute | null;
  readonly client: RealtimeClient | null;
  dispose(): void;
}

/**
 * Production wiring for `createInterviewer({ connect })`: every connection
 * takes a new clone of the shared microphone (KTD21), and the remote track is
 * routed through the explicit Web Audio chain (KTD6). A reconnect disposes the
 * previous route before building the next, so exactly one path is audible.
 */
export function createRealtimeConnector(options: RealtimeConnectorOptions): RealtimeConnector {
  const audioContext = options.audioContext === undefined ? createDefaultAudioContext() : options.audioContext;
  let route: RemoteAudioRoute | null = null;
  let client: RealtimeClient | null = null;
  const disposeRoute = (): void => {
    route?.dispose();
    route = null;
  };
  return {
    connect: (secret) => {
      client?.close();
      disposeRoute();
      const micStream = options.microphone.clone("realtime");
      client = new RealtimeClient({
        secret: secret.client_secret,
        model: secret.model,
        micStream,
        onRemoteTrack: (stream) => {
          disposeRoute();
          if (audioContext) route = routeRemoteAudio(audioContext, stream);
        },
        deps: { ...options.deps, elapsed: options.elapsed }
      });
      return client;
    },
    get route() {
      return route;
    },
    get client() {
      return client;
    },
    dispose: () => {
      client?.close();
      client = null;
      disposeRoute();
      options.microphone.release("realtime");
    }
  };
}

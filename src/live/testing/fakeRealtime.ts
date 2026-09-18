import type { LiveTranscript } from "../contract";
import type { LiveToolCall, LiveToolResult } from "../tools";
import type { RealtimeSessionConfig } from "../realtime/sessionConfig";

/**
 * Scripted stand-in for the OpenAI Realtime data channel. It emits the events
 * the interviewer reacts to (session config, speech start/stop, transcripts,
 * tool calls, response lifecycle) without WebRTC, and records everything the
 * interviewer sends back (text and image items, tool results, response
 * control, session updates) so tests can assert on ordering.
 */

export type FakeRealtimeServerEvent =
  | { type: "session_created"; session: RealtimeSessionConfig }
  | { type: "speech_started"; t: number }
  | { type: "speech_stopped"; t: number }
  | { type: "transcript"; transcript: LiveTranscript }
  | { type: "tool_call"; call: LiveToolCall }
  | { type: "response_started"; response_id: string }
  | { type: "response_done"; response_id: string }
  | { type: "error"; message: string }
  | { type: "closed"; reason?: string };

export type FakeRealtimeClientAction =
  | { type: "send_text"; text: string }
  | { type: "send_image"; text: string; jpegBase64: string }
  | { type: "send_tool_result"; result: LiveToolResult }
  | { type: "create_response" }
  | { type: "cancel_response" }
  | { type: "update_session"; patch: Record<string, unknown> }
  | { type: "set_muted"; muted: boolean }
  | { type: "close" };

export interface FakeRealtimeHandlers {
  onEvent: (event: FakeRealtimeServerEvent) => void | Promise<void>;
}

export type FakeRealtimeScript = readonly FakeRealtimeServerEvent[];

export class FakeRealtime {
  /** Every event emitted into the interviewer, in order. */
  readonly emitted: FakeRealtimeServerEvent[] = [];
  /** Every action the interviewer took, in order. */
  readonly actions: FakeRealtimeClientAction[] = [];
  muted = false;
  closed = false;

  private handlers: FakeRealtimeHandlers | null = null;
  private nextCallId = 1;

  connect(handlers: FakeRealtimeHandlers): void {
    this.handlers = handlers;
    this.closed = false;
  }

  get connected(): boolean {
    return this.handlers !== null && !this.closed;
  }

  /** Emits one server event and awaits the interviewer's handling of it. */
  async emit(event: FakeRealtimeServerEvent): Promise<void> {
    if (!this.handlers) throw new Error("FakeRealtime.emit called before connect()");
    this.emitted.push(event);
    if (event.type === "closed") this.closed = true;
    await this.handlers.onEvent(event);
  }

  /** Replays a script in order, awaiting each step before the next. */
  async replay(script: FakeRealtimeScript): Promise<void> {
    for (const event of script) await this.emit(event);
  }

  /** Builds a `tool_call` event with a fresh `call_id` when none is given. */
  toolCall<C extends LiveToolCall>(call: Omit<C, "call_id"> & { call_id?: string }): FakeRealtimeServerEvent {
    const callId = call.call_id ?? `call_${String(this.nextCallId++).padStart(4, "0")}`;
    return { type: "tool_call", call: { ...call, call_id: callId } as unknown as LiveToolCall };
  }

  // Client -> server surface the interviewer drives.

  sendText(text: string): void {
    this.record({ type: "send_text", text });
  }

  sendImage(text: string, jpegBase64: string): void {
    this.record({ type: "send_image", text, jpegBase64 });
  }

  sendToolResult(result: LiveToolResult): void {
    this.record({ type: "send_tool_result", result });
  }

  createResponse(): void {
    this.record({ type: "create_response" });
  }

  cancelResponse(): void {
    this.record({ type: "cancel_response" });
  }

  updateSession(patch: Record<string, unknown>): void {
    this.record({ type: "update_session", patch });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.record({ type: "set_muted", muted });
  }

  close(): void {
    this.closed = true;
    this.record({ type: "close" });
  }

  // Assertion helpers.

  get toolResults(): LiveToolResult[] {
    return this.actions.flatMap((action) => (action.type === "send_tool_result" ? [action.result] : []));
  }

  get sentTexts(): string[] {
    return this.actions.flatMap((action) => (action.type === "send_text" ? [action.text] : []));
  }

  get sentImages(): Array<{ text: string; jpegBase64: string }> {
    return this.actions.flatMap((action) => (action.type === "send_image" ? [{ text: action.text, jpegBase64: action.jpegBase64 }] : []));
  }

  actionsNamed<T extends FakeRealtimeClientAction["type"]>(type: T): Extract<FakeRealtimeClientAction, { type: T }>[] {
    return this.actions.filter((action): action is Extract<FakeRealtimeClientAction, { type: T }> => action.type === type);
  }

  private record(action: FakeRealtimeClientAction): void {
    if (!this.connected && action.type !== "close") {
      throw new Error(`FakeRealtime received ${action.type} while not connected`);
    }
    this.actions.push(action);
  }
}

export function createFakeRealtime(): FakeRealtime {
  return new FakeRealtime();
}

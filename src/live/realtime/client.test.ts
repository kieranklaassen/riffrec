// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedMicrophone, type AudioContextLike, type AudioNodeLike, type AudioTrackLike, type GainNodeLike } from "./audioRouting";
import {
  DATA_CHANNEL_READY_TIMEOUT_MS,
  REALTIME_CALLS_URL,
  RealtimeClient,
  createRealtimeConnector,
  parseRealtimeEvent,
  type RealtimeServerEvent
} from "./client";

// --- Fakes -----------------------------------------------------------------

class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  readonly sent: Record<string, unknown>[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.readyState = "closed";
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  serverClose(): void {
    this.readyState = "closed";
    this.onclose?.();
  }

  named(type: string): Record<string, unknown>[] {
    return this.sent.filter((message) => message.type === type);
  }
}

class FakeTrack implements AudioTrackLike {
  enabled = true;
  readonly kind = "audio";
  readyState: MediaStreamTrackState = "live";
  readonly clones: FakeTrack[] = [];

  constructor(readonly label: string) {}

  clone(): FakeTrack {
    const clone = new FakeTrack(`${this.label}#${this.clones.length + 1}`);
    this.clones.push(clone);
    return clone;
  }

  stop(): void {
    this.readyState = "ended";
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  readonly senders: Array<{ track: FakeTrack }> = [];
  readonly channel = new FakeDataChannel();
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  closed = false;

  addTrack(track: MediaStreamTrack): void {
    this.senders.push({ track: track as unknown as FakeTrack });
  }

  getSenders(): Array<{ track: FakeTrack }> {
    return this.senders;
  }

  createDataChannel(): RTCDataChannel {
    return this.channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0 offer" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
  }

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }

  emitRemoteTrack(stream: MediaStream): void {
    this.ontrack?.({ streams: [stream], track: { kind: "audio" } } as unknown as RTCTrackEvent);
  }

  fail(): void {
    this.connectionState = "failed";
    this.onconnectionstatechange?.();
  }
}

function fakeStream(tracks: AudioTrackLike[], id = "mic"): MediaStream {
  return { id, getAudioTracks: () => tracks, getTracks: () => tracks } as unknown as MediaStream;
}

class FakeGraph {
  readonly edges = new Map<AudioNodeLike, Set<AudioNodeLike>>();
  readonly destination = this.node("destination");
  readonly sources: AudioNodeLike[] = [];

  node(label: string): AudioNodeLike {
    const graph = this;
    const node: AudioNodeLike & { label: string } = {
      label,
      connect(target) {
        const set = graph.edges.get(node) ?? new Set<AudioNodeLike>();
        set.add(target);
        graph.edges.set(node, set);
        return target;
      },
      disconnect() {
        graph.edges.delete(node);
      }
    };
    return node;
  }

  context(): AudioContextLike {
    const graph = this;
    return {
      destination: graph.destination,
      state: "running",
      createMediaStreamSource(stream: MediaStream) {
        const source = graph.node(`source:${stream.id}`);
        graph.sources.push(source);
        return source;
      },
      createGain(): GainNodeLike {
        return Object.assign(graph.node("gain"), { gain: { value: 1 } });
      }
    };
  }

  reaches(from: AudioNodeLike, to: AudioNodeLike): boolean {
    const seen = new Set<AudioNodeLike>();
    const stack = [from];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === to) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of this.edges.get(node) ?? []) stack.push(next);
    }
    return false;
  }
}

interface Harness {
  pc: FakePeerConnection;
  client: RealtimeClient;
  events: RealtimeServerEvent[];
  requests: Array<{ url: string; init: RequestInit | undefined }>;
  track: FakeTrack;
  audioElements: HTMLAudioElement[];
  connect(): Promise<void>;
}

function harness(options: { sdpStatus?: number; elapsed?: () => number } = {}): Harness {
  const pc = new FakePeerConnection();
  const track = new FakeTrack("mic");
  const requests: Harness["requests"] = [];
  const audioElements: HTMLAudioElement[] = [];
  const events: RealtimeServerEvent[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response("v=0 answer", { status: options.sdpStatus ?? 200, headers: { "Content-Type": "application/sdp" } });
  };
  const client = new RealtimeClient({
    secret: "ek_test",
    model: "gpt-realtime",
    micStream: fakeStream([track]),
    deps: {
      fetchImpl,
      createPeerConnection: () => pc as unknown as RTCPeerConnection,
      createAudioElement: () => {
        const element = { muted: false, srcObject: null, play: () => Promise.resolve(), pause: () => {} } as unknown as HTMLAudioElement;
        audioElements.push(element);
        return element;
      },
      elapsed: options.elapsed ?? (() => 4200)
    }
  });
  return {
    pc,
    client,
    events,
    requests,
    track,
    audioElements,
    connect: async () => {
      const pending = client.connect({
        onEvent: (event) => {
          events.push(event);
        }
      });
      await vi.waitFor(() => expect(pc.remoteDescription).not.toBeNull());
      pc.channel.open();
      await pending;
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// --- parseRealtimeEvent ----------------------------------------------------

describe("parseRealtimeEvent", () => {
  const context = { t: 5000, utteranceStart: 4000, utteranceEnd: 4800 };

  it("maps speech, transcript, response, tool-call, and error events narrowly", () => {
    expect(parseRealtimeEvent({ type: "input_audio_buffer.speech_started" }, context)).toEqual({ type: "speech_started", t: 5000 });
    expect(parseRealtimeEvent({ type: "input_audio_buffer.speech_stopped" }, context)).toEqual({ type: "speech_stopped", t: 5000 });
    expect(
      parseRealtimeEvent(
        { type: "conversation.item.input_audio_transcription.completed", item_id: "item_1", transcript: " make this red " },
        context
      )
    ).toEqual({
      type: "transcript",
      transcript: { id: "item_1", role: "riffer", text: "make this red", t_start: 4000, t_end: 4800, final: true }
    });
    expect(
      parseRealtimeEvent({ type: "response.output_audio_transcript.done", item_id: "item_2", transcript: "Which button?" }, context)
    ).toEqual({
      type: "transcript",
      transcript: { id: "item_2", role: "interviewer", text: "Which button?", t_start: 5000, t_end: 5000, final: true }
    });
    expect(parseRealtimeEvent({ type: "response.created", response: { id: "resp_1" } }, context)).toEqual({
      type: "response_started",
      response_id: "resp_1"
    });
    expect(parseRealtimeEvent({ type: "response.done", response: { id: "resp_1", status: "completed" } }, context)).toEqual({
      type: "response_done",
      response_id: "resp_1"
    });
    expect(
      parseRealtimeEvent(
        {
          type: "response.function_call_arguments.done",
          call_id: "call_1",
          name: "record_unit",
          arguments: JSON.stringify({ statement: "Make it red.", anchors: ["anchor_0001"], transcript_excerpt: "make this red" })
        },
        context
      )
    ).toEqual({
      type: "tool_call",
      call: {
        call_id: "call_1",
        name: "record_unit",
        arguments: { statement: "Make it red.", anchors: ["anchor_0001"], transcript_excerpt: "make this red" }
      }
    });
    expect(parseRealtimeEvent({ type: "error", error: { code: "conversation_already_has_active_response", message: "busy" } }, context)).toEqual({
      type: "error",
      message: "conversation_already_has_active_response: busy"
    });
  });

  it("ignores unknown events and reports unknown tools as errors instead of tool calls", () => {
    expect(parseRealtimeEvent({ type: "session.created" }, context)).toBeNull();
    expect(parseRealtimeEvent("garbage", context)).toBeNull();
    expect(parseRealtimeEvent({ type: "response.function_call_arguments.done", call_id: "c", name: "emit_checkpoint" }, context)).toEqual({
      type: "error",
      message: "Unknown tool call: emit_checkpoint"
    });
  });
});

// --- RealtimeClient --------------------------------------------------------

describe("RealtimeClient", () => {
  it("posts the SDP offer with the ephemeral secret and resolves once the data channel opens", async () => {
    const h = harness();
    await h.connect();

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].url).toBe(`${REALTIME_CALLS_URL}?model=gpt-realtime`);
    expect(h.requests[0].init?.headers).toMatchObject({ Authorization: "Bearer ek_test", "Content-Type": "application/sdp" });
    expect(h.requests[0].init?.body).toBe("v=0 offer");
    expect(h.pc.remoteDescription).toEqual({ type: "answer", sdp: "v=0 answer" });
    expect(h.pc.senders.map((sender) => sender.track)).toEqual([h.track]);
    expect(h.client.connected).toBe(true);
  });

  it("never acquires a microphone of its own: the injected clone is the only track sent", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const h = harness();
    await h.connect();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(h.pc.senders).toHaveLength(1);
  });

  it("parses data-channel messages into typed events and stamps transcript spans from speech events", async () => {
    let t = 1000;
    const h = harness({ elapsed: () => t });
    await h.connect();

    h.pc.channel.receive({ type: "input_audio_buffer.speech_started" });
    t = 2500;
    h.pc.channel.receive({ type: "input_audio_buffer.speech_stopped" });
    t = 2900;
    h.pc.channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "item_9", transcript: "move it left" });
    h.pc.channel.receive({ type: "rate_limits.updated" });
    h.pc.channel.receive("not json");

    expect(h.events).toEqual([
      { type: "speech_started", t: 1000 },
      { type: "speech_stopped", t: 2500 },
      {
        type: "transcript",
        transcript: { id: "item_9", role: "riffer", text: "move it left", t_start: 1000, t_end: 2500, final: true }
      }
    ]);
  });

  it("sends items in the Realtime wire shapes and keeps tool results free of response.create", async () => {
    const h = harness();
    await h.connect();

    h.client.sendText("[PAGE] The riffer drew on the sidebar toggle (anchor id: anchor_0001).");
    h.client.sendToolResult({ call_id: "call_1", output: { ok: true, unit_id: "unit_0001" } });
    h.client.updateSession({ instructions: "x" });
    h.client.createResponse();
    h.client.cancelResponse();

    const sent = h.pc.channel.sent;
    expect(sent.map((message) => message.type)).toEqual([
      "conversation.item.create",
      "conversation.item.create",
      "session.update",
      "response.create",
      "response.cancel"
    ]);
    expect(sent[0].item).toEqual({
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "[PAGE] The riffer drew on the sidebar toggle (anchor id: anchor_0001)." }]
    });
    expect(sent[1].item).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: JSON.stringify({ ok: true, unit_id: "unit_0001" })
    });
    expect(sent[2].session).toEqual({ instructions: "x" });
  });

  it("mute flips the injected track and the sender, and a client built from a muted clone starts muted", async () => {
    const h = harness();
    await h.connect();
    h.client.setMuted(true);
    expect(h.track.enabled).toBe(false);
    expect(h.pc.senders[0].track.enabled).toBe(false);
    h.client.setMuted(false);
    expect(h.track.enabled).toBe(true);

    const mutedTrack = new FakeTrack("muted");
    mutedTrack.enabled = false;
    const muted = new RealtimeClient({ secret: "ek", model: "m", micStream: fakeStream([mutedTrack]) });
    expect(muted.isMuted).toBe(true);
  });

  it("attaches the remote stream to a muted element and hands it to onRemoteTrack", async () => {
    const pc = new FakePeerConnection();
    const remote: MediaStream[] = [];
    const elements: HTMLAudioElement[] = [];
    const client = new RealtimeClient({
      secret: "ek",
      model: "m",
      micStream: fakeStream([new FakeTrack("mic")]),
      onRemoteTrack: (stream) => remote.push(stream),
      deps: {
        fetchImpl: async () => new Response("v=0 answer", { status: 200 }),
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        createAudioElement: () => {
          const element = { muted: false, srcObject: null, play: () => Promise.resolve(), pause: () => {} } as unknown as HTMLAudioElement;
          elements.push(element);
          return element;
        }
      }
    });
    const pending = client.connect({ onEvent: () => {} });
    await vi.waitFor(() => expect(pc.remoteDescription).not.toBeNull());
    pc.channel.open();
    await pending;

    const stream = fakeStream([], "remote");
    pc.emitRemoteTrack(stream);
    expect(remote).toEqual([stream]);
    expect(elements).toHaveLength(1);
    expect(elements[0].muted).toBe(true);
    expect(elements[0].srcObject).toBe(stream);
  });

  it("reports a server-side close exactly once and refuses sends afterwards", async () => {
    const h = harness();
    await h.connect();
    h.pc.channel.serverClose();
    h.pc.fail();
    expect(h.events.filter((event) => event.type === "closed")).toEqual([{ type: "closed", reason: "data_channel_closed" }]);
    expect(() => h.client.sendText("x")).toThrow(/not open/);
    expect(h.client.connected).toBe(false);
  });

  it("does not report a close the page asked for", async () => {
    const h = harness();
    await h.connect();
    h.client.close();
    h.pc.channel.serverClose();
    expect(h.events.some((event) => event.type === "closed")).toBe(false);
    expect(h.pc.closed).toBe(true);
  });

  it("rejects and tears down when the SDP exchange fails", async () => {
    const h = harness({ sdpStatus: 401 });
    await expect(h.client.connect({ onEvent: () => {} })).rejects.toThrow(/SDP exchange failed: 401/);
    expect(h.pc.closed).toBe(true);
    expect(h.client.connected).toBe(false);
  });

  it("times out when the data channel never opens", async () => {
    vi.useFakeTimers();
    const h = harness();
    const pending = h.client.connect({ onEvent: () => {} });
    pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(DATA_CHANNEL_READY_TIMEOUT_MS + 1);
    await expect(pending).rejects.toThrow(/Timed out/);
    expect(h.pc.closed).toBe(true);
  });
});

// --- createRealtimeConnector -----------------------------------------------

describe("createRealtimeConnector", () => {
  async function connectThrough(
    connector: ReturnType<typeof createRealtimeConnector>,
    pcs: FakePeerConnection[],
    secret: string
  ): Promise<RealtimeClient> {
    const client = connector.connect({ client_secret: secret, expires_at: 0, model: "gpt-realtime" });
    const pending = client.connect({ onEvent: () => {} });
    const pc = pcs[pcs.length - 1];
    await vi.waitFor(() => expect(pc.remoteDescription).not.toBeNull());
    pc.channel.open();
    await pending;
    return client;
  }

  it("clones the shared microphone per connection and routes the remote track to the destination, fresh and reconnected", async () => {
    const source = new FakeTrack("mic");
    const microphone = new SharedMicrophone(
      { getAudioTracks: () => [source] },
      { createStream: (tracks) => fakeStream(tracks, "clone") }
    );
    const graph = new FakeGraph();
    const pcs: FakePeerConnection[] = [];
    const connector = createRealtimeConnector({
      microphone,
      audioContext: graph.context(),
      deps: {
        fetchImpl: async () => new Response("v=0 answer", { status: 200 }),
        createPeerConnection: () => {
          const pc = new FakePeerConnection();
          pcs.push(pc);
          return pc as unknown as RTCPeerConnection;
        },
        createAudioElement: () =>
          ({ muted: false, srcObject: null, play: () => Promise.resolve(), pause: () => {} }) as unknown as HTMLAudioElement
      }
    });

    await connectThrough(connector, pcs, "ek_first");
    pcs[0].emitRemoteTrack(fakeStream([], "remote-1"));
    expect(connector.route?.isReachable()).toBe(true);
    expect(graph.reaches(graph.sources[0], graph.destination)).toBe(true);
    expect(source.clones).toHaveLength(1);
    expect(pcs[0].senders[0].track).toBe(source.clones[0]);

    microphone.setMuted(true);
    await connectThrough(connector, pcs, "ek_second");
    pcs[1].emitRemoteTrack(fakeStream([], "remote-2"));

    expect(pcs[0].closed).toBe(true);
    expect(source.clones).toHaveLength(2);
    expect(source.clones[0].readyState).toBe("ended");
    expect(source.clones[1].enabled).toBe(false);
    expect(connector.client?.isMuted).toBe(true);
    expect(graph.reaches(graph.sources[0], graph.destination)).toBe(false);
    expect(graph.reaches(graph.sources[1], graph.destination)).toBe(true);
    expect(connector.route?.isReachable()).toBe(true);

    connector.dispose();
    expect(connector.route).toBeNull();
    expect(graph.reaches(graph.sources[1], graph.destination)).toBe(false);
    expect(source.clones[1].readyState).toBe("ended");
  });
});

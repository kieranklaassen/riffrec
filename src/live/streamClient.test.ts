// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFrameStore, UnsentQueue } from "./buffer";
import {
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  type LiveEnvelope,
  type LiveEventType,
  type LivePayloadMap,
  type LiveServerEvent
} from "./contract";
import { StreamClient, parseServerEventBlock, type StreamClientState } from "./streamClient";
import { createFakeEndpoint, type FakeEndpoint } from "./testing/fakeEndpoint";

const SESSION_ID = "sess_stream_test";

function envelope<T extends LiveEventType>(seq: number, type: T, payload: LivePayloadMap[T]): LiveEnvelope<T> {
  return { schema_version: LIVE_SCHEMA_VERSION, session_id: SESSION_ID, seq, t: seq * 10, type, payload } as LiveEnvelope<T>;
}

function micEnvelope(seq: number): LiveEnvelope<"mic"> {
  return envelope(seq, "mic", { state: "granted" });
}

function frameEnvelope(seq: number, bytes: number, id = `frame_${seq}`): LiveEnvelope<"frame"> {
  return envelope(seq, "frame", { id, t: seq * 10, route: "/", kind: "gesture", jpeg_base64: "a".repeat(bytes) });
}

interface Harness {
  endpoint: FakeEndpoint;
  client: StreamClient;
  queue: UnsentQueue;
  states: StreamClientState[];
  serverEvents: LiveServerEvent[];
  ended: Array<string | undefined>;
  setDown(down: boolean): void;
  requests: Array<{ url: string; init: RequestInit | undefined }>;
}

function harness(options: { endpoint?: FakeEndpoint; token?: string } = {}): Harness {
  const endpoint = options.endpoint ?? createFakeEndpoint();
  let down = false;
  const requests: Harness["requests"] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    requests.push({ url: String(input), init });
    if (down) return Promise.reject(new TypeError("Failed to fetch"));
    return endpoint.fetch(input, init);
  };
  const queue = new UnsentQueue(SESSION_ID, new MemoryFrameStore());
  const states: StreamClientState[] = [];
  const serverEvents: LiveServerEvent[] = [];
  const ended: Array<string | undefined> = [];
  const client = new StreamClient({
    endpoint: endpoint.baseUrl,
    token: options.token ?? endpoint.pageToken,
    sessionId: SESSION_ID,
    queue,
    fetch: fetchImpl,
    schedule: (callback) => queueMicrotask(callback),
    backoffMs: [5, 5, 5],
    onStateChange: (state) => states.push(state),
    onServerEvent: (event) => serverEvents.push(event),
    onEnded: (reason) => ended.push(reason)
  });
  return {
    endpoint,
    client,
    queue,
    states,
    serverEvents,
    ended,
    requests,
    setDown: (value) => {
      down = value;
    }
  };
}

function postBodies(requests: Harness["requests"]): LiveEnvelope[][] {
  return requests
    .filter((request) => request.url.endsWith("/events") && request.init?.method === "POST")
    .map((request) => JSON.parse(String(request.init?.body)) as LiveEnvelope[]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StreamClient", () => {
  it("sends the bearer token and session header on the first POST and tracks acked_seq", async () => {
    const h = harness();
    h.client.start();
    h.client.enqueue(micEnvelope(1));
    h.client.enqueue(micEnvelope(2));

    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(2));

    const first = h.requests.find((request) => request.url.endsWith("/events"))!;
    const headers = new Headers(first.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${h.endpoint.pageToken}`);
    expect(headers.get(LIVE_SESSION_HEADER)).toBe(SESSION_ID);
    expect(h.queue.isEmpty).toBe(true);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(h.states).toEqual(["streaming"]);
    h.client.close();
  });

  it("batches envelopes queued in the same tick into one POST", async () => {
    const h = harness();
    h.client.start();
    for (let seq = 1; seq <= 5; seq += 1) h.client.enqueue(micEnvelope(seq));

    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(5));

    const bodies = postBodies(h.requests);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
    h.client.close();
  });

  it("flips to buffering after three failures and replays from the last ack when the endpoint returns", async () => {
    const h = harness();
    h.client.start();
    for (let seq = 1; seq <= 10; seq += 1) h.client.enqueue(micEnvelope(seq));
    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(10));

    h.setDown(true);
    for (let seq = 11; seq <= 40; seq += 1) h.client.enqueue(micEnvelope(seq));

    await vi.waitFor(() => expect(h.client.state).toBe("buffering"));
    expect(h.client.consecutiveFailures).toBeGreaterThanOrEqual(3);
    expect(h.queue.length).toBe(30);
    expect(h.queue.headSeq).toBe(11);
    expect(h.endpoint.ackedSeq).toBe(10);

    const failedBefore = postBodies(h.requests).length;
    h.setDown(false);

    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(40));
    const replay = postBodies(h.requests).slice(failedBefore);
    expect(replay[0][0].seq).toBe(11);
    expect(h.client.state).toBe("streaming");
    expect(h.states).toEqual(["streaming", "buffering", "streaming"]);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    h.client.close();
  });

  it("posts a lone 1.5 MB frame in its own body", async () => {
    const h = harness();
    h.client.start();
    h.client.enqueue(micEnvelope(1));
    h.client.enqueue(frameEnvelope(2, 1.5 * 1024 * 1024));
    h.client.enqueue(micEnvelope(3));

    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(3));

    const bodies = postBodies(h.requests);
    expect(bodies.map((body) => body.map((entry) => entry.type))).toEqual([["mic"], ["frame"], ["mic"]]);
    expect(h.endpoint.frames[0].jpeg_base64).toHaveLength(1.5 * 1024 * 1024);
    h.client.close();
  });

  it("treats a 413 on a frame as a drop, not a failure, and keeps the seq contiguous", async () => {
    const h = harness();
    const dropped: LiveEnvelope<"frame">[] = [];
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: h.endpoint.fetch,
      schedule: (callback) => queueMicrotask(callback),
      onFrameDropped: (envelope) => dropped.push(envelope)
    });
    client.start();
    client.enqueue(micEnvelope(1));
    client.enqueue(frameEnvelope(2, 3 * 1024 * 1024));
    client.enqueue(micEnvelope(3));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(3));

    expect(dropped).toHaveLength(1);
    expect(dropped[0].payload).toMatchObject({ id: "frame_2", jpeg_base64: "", dropped: "oversize" });
    expect(client.consecutiveFailures).toBe(0);
    expect(client.state).toBe("streaming");
    expect(h.endpoint.frames).toEqual([expect.objectContaining({ id: "frame_2", dropped: "oversize" })]);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    client.close();
  });

  it("shrinks a lone oversized unit after a 413 instead of retrying it forever", async () => {
    const h = harness();
    const errors: unknown[] = [];
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: h.endpoint.fetch,
      schedule: (callback) => queueMicrotask(callback),
      onError: (error) => errors.push(error)
    });
    client.start();
    client.enqueue(micEnvelope(1));
    client.enqueue(
      envelope(2, "unit", {
        id: "unit_big",
        statement: "Fix the crash",
        transcript_excerpt: "fix the crash",
        anchors: [],
        evidence: {
          frame_ids: [],
          annotation_ids: [],
          transcript_span: { t_start: 0, t_end: 1 },
          telemetry_window: {
            t_start: 0,
            t_end: 1,
            events: [{ t: 0, type: "console_error", message: "x".repeat(70 * 1024), stack: null, component: null }]
          }
        },
        status: "initial"
      })
    );
    client.enqueue(micEnvelope(3));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(3));

    expect(client.consecutiveFailures).toBe(0);
    expect(client.state).toBe("streaming");
    expect(h.endpoint.units.get("unit_big")?.evidence.telemetry_window).toBeUndefined();
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(errors).toHaveLength(1);
    client.close();
  });

  it("replaces a lone oversized envelope that cannot shrink with a same-seq filler", async () => {
    const h = harness();
    let rejectOnce = true;
    const fetchImpl: typeof fetch = async (input, init) => {
      if (rejectOnce && String(input).endsWith("/events") && init?.method === "POST") {
        rejectOnce = false;
        return new Response(JSON.stringify({ max_bytes: 1 }), { status: 413 });
      }
      return h.endpoint.fetch(input, init);
    };
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      elapsed: () => 4242
    });
    client.start();
    client.enqueue(envelope(1, "transcript", { id: "tr", role: "riffer", text: "hello", t_start: 0, t_end: 1, final: true }));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(1));

    expect(h.endpoint.received).toEqual([
      expect.objectContaining({ seq: 1, t: 4242, type: "stream_state", payload: { state: "buffering" } })
    ]);
    client.close();
  });

  it("replaces an envelope the endpoint rejects with 400 instead of retrying it forever, and keeps the rest flowing", async () => {
    const h = harness();
    const errors: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/events") && init?.method === "POST") {
        const batch = JSON.parse(String(init.body)) as LiveEnvelope[];
        const poison = batch.find((entry) => entry.type === "mic" && (entry.payload as { state: string }).state === "granted" && entry.seq === 2);
        if (poison) return new Response(JSON.stringify({ reason: "invalid_payload", seq: 2 }), { status: 400 });
      }
      return h.endpoint.fetch(input, init);
    };
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      backoffMs: [5, 5, 5],
      elapsed: () => 777,
      onError: (error) => errors.push(error)
    });
    client.start();
    client.enqueue(micEnvelope(1));
    client.enqueue(micEnvelope(2));
    client.enqueue(envelope(3, "mic", { state: "muted" }));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(3));

    expect(h.endpoint.received.map((entry) => [entry.seq, entry.type, entry.payload])).toEqual([
      [1, "mic", { state: "granted" }],
      [2, "stream_state", { state: "buffering" }],
      [3, "mic", { state: "muted" }]
    ]);
    expect(client.state).toBe("streaming");
    expect(client.consecutiveFailures).toBe(0);
    expect(String(errors[0])).toMatch(/rejected seq 2 as invalid_payload/);
    client.close();
  });

  it("a 400 without a seq in the batch (a proxy page, a body-level error) is a plain failure and the batch stays queued", async () => {
    const h = harness();
    const errors: unknown[] = [];
    const bodies = [
      new Response("<html>Bad Request</html>", { status: 400, headers: { "Content-Type": "text/html" } }),
      new Response(JSON.stringify({ error: "body must be an envelope or an array of envelopes" }), { status: 400 }),
      new Response(JSON.stringify({ reason: "invalid_payload", seq: 999 }), { status: 400 })
    ];
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/events") && init?.method === "POST") {
        const canned = bodies.shift();
        if (canned) return canned;
      }
      return h.endpoint.fetch(input, init);
    };
    const states: StreamClientState[] = [];
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      backoffMs: [1, 1, 1],
      onStateChange: (state) => states.push(state),
      onError: (error) => errors.push(error)
    });
    client.start();
    client.enqueue(micEnvelope(1));
    client.enqueue(micEnvelope(2));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(2));

    expect(states).toEqual(["streaming", "buffering", "streaming"]);
    expect(h.endpoint.received.map((entry) => [entry.seq, entry.type])).toEqual([
      [1, "mic"],
      [2, "mic"]
    ]);
    expect(h.queue.evictions).toBe(0);
    expect(errors.map(String)).toEqual([
      "Error: riffrec live: POST /events returned 400",
      "Error: riffrec live: POST /events returned 400",
      "Error: riffrec live: POST /events returned 400 (invalid_payload)"
    ]);
    client.close();
  });

  it("a 400 that survives the filler counts as a failure, so a stream the endpoint refuses shows as buffering", async () => {
    const h = harness();
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/events") && init?.method === "POST") {
        return new Response(JSON.stringify({ reason: "session_mismatch", seq: 1 }), { status: 400 });
      }
      return h.endpoint.fetch(input, init);
    };
    const states: StreamClientState[] = [];
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback),
      backoffMs: [1, 1, 1],
      onStateChange: (state) => states.push(state)
    });
    client.start();
    client.enqueue(micEnvelope(1));

    await vi.waitFor(() => expect(states).toContain("buffering"));
    expect(h.queue.all()[0]).toMatchObject({ seq: 1, type: "stream_state" });
    client.close();
  });

  it("a POST that never settles times out, counts as a failure, and lets the next attempt through", async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      let hang = true;
      const fetchImpl: typeof fetch = (input, init) => {
        if (hang && String(input).endsWith("/events") && init?.method === "POST") {
          return new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          });
        }
        return h.endpoint.fetch(input, init);
      };
      const errors: unknown[] = [];
      const client = new StreamClient({
        endpoint: h.endpoint.baseUrl,
        token: h.endpoint.pageToken,
        sessionId: SESSION_ID,
        queue: h.queue,
        fetch: fetchImpl,
        schedule: (callback) => queueMicrotask(callback),
        postTimeoutMs: 1000,
        backoffMs: [10, 10, 10],
        onError: (error) => errors.push(error)
      });
      client.start();
      client.enqueue(micEnvelope(1));
      await vi.advanceTimersByTimeAsync(999);
      expect(client.consecutiveFailures).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.consecutiveFailures).toBe(1);
      expect(String(errors[0])).toMatch(/timed out after 1000 ms/);

      hang = false;
      await vi.advanceTimersByTimeAsync(20);
      expect(client.ackedSeq).toBe(1);
      expect(client.consecutiveFailures).toBe(0);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("halves the batch after a 413 on a multi-envelope body", async () => {
    const h = harness();
    const sizes: number[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/events") && init?.method === "POST") {
        const count = (JSON.parse(String(init.body)) as unknown[]).length;
        sizes.push(count);
        if (count > 2) return new Response(JSON.stringify({ max_bytes: 100 }), { status: 413 });
      }
      return h.endpoint.fetch(input, init);
    };
    const client = new StreamClient({
      endpoint: h.endpoint.baseUrl,
      token: h.endpoint.pageToken,
      sessionId: SESSION_ID,
      queue: h.queue,
      fetch: fetchImpl,
      schedule: (callback) => queueMicrotask(callback)
    });
    client.start();
    for (let seq = 1; seq <= 8; seq += 1) client.enqueue(micEnvelope(seq));

    await vi.waitFor(() => expect(client.ackedSeq).toBe(8));

    expect(sizes[0]).toBe(8);
    expect(sizes.slice(1).every((count) => count <= 4)).toBe(true);
    expect(client.consecutiveFailures).toBe(0);
    expect(h.endpoint.received.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    client.close();
  });

  it("enters incompatible on a 409 version mismatch instead of buffering", async () => {
    const h = harness();
    h.client.start();
    const foreign = { ...micEnvelope(1), schema_version: "live/0" } as unknown as LiveEnvelope;
    h.client.enqueue(foreign);

    await vi.waitFor(() => expect(h.client.state).toBe("incompatible"));

    expect(h.client.consecutiveFailures).toBe(0);
    expect(h.states).toEqual(["streaming", "incompatible"]);
    expect(h.queue.length).toBe(1);
    h.client.enqueue(micEnvelope(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(postBodies(h.requests)).toHaveLength(1);
    h.client.close();
  });

  it("reports a session conflict on a 409 with active_session_id", async () => {
    const endpoint = createFakeEndpoint();
    await endpoint.postEvents([{ ...micEnvelope(1), session_id: "sess_other" }], "sess_other");
    const h = harness({ endpoint });
    h.client.start();
    h.client.enqueue(micEnvelope(1));

    await vi.waitFor(() => expect(h.client.state).toBe("conflict"));
    h.client.close();
  });

  it("reports unauthorized on a bad token", async () => {
    const h = harness({ token: "wrong" });
    h.client.start();
    h.client.enqueue(micEnvelope(1));

    await vi.waitFor(() => expect(h.client.state).toBe("unauthorized"));
    h.client.close();
  });

  it("reads server events from the SSE stream and applies acks and session end", async () => {
    const h = harness();
    h.client.start();
    h.client.enqueue(micEnvelope(1));
    await vi.waitFor(() => expect(h.client.ackedSeq).toBe(1));
    await vi.waitFor(() => expect(h.requests.some((request) => request.url.endsWith("/stream"))).toBe(true));

    await h.endpoint.postEvents([
      envelope(2, "unit", {
        id: "unit_1",
        statement: "Make it red",
        transcript_excerpt: "make it red",
        anchors: [],
        evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 1 } },
        status: "initial"
      })
    ]);
    await h.endpoint.postEvents([envelope(3, "checkpoint", { id: "cp_1", trigger: "send", mode: "smart" })]);
    await h.endpoint.ask("unit_1", "Which red?");

    await vi.waitFor(() => expect(h.serverEvents.map((event) => event.event)).toContain("ask"));
    const named = h.serverEvents.filter((event) => event.event !== "ack").map((event) => event.event);
    expect(named).toEqual(["unit_status", "unit_status", "ask"]);
    expect(h.serverEvents.some((event) => event.event === "ack")).toBe(true);
    expect(h.client.ackedSeq).toBe(3);

    await h.endpoint.handle({ method: "POST", path: "/session/end", headers: h.endpoint.pageHeaders(SESSION_ID) });

    await vi.waitFor(() => expect(h.ended).toEqual(["riffer_done"]));
    expect(h.client.state).toBe("ended");
  });

  it("sends the unloading envelope with keepalive and queues it for replay", () => {
    const h = harness();
    h.client.start();
    const unloading = envelope(7, "stream_state", { state: "unloading" });

    h.client.sendUnloading(unloading);

    const request = h.requests.find((entry) => entry.init?.method === "POST")!;
    expect(request.init?.keepalive).toBe(true);
    expect(JSON.parse(String(request.init?.body))).toEqual([unloading]);
    expect(h.queue.all()).toEqual([unloading]);
    h.client.close();
  });
});

describe("parseServerEventBlock", () => {
  it("parses event and data lines", () => {
    expect(parseServerEventBlock('event: ack\ndata: {"acked_seq":4}')).toEqual({ event: "ack", data: { acked_seq: 4 } });
  });

  it("ignores comments, unknown events, and bad JSON", () => {
    expect(parseServerEventBlock(": keepalive")).toBeNull();
    expect(parseServerEventBlock("event: mystery\ndata: {}")).toBeNull();
    expect(parseServerEventBlock("event: ack\ndata: nope")).toBeNull();
  });
});

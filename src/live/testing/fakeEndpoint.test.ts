import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LIVE_EVENTS_BODY_MAX_BYTES,
  LIVE_FRAME_BODY_MAX_BYTES,
  LIVE_SCHEMA_VERSION,
  LIVE_SESSION_HEADER,
  type LiveEnvelope,
  type LiveEventType,
  type LivePayload,
  type LiveUnit,
  type LiveWakeBatch
} from "../contract";
import { FakeEndpoint, createFakeEndpoint } from "./fakeEndpoint";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const SESSION = "sess_test";

function fixturePayload<T extends LiveEventType>(type: T): LivePayload<T> {
  const file = `${type.replace(/_/g, "-")}.json`;
  const parsed = JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as { payload: LivePayload<T> };
  return parsed.payload;
}

function envelope<T extends LiveEventType>(seq: number, type: T, payload: LivePayload<T>): LiveEnvelope<T> {
  return { schema_version: LIVE_SCHEMA_VERSION, session_id: SESSION, seq, t: seq * 1000, type, payload } as LiveEnvelope<T>;
}

function unit(id: string, overrides: Partial<LiveUnit> = {}): LiveUnit {
  return { ...fixturePayload("unit"), id, status: "initial", ...overrides };
}

function checkpoint(seq: number, id: string, trigger: "silence" | "send" | "page_change" = "silence") {
  return envelope(seq, "checkpoint", { id, trigger, mode: "smart" });
}

async function seeded(): Promise<FakeEndpoint> {
  const endpoint = createFakeEndpoint();
  await endpoint.postEvents([envelope(1, "mic", { state: "granted" })], SESSION);
  return endpoint;
}

describe("FakeEndpoint sequencing", () => {
  it("acknowledges seq 1..5 as acked_seq 5 and ignores a replayed seq 3", async () => {
    const endpoint = createFakeEndpoint();
    const first = await endpoint.postEvents(
      [1, 2, 3, 4, 5].map((seq) => envelope(seq, "transcript", { ...fixturePayload("transcript"), id: `tr_${seq}` })),
      SESSION
    );
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ acked_seq: 5 });

    const replay = await endpoint.postEvents(
      [envelope(3, "transcript", { ...fixturePayload("transcript"), id: "tr_3_again" })],
      SESSION
    );
    expect(replay.body).toEqual({ acked_seq: 5 });
    expect(endpoint.received).toHaveLength(5);
    expect(endpoint.received.map((item) => item.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("acknowledges only the highest contiguous seq when a gap exists", async () => {
    const endpoint = createFakeEndpoint();
    const gapped = await endpoint.postEvents(
      [1, 2, 4].map((seq) => envelope(seq, "mode", { mode: "smart" })),
      SESSION
    );
    expect(gapped.body).toEqual({ acked_seq: 2 });
    const filled = await endpoint.postEvents([envelope(3, "mode", { mode: "collect" })], SESSION);
    expect(filled.body).toEqual({ acked_seq: 4 });
    expect(endpoint.serverEventsNamed("ack").map((event) => event.data.acked_seq)).toEqual([2, 4]);
  });
});

describe("FakeEndpoint release semantics", () => {
  it("holds units until a checkpoint and broadcasts triaging for each released unit", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents(
      [envelope(2, "unit", unit("unit_a")), envelope(3, "unit", unit("unit_b")), envelope(4, "annotation", fixturePayload("annotation"))],
      SESSION
    );
    expect(endpoint.status().held_unit_ids).toEqual(["unit_a", "unit_b"]);
    expect(endpoint.status().pending_batch_ids).toEqual([]);
    expect(endpoint.serverEventsNamed("unit_status")).toEqual([]);

    const waiting = endpoint.wait();
    await endpoint.postEvents([checkpoint(5, "cp_1")], SESSION);
    const wake = await waiting;
    expect(wake.status).toBe(200);
    const batch = wake.body as LiveWakeBatch;
    expect(batch.checkpoint_id).toBe("cp_1");
    expect(batch.kind).toBe("silence");
    expect(batch.mode_at_checkpoint).toBe("smart");
    expect(batch.session_status).toBe("live");
    expect(batch.units.map((item) => [item.id, item.status])).toEqual([
      ["unit_a", "triaging"],
      ["unit_b", "triaging"]
    ]);
    expect(batch.annotations).toHaveLength(1);
    expect(batch.answers).toEqual([]);
    expect(endpoint.serverEventsNamed("unit_status").map((event) => event.data)).toEqual([
      { unit_id: "unit_a", status: "triaging" },
      { unit_id: "unit_b", status: "triaging" }
    ]);
    expect(endpoint.status().held_unit_ids).toEqual([]);
  });

  it("does not wake on a checkpoint that releases nothing", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents([checkpoint(2, "cp_empty")], SESSION);
    expect(endpoint.status().pending_batch_ids).toEqual([]);
    expect(endpoint.serverEvents.filter((event) => event.event !== "ack")).toEqual([]);
  });

  it("drops a unit withdrawn before release and forwards one withdrawn after release", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents(
      [
        envelope(2, "unit", unit("unit_a")),
        envelope(3, "unit", unit("unit_b")),
        envelope(4, "unit_withdraw", { unit_id: "unit_b", reason: "never mind" }),
        checkpoint(5, "cp_1")
      ],
      SESSION
    );
    const first = (await endpoint.wait()).body as LiveWakeBatch;
    expect(first.units.map((item) => item.id)).toEqual(["unit_a"]);
    await endpoint.ack("cp_1");

    await endpoint.postEvents(
      [
        envelope(6, "unit_withdraw", { unit_id: "unit_a" }),
        envelope(7, "unit", unit("unit_c")),
        checkpoint(8, "cp_2", "send")
      ],
      SESSION
    );
    const second = (await endpoint.wait()).body as LiveWakeBatch;
    expect(second.kind).toBe("send");
    expect(second.units.map((item) => [item.id, item.status])).toEqual([
      ["unit_c", "triaging"],
      ["unit_a", "withdrawn"]
    ]);
  });

  it("applies unit_update only while a unit is initial", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents(
      [
        envelope(2, "unit", unit("unit_a", { statement: "before" })),
        envelope(3, "unit_update", { unit_id: "unit_a", statement: "after" }),
        checkpoint(4, "cp_1"),
        envelope(5, "unit_update", { unit_id: "unit_a", statement: "too late" })
      ],
      SESSION
    );
    const batch = (await endpoint.wait()).body as LiveWakeBatch;
    expect(batch.units[0].statement).toBe("after");
    expect(endpoint.units.get("unit_a")?.statement).toBe("after");
  });

  it("emits an answer checkpoint carrying answers only", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents([envelope(2, "unit", unit("unit_a")), checkpoint(3, "cp_1")], SESSION);
    await endpoint.wait();
    await endpoint.ack("cp_1");
    await endpoint.ask("unit_a", "Which avatar?");
    expect(endpoint.serverEventsNamed("ask").map((event) => event.data)).toEqual([
      { unit_id: "unit_a", question: "Which avatar?" }
    ]);
    expect(endpoint.units.get("unit_a")?.status).toBe("needs_info");

    await endpoint.postEvents([envelope(4, "answer", { unit_id: "unit_a", text: "The header one." })], SESSION);
    const batch = (await endpoint.wait()).body as LiveWakeBatch;
    expect(batch.kind).toBe("answer");
    expect(batch.units).toEqual([]);
    expect(batch.answers).toEqual([{ unit_id: "unit_a", text: "The header one." }]);
  });

  it("re-serves an unacknowledged batch before any new batch and rejects a second waiter", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents([envelope(2, "unit", unit("unit_a")), checkpoint(3, "cp_1")], SESSION);
    const served = (await endpoint.wait()).body as LiveWakeBatch;
    expect(served.checkpoint_id).toBe("cp_1");

    await endpoint.postEvents([envelope(4, "unit", unit("unit_b")), checkpoint(5, "cp_2")], SESSION);
    const reserved = (await endpoint.wait()).body as LiveWakeBatch;
    expect(reserved.checkpoint_id).toBe("cp_1");
    await endpoint.ack("cp_1");
    const next = (await endpoint.wait()).body as LiveWakeBatch;
    expect(next.checkpoint_id).toBe("cp_2");
    await endpoint.ack("cp_2");

    const blocked = endpoint.wait();
    const taken = await endpoint.wait();
    expect(taken.status).toBe(409);
    expect(taken.body).toEqual({ status: "wait-taken" });
    await endpoint.handle({ method: "POST", path: "/session/end", headers: endpoint.pageHeaders(SESSION), body: {} });
    expect((await blocked).status).toBe(410);
    expect(endpoint.serverEventsNamed("session_ended")).toHaveLength(1);
  });

  it("stamps mode_at_checkpoint from the releasing checkpoint and tracks mode events", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents(
      [
        envelope(2, "mode", { mode: "collect" }),
        envelope(3, "unit", unit("unit_a")),
        envelope(4, "checkpoint", { id: "cp_1", trigger: "silence", mode: "collect" })
      ],
      SESSION
    );
    const batch = (await endpoint.wait()).body as LiveWakeBatch;
    expect(batch.mode_at_checkpoint).toBe("collect");
    expect(endpoint.mode).toBe("collect");
  });

  it("marks the next served batch page_lost once after markPageLost()", async () => {
    const endpoint = await seeded();
    await endpoint.postEvents([envelope(2, "unit", unit("unit_a")), checkpoint(3, "cp_1")], SESSION);
    await endpoint.wait();
    await endpoint.setUnitStatus("unit_a", "applied", { note: "moved" });
    expect(endpoint.serverEventsNamed("applied").map((event) => event.data)).toEqual([
      { checkpoint_id: "cp_1", unit_ids: ["unit_a"] }
    ]);
    endpoint.markPageLost();
    const lost = (await endpoint.wait()).body as LiveWakeBatch;
    expect(lost.session_status).toBe("page_lost");
    const again = (await endpoint.wait()).body as LiveWakeBatch;
    expect(again.session_status).toBe("live");
  });
});

describe("FakeEndpoint rejections", () => {
  it("returns 401 without a token and 403 for the wrong credential class", async () => {
    const endpoint = createFakeEndpoint();
    const missing = await endpoint.handle({
      method: "POST",
      path: "/events",
      headers: { [LIVE_SESSION_HEADER]: SESSION },
      body: [envelope(1, "mic", { state: "granted" })]
    });
    expect(missing.status).toBe(401);

    const swapped = await endpoint.handle({
      method: "POST",
      path: "/events",
      headers: { Authorization: `Bearer ${endpoint.agentToken}`, [LIVE_SESSION_HEADER]: SESSION },
      body: [envelope(1, "mic", { state: "granted" })]
    });
    expect(swapped.status).toBe(403);

    const pageOnAgent = await endpoint.handle({ method: "GET", path: "/status", headers: endpoint.pageHeaders(SESSION) });
    expect(pageOnAgent.status).toBe(403);

    const withOrigin = await endpoint.handle({
      method: "GET",
      path: "/status",
      headers: { ...endpoint.agentHeaders(), Origin: "http://localhost:5173" }
    });
    expect(withOrigin.status).toBe(403);
  });

  it("returns 409 with the expected version for schema_version live/0", async () => {
    const endpoint = createFakeEndpoint();
    const response = await endpoint.postEvents(
      [{ ...envelope(1, "mic", { state: "granted" }), schema_version: "live/0" }],
      SESSION
    );
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ expected_schema_version: "live/1" });
    expect(endpoint.received).toEqual([]);
  });

  it("returns 400 for an otherwise invalid envelope and names the seq", async () => {
    const endpoint = createFakeEndpoint();
    const response = await endpoint.postEvents([{ ...envelope(7, "mic", { state: "granted" }), type: "wat" }], SESSION);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ reason: "unknown_type", seq: 7 });
  });

  it("returns 413 for a 3 MB frame and accepts a frame over the 64 KB batch cap", async () => {
    const endpoint = createFakeEndpoint();
    const big = envelope(1, "frame", { ...fixturePayload("frame"), jpeg_base64: "A".repeat(3 * 1024 * 1024) });
    const tooBig = await endpoint.postEvents([big], SESSION);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body).toEqual({ max_bytes: LIVE_FRAME_BODY_MAX_BYTES });

    const medium = envelope(1, "frame", { ...fixturePayload("frame"), jpeg_base64: "A".repeat(200 * 1024) });
    expect((await endpoint.postEvents([medium], SESSION)).status).toBe(200);

    const batched = await endpoint.postEvents([medium, envelope(2, "mic", { state: "granted" })], SESSION);
    expect(batched.status).toBe(413);
    expect(batched.body).toEqual({ max_bytes: LIVE_EVENTS_BODY_MAX_BYTES });
  });

  it("binds the page token to the first session id and refuses others", async () => {
    const endpoint = await seeded();
    const other = await endpoint.postEvents([envelope(1, "mic", { state: "granted" })], "sess_other");
    expect(other.status).toBe(409);
    expect(other.body).toEqual({ active_session_id: SESSION });
  });

  it("answers preflight with the exact app origin and no credentials flag", async () => {
    const endpoint = createFakeEndpoint({ appOrigin: "https://app.example.test" });
    const response = await endpoint.handle({ method: "OPTIONS", path: "/events" });
    expect(response.status).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://app.example.test");
    expect(response.headers["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type, X-Riffrec-Session");
    expect(response.headers["Access-Control-Allow-Methods"]).toBe("GET, POST");
    expect(response.headers.Vary).toBe("Origin");
    expect(response.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});

describe("FakeEndpoint mint", () => {
  it("returns the scripted mint response for the bound session", async () => {
    const endpoint = await seeded();
    const response = await endpoint.handle({
      method: "POST",
      path: "/mint",
      headers: endpoint.pageHeaders(SESSION),
      body: { session_id: SESSION }
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      client_secret: expect.any(String),
      expires_at: expect.any(Number),
      model: expect.any(String)
    });
  });

  it("returns scripted mint errors", async () => {
    const endpoint = createFakeEndpoint({ mint: { status: 503, reason: "brief_contains_secret" } });
    await endpoint.postEvents([envelope(1, "mic", { state: "granted" })], SESSION);
    const response = await endpoint.handle({
      method: "POST",
      path: "/mint",
      headers: endpoint.pageHeaders(SESSION),
      body: JSON.stringify({ session_id: SESSION })
    });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ reason: "brief_contains_secret" });
  });
});

describe("FakeEndpoint fetch adaptor", () => {
  it("serves POST /events and streams SSE frames over GET /stream", async () => {
    const endpoint = createFakeEndpoint();
    const posted = await endpoint.fetch("/events", {
      method: "POST",
      headers: endpoint.pageHeaders(SESSION),
      body: JSON.stringify([envelope(1, "unit", unit("unit_a"))])
    });
    expect(posted.status).toBe(200);
    expect(await posted.json()).toEqual({ acked_seq: 1 });

    const stream = await endpoint.fetch(new URL("/stream", endpoint.baseUrl), { headers: endpoint.pageHeaders(SESSION) });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = stream.body!.getReader();

    await endpoint.fetch("/events", {
      method: "POST",
      headers: endpoint.pageHeaders(SESSION),
      body: JSON.stringify([checkpoint(2, "cp_1")])
    });
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: ack")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('event: unit_status\ndata: {"unit_id":"unit_a","status":"triaging"}\n\n');
    expect(text).toContain('event: ack\ndata: {"acked_seq":2}\n\n');
    await reader.cancel();

    const unauthorized = await endpoint.fetch("/stream");
    expect(unauthorized.status).toBe(401);
  });
});

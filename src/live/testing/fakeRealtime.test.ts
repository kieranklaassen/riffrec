import { describe, expect, it } from "vitest";
import type { LiveToolResult } from "../tools";
import { FakeRealtime, createFakeRealtime, type FakeRealtimeServerEvent } from "./fakeRealtime";

/** A stand-in interviewer: answers every tool call with a result naming the call. */
function connectRecordingInterviewer(realtime: FakeRealtime): { seen: string[] } {
  const seen: string[] = [];
  realtime.connect({
    onEvent: async (event: FakeRealtimeServerEvent) => {
      seen.push(event.type);
      if (event.type === "tool_call") {
        await Promise.resolve();
        const result: LiveToolResult = {
          call_id: event.call.call_id,
          output: { ok: true, unit_id: `unit_for_${event.call.call_id}` }
        };
        realtime.sendToolResult(result);
      }
    }
  });
  return { seen };
}

describe("FakeRealtime", () => {
  it("replays speech_stopped -> record_unit -> speech_started and returns tool results in order", async () => {
    const realtime = createFakeRealtime();
    const { seen } = connectRecordingInterviewer(realtime);

    await realtime.replay([
      { type: "speech_stopped", t: 1200 },
      realtime.toolCall({
        name: "record_unit",
        arguments: { statement: "Move the toggle right.", anchors: ["the sidebar toggle"], transcript_excerpt: "move it right" }
      }),
      realtime.toolCall({
        name: "update_unit",
        arguments: { unit_id: "unit_for_call_0001", statement: "Move the toggle to the far right." }
      }),
      { type: "speech_started", t: 1900 }
    ]);

    expect(seen).toEqual(["speech_stopped", "tool_call", "tool_call", "speech_started"]);
    expect(realtime.emitted.map((event) => event.type)).toEqual(seen);
    expect(realtime.toolResults.map((result) => result.call_id)).toEqual(["call_0001", "call_0002"]);
    expect(realtime.toolResults[0].output).toEqual({ ok: true, unit_id: "unit_for_call_0001" });
  });

  it("records every client action in order and exposes filtered views", () => {
    const realtime = createFakeRealtime();
    realtime.connect({ onEvent: () => {} });
    realtime.updateSession({ instructions: "persona" });
    realtime.sendText("the riffer drew on the sidebar toggle");
    realtime.createResponse();
    realtime.cancelResponse();
    realtime.setMuted(true);
    realtime.close();

    expect(realtime.actions.map((action) => action.type)).toEqual([
      "update_session",
      "send_text",
      "create_response",
      "cancel_response",
      "set_muted",
      "close"
    ]);
    expect(realtime.sentTexts).toEqual(["the riffer drew on the sidebar toggle"]);
    expect(realtime.actionsNamed("set_muted")).toEqual([{ type: "set_muted", muted: true }]);
    expect(realtime.muted).toBe(true);
    expect(realtime.closed).toBe(true);
    expect(realtime.connected).toBe(false);
  });

  it("refuses to emit before connect and to send after close", async () => {
    const realtime = createFakeRealtime();
    await expect(realtime.emit({ type: "speech_started", t: 0 })).rejects.toThrow("before connect()");
    realtime.connect({ onEvent: () => {} });
    realtime.close();
    expect(() => realtime.sendText("hello")).toThrow("while not connected");
  });

  it("honors an explicit call_id and marks the channel closed on a closed event", async () => {
    const realtime = createFakeRealtime();
    realtime.connect({ onEvent: () => {} });
    const call = realtime.toolCall({ name: "withdraw_unit", arguments: { unit_id: "unit_1" }, call_id: "call_custom" });
    expect(call).toEqual({
      type: "tool_call",
      call: { call_id: "call_custom", name: "withdraw_unit", arguments: { unit_id: "unit_1" } }
    });
    await realtime.emit({ type: "closed", reason: "ice_failed" });
    expect(realtime.closed).toBe(true);
  });
});

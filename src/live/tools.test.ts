import { describe, expect, it } from "vitest";
import { LIVE_TOOLS, LIVE_TOOL_NAMES, LOOK_AT_SCREEN_TOOL, getLiveTool, isLiveToolName } from "./tools";

const TOOL_NAMES = ["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"];

describe("live interviewer tools", () => {
  it("defines exactly five tools: the four KTD5 tools plus look_at_screen", () => {
    expect(LIVE_TOOLS).toHaveLength(5);
    expect(LIVE_TOOLS.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect([...LIVE_TOOL_NAMES].sort()).toEqual([...TOOL_NAMES].sort());
  });

  it.each(LIVE_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s is a flat function tool with an object schema and a calling condition",
    (_name, tool) => {
      expect(tool.type).toBe("function");
      expect(TOOL_NAMES).toContain(tool.name);
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(Object.keys(tool.parameters.properties).length).toBeGreaterThan(0);
      for (const required of tool.parameters.required) {
        expect(tool.parameters.properties).toHaveProperty(required);
      }
      expect(tool.description).toMatch(/Call when/);
      expect(tool.description).toMatch(/Never call/);
    }
  );

  it("matches the KTD5 parameter lists", () => {
    expect(Object.keys(getLiveTool("record_unit").parameters.properties)).toEqual([
      "statement",
      "anchors",
      "transcript_excerpt"
    ]);
    expect(getLiveTool("record_unit").parameters.required).toEqual([
      "statement",
      "anchors",
      "transcript_excerpt"
    ]);
    expect(Object.keys(getLiveTool("update_unit").parameters.properties)).toEqual([
      "unit_id",
      "statement",
      "anchors_add"
    ]);
    expect(getLiveTool("update_unit").parameters.required).toEqual(["unit_id"]);
    expect(Object.keys(getLiveTool("withdraw_unit").parameters.properties)).toEqual(["unit_id", "reason"]);
    expect(getLiveTool("withdraw_unit").parameters.required).toEqual(["unit_id"]);
    expect(Object.keys(getLiveTool("relay_answer").parameters.properties)).toEqual([
      "unit_id",
      "answer_text"
    ]);
    expect(getLiveTool("relay_answer").parameters.required).toEqual(["unit_id", "answer_text"]);
  });

  it("look_at_screen takes an optional reason and asks the page for the frame instead of carrying one", () => {
    expect(Object.keys(LOOK_AT_SCREEN_TOOL.parameters.properties)).toEqual(["reason"]);
    expect(LOOK_AT_SCREEN_TOOL.parameters.required).toEqual([]);
    expect(LOOK_AT_SCREEN_TOOL.description).toMatch(/screenshot/);
    expect(LOOK_AT_SCREEN_TOOL.description).toMatch(/whether you can see their screen/);
    // The anchors description tells the model how the page announces clicks, so "this" resolves without asking.
    expect(getLiveTool("record_unit").parameters.properties.anchors.description).toMatch(/\[PAGE\] note announcing what the riffer clicked/);
  });

  it("no tool parameter carries image content, and no tool emits checkpoints or reports state", () => {
    for (const tool of LIVE_TOOLS) {
      expect(JSON.stringify(tool.parameters)).not.toMatch(/image|jpeg|png|base64|screenshot/i);
    }
    expect(LIVE_TOOLS.some((tool) => /checkpoint|report_state|set_mode|capture_frame/.test(tool.name))).toBe(false);
  });

  it("is plain JSON data that survives a round trip", () => {
    expect(JSON.parse(JSON.stringify(LIVE_TOOLS))).toEqual(LIVE_TOOLS);
  });

  it("recognizes tool names", () => {
    expect(isLiveToolName("record_unit")).toBe(true);
    expect(isLiveToolName("look_at_screen")).toBe(true);
    expect(isLiveToolName("emit_checkpoint")).toBe(false);
    expect(() => getLiveTool("nope" as never)).toThrow("Unknown live tool: nope");
  });
});

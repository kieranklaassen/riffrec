import { describe, expect, it } from "vitest";
import { LIVE_TOOLS } from "../tools";
import {
  DEFAULT_INTERVIEWER_INSTRUCTIONS,
  SCREEN_CONTEXT_MARKER,
  SCREEN_CONTEXT_SECTION,
  buildInterviewerInstructions,
  hasScreenContext,
  withScreenContext
} from "./persona";
import { readSessionConfig, reconcileSessionConfig } from "./sessionConfig";

const ENDPOINT_TOOLS = ["record_unit", "update_unit", "withdraw_unit", "relay_answer"].map((name) => ({ type: "function", name }));

describe("persona", () => {
  it("the default persona carries the screen-context section exactly once and never claims blindness", () => {
    expect(hasScreenContext(DEFAULT_INTERVIEWER_INSTRUCTIONS)).toBe(true);
    expect(DEFAULT_INTERVIEWER_INSTRUCTIONS.split(SCREEN_CONTEXT_MARKER)).toHaveLength(2);
    expect(DEFAULT_INTERVIEWER_INSTRUCTIONS).not.toMatch(/You cannot see the page/);
    expect(DEFAULT_INTERVIEWER_INSTRUCTIONS).toMatch(/look_at_screen/);
    expect(DEFAULT_INTERVIEWER_INSTRUCTIONS).toMatch(/\[PAGE\]/);
    expect(withScreenContext(DEFAULT_INTERVIEWER_INSTRUCTIONS)).toBe(DEFAULT_INTERVIEWER_INSTRUCTIONS);
  });

  it("appends the section once to a persona without it", () => {
    expect(withScreenContext("Be terse.")).toBe(`Be terse.\n\n${SCREEN_CONTEXT_SECTION}`);
    expect(withScreenContext("")).toBe(SCREEN_CONTEXT_SECTION);
    expect(withScreenContext(withScreenContext("Be terse."))).toBe(withScreenContext("Be terse."));
  });

  it("the section tells the model the announcement shapes it will see", () => {
    expect(SCREEN_CONTEXT_SECTION).toMatch(/anchor id/);
    expect(SCREEN_CONTEXT_SECTION).toMatch(/"this", "here", and "that"/);
    expect(SCREEN_CONTEXT_SECTION).toMatch(/supersedes any earlier statement that you cannot see the page/);
  });

  it("a brief is appended after the default persona and capped", () => {
    const brief = "x".repeat(4000);
    const text = buildInterviewerInstructions({ brief });
    expect(text.startsWith(DEFAULT_INTERVIEWER_INSTRUCTIONS)).toBe(true);
    expect(text).toContain("[SESSION BRIEF]");
    expect(text.length).toBeLessThan(DEFAULT_INTERVIEWER_INSTRUCTIONS.length + 3100);
  });
});

describe("readSessionConfig", () => {
  it("reads instructions and object tools, tolerating anything else", () => {
    expect(readSessionConfig({ instructions: "Hi", tools: [{ name: "a" }, "junk", null] })).toEqual({ instructions: "Hi", tools: [{ name: "a" }] });
    expect(readSessionConfig(undefined)).toEqual({ instructions: null, tools: [] });
    expect(readSessionConfig({ instructions: 3, tools: "no" })).toEqual({ instructions: null, tools: [] });
  });
});

describe("reconcileSessionConfig", () => {
  it("keeps the endpoint's persona and its copies of the tools, adding only what is missing", () => {
    const patch = reconcileSessionConfig({
      instructions: "Endpoint persona. You do not watch the screen.",
      tools: [{ type: "function", name: "record_unit", description: "endpoint copy" }, ...ENDPOINT_TOOLS.slice(1)]
    });
    expect(patch).not.toBeNull();
    expect(patch!.tools!.map((tool) => tool.name)).toEqual([...ENDPOINT_TOOLS.map((tool) => tool.name), "look_at_screen"]);
    expect(patch!.tools![0].description).toBe("endpoint copy");
    expect(patch!.instructions).toBe(`Endpoint persona. You do not watch the screen.\n\n${SCREEN_CONTEXT_SECTION}`);
  });

  it("produces no patch when the session already carries every tool and the section", () => {
    expect(
      reconcileSessionConfig({
        instructions: `Endpoint persona.\n\n${SCREEN_CONTEXT_MARKER}\nEndpoint's own wording.`,
        tools: LIVE_TOOLS.map((tool) => ({ type: "function", name: tool.name }))
      })
    ).toBeNull();
  });

  it("patches only the tools when the persona already has the section", () => {
    const patch = reconcileSessionConfig({ instructions: withScreenContext("Endpoint persona."), tools: ENDPOINT_TOOLS });
    expect(patch).toEqual({ tools: [...ENDPOINT_TOOLS, expect.objectContaining({ name: "look_at_screen" })] });
  });

  it("applies the default persona and every tool to a session the endpoint did not set up", () => {
    const patch = reconcileSessionConfig({ instructions: "You are a helpful, witty assistant.", tools: [{ type: "function", name: "weather" }] });
    expect(patch!.instructions).toBe(DEFAULT_INTERVIEWER_INSTRUCTIONS);
    expect(patch!.tools!.map((tool) => tool.name)).toEqual(["weather", ...LIVE_TOOLS.map((tool) => tool.name)]);
  });

  it("the patch is plain JSON", () => {
    const patch = reconcileSessionConfig({ instructions: null, tools: [] });
    expect(JSON.parse(JSON.stringify(patch))).toEqual(patch);
  });
});

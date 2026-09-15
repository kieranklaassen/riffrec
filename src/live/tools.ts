/**
 * Interviewer tool set (KTD5): four flat function tools in the `breathwork-live`
 * shape. Exported as data so the endpoint helper can copy them verbatim.
 *
 * No tool emits checkpoints or reports state: the client owns all timing, and
 * page-side facts (a completed drawing, buffering, a mute) reach the interviewer
 * as text conversation items. No tool carries image content.
 */

export const LIVE_TOOL_NAMES = ["record_unit", "update_unit", "withdraw_unit", "relay_answer"] as const;

export type LiveToolName = (typeof LIVE_TOOL_NAMES)[number];

export interface JsonSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  items?: JsonSchemaProperty;
  enum?: readonly string[];
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: readonly string[];
  additionalProperties: false;
}

/** The flat Realtime session tool shape: `{ type: "function", name, description, parameters }`. */
export interface LiveToolDefinition<N extends LiveToolName = LiveToolName> {
  type: "function";
  name: N;
  description: string;
  parameters: JsonSchemaObject;
}

export interface RecordUnitArgs {
  statement: string;
  /**
   * Anchor references, as the riffer named them or as the page announced them in
   * a conversation item ("the riffer drew on the sidebar toggle"). The client
   * resolves them to `LiveAnchor` objects; the interviewer never sees the page.
   */
  anchors: string[];
  transcript_excerpt: string;
}

export interface UpdateUnitArgs {
  unit_id: string;
  statement?: string;
  anchors_add?: string[];
}

export interface WithdrawUnitArgs {
  unit_id: string;
  reason?: string;
}

export interface RelayAnswerArgs {
  unit_id: string;
  answer_text: string;
}

export interface LiveToolArgsMap {
  record_unit: RecordUnitArgs;
  update_unit: UpdateUnitArgs;
  withdraw_unit: WithdrawUnitArgs;
  relay_answer: RelayAnswerArgs;
}

export type LiveToolArgs<N extends LiveToolName = LiveToolName> = LiveToolArgsMap[N];

/** A tool call as the client receives it from the Realtime data channel. */
export type LiveToolCall<N extends LiveToolName = LiveToolName> = N extends LiveToolName
  ? { call_id: string; name: N; arguments: LiveToolArgsMap[N] }
  : never;

export interface LiveToolResult {
  call_id: string;
  /** JSON-serializable result handed back as the function call output. */
  output: Record<string, unknown>;
}

const anchorsProperty: JsonSchemaProperty = {
  type: "array",
  description:
    "Anchor references for the element(s) the change is about: the riffer's own words for the element " +
    "(\"the sidebar toggle\", \"that red button\") or an anchor id the page announced in conversation. " +
    "Empty only when the riffer named no element at all.",
  items: { type: "string" }
};

export const RECORD_UNIT_TOOL: LiveToolDefinition<"record_unit"> = {
  type: "function",
  name: "record_unit",
  description:
    "Record one requested change as a unit on the board. " +
    "Call when the riffer has asked for exactly one concrete change to the app and you can state it in one " +
    "sentence; call once per change, so a sentence that asks for three things becomes three calls. " +
    "Never call for questions, thinking aloud, praise, or utterances shorter than three words without a change verb; " +
    "ask a clarifying question instead when the target element or the intended change is ambiguous.",
  parameters: {
    type: "object",
    properties: {
      statement: {
        type: "string",
        description:
          "Normalized imperative statement of the change, in the riffer's vocabulary, one sentence, no speculation."
      },
      anchors: anchorsProperty,
      transcript_excerpt: {
        type: "string",
        description: "The riffer's own words that carry this change, verbatim, trimmed to the relevant span."
      }
    },
    required: ["statement", "anchors", "transcript_excerpt"],
    additionalProperties: false
  }
};

export const UPDATE_UNIT_TOOL: LiveToolDefinition<"update_unit"> = {
  type: "function",
  name: "update_unit",
  description:
    "Refine a unit you recorded earlier. " +
    "Call when the riffer adds detail, corrects wording, or names another element for a change already on the board, " +
    "or when they answer a clarifying question you asked about it. " +
    "Never call to change a unit into a different change; withdraw it and record a new one. " +
    "The call is rejected once the unit has left the initial status; the result tells you so, and you must then " +
    "record the refinement as a new unit.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id returned by record_unit." },
      statement: { type: "string", description: "Replacement statement, when the wording changes." },
      anchors_add: {
        type: "array",
        description: "Additional anchor references to attach; existing anchors are kept.",
        items: { type: "string" }
      }
    },
    required: ["unit_id"],
    additionalProperties: false
  }
};

export const WITHDRAW_UNIT_TOOL: LiveToolDefinition<"withdraw_unit"> = {
  type: "function",
  name: "withdraw_unit",
  description:
    "Retract a unit the riffer no longer wants. " +
    "Call when the riffer says never mind, undo, scrap that, or otherwise takes back a change you recorded. " +
    "Never call because you are unsure the unit was right; ask instead. " +
    "Never call for units you did not record in this session.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id returned by record_unit." },
      reason: { type: "string", description: "The riffer's reason, in their words, when they gave one." }
    },
    required: ["unit_id"],
    additionalProperties: false
  }
};

export const RELAY_ANSWER_TOOL: LiveToolDefinition<"relay_answer"> = {
  type: "function",
  name: "relay_answer",
  description:
    "Relay the riffer's answer to a question the coding agent asked about a unit. " +
    "Call when you voiced a question that arrived from the endpoint for a specific unit and the riffer has answered it. " +
    "Never call for answers to your own clarifying questions; use update_unit for those. " +
    "Never invent or summarize an answer the riffer did not give.",
  parameters: {
    type: "object",
    properties: {
      unit_id: { type: "string", description: "Id of the unit the question was attached to." },
      answer_text: { type: "string", description: "The riffer's answer, verbatim or lightly cleaned of filler." }
    },
    required: ["unit_id", "answer_text"],
    additionalProperties: false
  }
};

export const LIVE_TOOLS: readonly LiveToolDefinition[] = [
  RECORD_UNIT_TOOL,
  UPDATE_UNIT_TOOL,
  WITHDRAW_UNIT_TOOL,
  RELAY_ANSWER_TOOL
];

export function isLiveToolName(value: unknown): value is LiveToolName {
  return typeof value === "string" && (LIVE_TOOL_NAMES as readonly string[]).includes(value);
}

export function getLiveTool<N extends LiveToolName>(name: N): LiveToolDefinition<N> {
  const tool = LIVE_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown live tool: ${name}`);
  return tool as LiveToolDefinition<N>;
}

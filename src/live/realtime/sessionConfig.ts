import { LIVE_TOOLS, isLiveToolName } from "../tools";
import { DEFAULT_INTERVIEWER_INSTRUCTIONS, hasScreenContext, withScreenContext } from "./persona";

/**
 * Reconciles the Realtime session the endpoint minted with what the page can
 * actually answer (KTD4, KTD5).
 *
 * The endpoint owns the persona and may override any tool it copied; the page
 * owns the mechanics — it is the one that resolves anchors, answers tool calls,
 * and attaches screenshots — so after `session.created` it patches only what
 * would otherwise leave the interviewer unable to use them:
 *
 * - tools the page answers that the mint did not carry are added; tools the
 *   endpoint did define are kept verbatim, in the endpoint's order;
 * - a persona that lacks the `[SCREEN CONTEXT]` section gets it appended, so
 *   an endpoint persona can never leave the interviewer believing it is blind
 *   to the page;
 * - a session with no riffrec tool at all (the endpoint minted a bare session)
 *   gets the default persona and tool set, so live mode works out of the box.
 *
 * A session that already carries everything produces no patch and no
 * `session.update`.
 */

/** A tool entry as the Realtime session reports it; only `name` matters here. */
export interface RealtimeToolLike {
  type?: string;
  name?: string;
  [key: string]: unknown;
}

export interface RealtimeSessionConfig {
  instructions: string | null;
  tools: RealtimeToolLike[];
}

export interface SessionConfigPatch {
  instructions?: string;
  tools?: RealtimeToolLike[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the session object out of a `session.created` / `session.updated` event. */
export function readSessionConfig(session: unknown): RealtimeSessionConfig {
  const record = isRecord(session) ? session : {};
  const instructions = typeof record.instructions === "string" ? record.instructions : null;
  const tools = Array.isArray(record.tools) ? record.tools.filter(isRecord).map((tool) => ({ ...tool }) as RealtimeToolLike) : [];
  return { instructions, tools };
}

export function reconcileSessionConfig(current: RealtimeSessionConfig): SessionConfigPatch | null {
  const patch: SessionConfigPatch = {};
  const names = new Set(current.tools.map((tool) => tool.name).filter((name): name is string => typeof name === "string"));
  const endpointConfigured = [...names].some((name) => isLiveToolName(name));

  const missing = LIVE_TOOLS.filter((tool) => !names.has(tool.name));
  if (missing.length > 0) patch.tools = [...current.tools, ...missing.map((tool) => ({ ...tool }) as RealtimeToolLike)];

  if (!endpointConfigured) {
    patch.instructions = DEFAULT_INTERVIEWER_INSTRUCTIONS;
  } else if (!hasScreenContext(current.instructions)) {
    patch.instructions = withScreenContext(current.instructions ?? "");
  }

  return patch.tools || patch.instructions !== undefined ? patch : null;
}

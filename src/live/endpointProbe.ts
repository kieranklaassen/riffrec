import type { LiveSessionProbeResponse } from "./contract";
import type { LiveBootstrap } from "./tokenBootstrap";

/**
 * `GET /session` with the remembered link: can this browser start another
 * session on the endpoint? `ready` when it can now, `draining` while the agent
 * is still finishing the last one, `busy` when another session holds the link,
 * `rejected` when the endpoint no longer knows the token (it restarted or
 * stopped), and `unreachable` for everything else, including endpoints that
 * predate the route.
 */
export type EndpointProbeResult = "ready" | "draining" | "busy" | "rejected" | "unreachable";

export async function probeEndpoint(
  bootstrap: LiveBootstrap,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init)
): Promise<EndpointProbeResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${bootstrap.endpoint}/session`, {
      method: "GET",
      headers: { Authorization: `Bearer ${bootstrap.token}` }
    });
  } catch {
    return "unreachable";
  }
  if (response.status === 401 || response.status === 403) return "rejected";
  if (!response.ok) return "unreachable";
  let body: Partial<LiveSessionProbeResponse> | null;
  try {
    body = (await response.json()) as Partial<LiveSessionProbeResponse> | null;
  } catch {
    return "unreachable";
  }
  if (body?.accepts_new_session === true) return "ready";
  if (body?.status === "live") return body.session_id ? "busy" : "ready";
  if (body?.status === "ended") return "draining";
  return "unreachable";
}

import { describe, expect, it, vi } from "vitest";
import { probeEndpoint } from "./endpointProbe";

const link = { token: "tok_page", endpoint: "http://localhost:4321" };

function respond(status: number, body?: unknown) {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe("probeEndpoint", () => {
  it("asks GET /session with the page token", async () => {
    const fetchImpl = respond(200, { status: "ended", session_id: "s1", accepts_new_session: true });

    expect(await probeEndpoint(link, fetchImpl)).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4321/session", {
      method: "GET",
      headers: { Authorization: "Bearer tok_page" }
    });
  });

  it("maps the endpoint's answer to what the launcher shows", async () => {
    expect(await probeEndpoint(link, respond(200, { status: "live", session_id: null, accepts_new_session: false }))).toBe("ready");
    expect(await probeEndpoint(link, respond(200, { status: "live", session_id: "s1", accepts_new_session: false }))).toBe("busy");
    expect(await probeEndpoint(link, respond(200, { status: "ended", session_id: "s1", accepts_new_session: false }))).toBe("draining");
  });

  it("reports a token the endpoint no longer knows, and hides on anything else", async () => {
    expect(await probeEndpoint(link, respond(401))).toBe("rejected");
    expect(await probeEndpoint(link, respond(403))).toBe("rejected");
    expect(await probeEndpoint(link, respond(404))).toBe("unreachable");
    expect(await probeEndpoint(link, respond(200, "not json"))).toBe("unreachable");
    expect(await probeEndpoint(link, vi.fn(async () => Promise.reject(new TypeError("fetch failed"))))).toBe("unreachable");
  });
});

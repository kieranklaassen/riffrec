import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LIVE_EVENT_TYPES,
  LIVE_SCHEMA_VERSION,
  inspectEnvelope,
  isLiveEnvelopeOfType,
  validateEnvelope,
  type LiveEnvelope,
  type LiveEventType,
  type LiveMintRequest,
  type LiveMintResponse,
  type LiveWakeBatch
} from "./contract";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");
const contractDoc = readFileSync(join(here, "..", "..", "docs", "live-stream-contract.md"), "utf8");

function fixtureFileFor(type: LiveEventType): string {
  return `${type.replace(/_/g, "-")}.json`;
}

function loadFixture<T>(file: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as T;
}

function loadEnvelopeFixture(type: LiveEventType): LiveEnvelope {
  return loadFixture<LiveEnvelope>(fixtureFileFor(type));
}

interface DocumentedField {
  name: string;
  required: boolean;
}

/**
 * Reads the field table under the heading `### \`<section>\`` in
 * docs/live-stream-contract.md. Rows look like `| \`name\` | type | yes | ... |`.
 */
function documentedFields(section: string): DocumentedField[] {
  const heading = `### \`${section}\``;
  const start = contractDoc.indexOf(heading);
  if (start === -1) throw new Error(`docs/live-stream-contract.md has no section ${heading}`);
  const rest = contractDoc.slice(start + heading.length);
  const nextHeading = rest.search(/\n##+ /);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const fields: DocumentedField[] = [];
  for (const line of body.split("\n")) {
    const match = /^\|\s*`([a-zA-Z0-9_]+)`\s*\|[^|]*\|\s*(yes|no)\s*\|/.exec(line);
    if (match) fields.push({ name: match[1], required: match[2] === "yes" });
  }
  if (fields.length === 0) throw new Error(`section ${heading} has no field table`);
  return fields;
}

function expectMatchesDoc(value: Record<string, unknown>, section: string): void {
  const fields = documentedFields(section);
  const documented = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(value)) {
    expect(documented, `${section}: fixture field \`${key}\` is not documented`).toContain(key);
  }
  for (const field of fields) {
    if (field.required) {
      expect(value, `${section}: required field \`${field.name}\` missing from fixture`).toHaveProperty(
        field.name
      );
    }
  }
}

describe("live fixtures", () => {
  it("ship one envelope fixture per event type plus wake and mint fixtures", () => {
    const files = readdirSync(fixturesDir).sort();
    const expected = [
      ...LIVE_EVENT_TYPES.map(fixtureFileFor),
      "mint-request.json",
      "mint-response.json",
      "wake-batch.json"
    ].sort();
    expect(files).toEqual(expected);
  });

  it.each(LIVE_EVENT_TYPES)("%s fixture passes validateEnvelope and names its own type", (type) => {
    const envelope = loadEnvelopeFixture(type);
    expect(validateEnvelope(envelope)).toBe(true);
    expect(envelope.type).toBe(type);
    expect(envelope.schema_version).toBe(LIVE_SCHEMA_VERSION);
    expect(isLiveEnvelopeOfType(envelope, type)).toBe(true);
  });

  it.each(LIVE_EVENT_TYPES)("%s fixture matches the field list in docs/live-stream-contract.md", (type) => {
    const envelope = loadEnvelopeFixture(type);
    expectMatchesDoc(envelope as unknown as Record<string, unknown>, "envelope");
    expectMatchesDoc(envelope.payload as unknown as Record<string, unknown>, type);
  });

  it("unit fixture nests anchor and evidence shapes that match the document", () => {
    const envelope = loadEnvelopeFixture("unit") as LiveEnvelope<"unit">;
    expectMatchesDoc(envelope.payload.evidence as unknown as Record<string, unknown>, "evidence");
    for (const anchor of envelope.payload.anchors) {
      expectMatchesDoc(anchor as unknown as Record<string, unknown>, "anchor");
    }
  });

  it("annotation fixture nests an anchor that matches the document", () => {
    const envelope = loadEnvelopeFixture("annotation") as LiveEnvelope<"annotation">;
    expectMatchesDoc(envelope.payload.anchor as unknown as Record<string, unknown>, "anchor");
  });

  it("wake-batch fixture matches the document and carries valid units", () => {
    const batch = loadFixture<LiveWakeBatch>("wake-batch.json");
    expectMatchesDoc(batch as unknown as Record<string, unknown>, "wake_batch");
    expect(batch.schema_version).toBe(LIVE_SCHEMA_VERSION);
    expect(batch.units.length).toBeGreaterThan(0);
    for (const unit of batch.units) {
      expect(
        validateEnvelope({
          schema_version: LIVE_SCHEMA_VERSION,
          session_id: "s",
          seq: 1,
          t: 0,
          type: "unit",
          payload: unit
        })
      ).toBe(true);
    }
    for (const annotation of batch.annotations) {
      expect(
        validateEnvelope({
          schema_version: LIVE_SCHEMA_VERSION,
          session_id: "s",
          seq: 1,
          t: 0,
          type: "annotation",
          payload: annotation
        })
      ).toBe(true);
    }
  });

  it("mint fixtures match the document", () => {
    const request = loadFixture<LiveMintRequest>("mint-request.json");
    const response = loadFixture<LiveMintResponse>("mint-response.json");
    expectMatchesDoc(request as unknown as Record<string, unknown>, "mint_request");
    expectMatchesDoc(response as unknown as Record<string, unknown>, "mint_response");
    expect(typeof response.expires_at).toBe("number");
  });

  it("documents every event type", () => {
    for (const type of LIVE_EVENT_TYPES) {
      expect(contractDoc).toContain(`### \`${type}\``);
    }
  });
});

describe("validateEnvelope", () => {
  const base = loadEnvelopeFixture("checkpoint");

  it("rejects an envelope missing seq", () => {
    const { seq: _seq, ...withoutSeq } = base;
    expect(validateEnvelope(withoutSeq)).toBe(false);
    expect(inspectEnvelope(withoutSeq)).toEqual({ ok: false, reason: "missing_seq" });
  });

  it("rejects a non-positive or fractional seq", () => {
    expect(inspectEnvelope({ ...base, seq: 0 })).toEqual({ ok: false, reason: "invalid_seq" });
    expect(inspectEnvelope({ ...base, seq: 1.5 })).toEqual({ ok: false, reason: "invalid_seq" });
    expect(inspectEnvelope({ ...base, seq: "3" })).toEqual({ ok: false, reason: "invalid_seq" });
  });

  it("rejects a wrong schema_version and names it", () => {
    const foreign = { ...base, schema_version: "live/0" };
    expect(validateEnvelope(foreign)).toBe(false);
    expect(inspectEnvelope(foreign)).toEqual({
      ok: false,
      reason: "unsupported_schema_version",
      detail: "live/0"
    });
  });

  it("rejects an unknown type", () => {
    const unknown = { ...base, type: "telemetry" };
    expect(validateEnvelope(unknown)).toBe(false);
    expect(inspectEnvelope(unknown)).toEqual({ ok: false, reason: "unknown_type", detail: "telemetry" });
  });

  it("rejects a payload that does not match its type", () => {
    expect(inspectEnvelope({ ...base, payload: { id: "cp", trigger: "sneeze", mode: "smart" } })).toEqual({
      ok: false,
      reason: "invalid_payload",
      detail: "checkpoint"
    });
    expect(inspectEnvelope({ ...base, type: "unit" })).toEqual({
      ok: false,
      reason: "invalid_payload",
      detail: "unit"
    });
  });

  it("rejects non-objects, missing session ids, and non-numeric timestamps", () => {
    expect(inspectEnvelope(null)).toEqual({ ok: false, reason: "not_object" });
    expect(inspectEnvelope([base])).toEqual({ ok: false, reason: "not_object" });
    expect(inspectEnvelope({ ...base, session_id: "" })).toEqual({ ok: false, reason: "missing_session_id" });
    expect(inspectEnvelope({ ...base, t: "now" })).toEqual({ ok: false, reason: "invalid_t" });
  });

  it("returns the typed envelope on success", () => {
    const result = inspectEnvelope(base);
    expect(result.ok).toBe(true);
    if (result.ok && isLiveEnvelopeOfType(result.envelope, "checkpoint")) {
      expect(result.envelope.payload.trigger).toBe("silence");
    }
  });
});

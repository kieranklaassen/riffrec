import type { CaptureOutputs, EventsJson, SessionJson, SessionResult } from "../types";
import { RIFFREC_SCHEMA_VERSION } from "../types";
import { filterZipSessionFiles, ZipWriter } from "./zip";

interface SessionWriterOptions {
  reactVersion?: string | null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function createShortId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 6);
  }

  return Math.random().toString(36).slice(2, 8);
}

export function createSessionDirName(date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `riffrec-${year}-${month}-${day}-${hours}${minutes}-${createShortId()}`;
}

function jsonBlob(value: unknown): Blob {
  return new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
}

function readBrowser(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
}

function readUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

function buildEventsJson(outputs: CaptureOutputs): EventsJson {
  return {
    version: "1",
    schema_version: RIFFREC_SCHEMA_VERSION,
    session_id: outputs.sessionId,
    url: readUrl(),
    started_at: outputs.startedAt.toISOString(),
    duration_seconds: outputs.durationSeconds,
    events: outputs.events
  };
}

function buildSessionJson(
  outputs: CaptureOutputs,
  endedAt: Date,
  reactVersion: string | null,
  filesPresent: string[]
): SessionJson {
  return {
    url: readUrl(),
    react_version: reactVersion,
    browser: readBrowser(),
    started_at: outputs.startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: outputs.durationSeconds,
    files_present: filesPresent
  };
}

function withSessionJson(
  files: Map<string, Blob>,
  outputs: CaptureOutputs,
  endedAt: Date,
  reactVersion: string | null
): { files: Map<string, Blob>; filesPresent: string[] } {
  const filesPresent = ["session.json", ...Array.from(files.keys())];
  const sessionJson = buildSessionJson(outputs, endedAt, reactVersion, filesPresent);
  return {
    files: new Map([["session.json", jsonBlob(sessionJson)], ...files]),
    filesPresent
  };
}

export class SessionWriter {
  private readonly zipWriter = new ZipWriter();

  constructor(private readonly options: SessionWriterOptions = {}) {}

  async stop(outputs: CaptureOutputs): Promise<SessionResult> {
    const endedAt = new Date();
    const sessionDirName = createSessionDirName(endedAt);
    const eventsJson = buildEventsJson(outputs);
    const files = new Map<string, Blob>();

    files.set("events.json", jsonBlob(eventsJson));
    if (outputs.screenBlob) {
      files.set("recording.webm", outputs.screenBlob);
    }
    if (outputs.voiceBlob) {
      files.set("voice.webm", outputs.voiceBlob);
    }

    const zipSession = withSessionJson(
      filterZipSessionFiles(files),
      outputs,
      endedAt,
      this.options.reactVersion ?? null
    );
    const sessionPath = await this.zipWriter.writeSession(sessionDirName, zipSession.files);
    return { sessionPath, method: "zip", filesPresent: zipSession.filesPresent };
  }
}

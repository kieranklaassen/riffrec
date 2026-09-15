import type { CaptureOutputs, EventsJson, SessionJson, SessionResult } from "../types";
import { RIFFREC_SCHEMA_VERSION } from "../types";
import type { LiveAnnotation, LiveTranscript, LiveUnit } from "../live/contract";
import { filterZipSessionFiles, ZipWriter } from "./zip";

interface SessionWriterOptions {
  reactVersion?: string | null;
}

/**
 * Live-mode archive additions (I6). Each member is written only when present:
 * a null or absent array adds no file, so a no-endpoint session (interviewer
 * never ran) has `annotations.json` but no `transcript.json`, and a session
 * whose endpoint was lost adds `transcript.json` and `units.json` (R4).
 * `frames` and `clips` map a file name (`<id>.jpg`, `<id>.webm`) to its bytes
 * under `frames/` and `clips/`.
 */
export interface LiveArchiveInputs {
  transcript?: LiveTranscript[] | null;
  units?: LiveUnit[] | null;
  annotations?: LiveAnnotation[] | null;
  frames?: Record<string, Blob> | null;
  clips?: Record<string, Blob> | null;
}

interface SessionStopOptions {
  download?: boolean;
  live?: LiveArchiveInputs | null;
}

export const LIVE_TRANSCRIPT_FILE = "transcript.json";
export const LIVE_UNITS_FILE = "units.json";
export const LIVE_ANNOTATIONS_FILE = "annotations.json";
export const LIVE_FRAMES_DIR = "frames";
export const LIVE_CLIPS_DIR = "clips";

function addLiveFiles(files: Map<string, Blob>, live: LiveArchiveInputs | null | undefined): void {
  if (!live) return;
  if (live.transcript) files.set(LIVE_TRANSCRIPT_FILE, jsonBlob(live.transcript));
  if (live.units) files.set(LIVE_UNITS_FILE, jsonBlob(live.units));
  if (live.annotations) files.set(LIVE_ANNOTATIONS_FILE, jsonBlob(live.annotations));
  for (const [name, blob] of Object.entries(live.frames ?? {})) {
    files.set(`${LIVE_FRAMES_DIR}/${name}`, blob);
  }
  for (const [name, blob] of Object.entries(live.clips ?? {})) {
    files.set(`${LIVE_CLIPS_DIR}/${name}`, blob);
  }
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

  async stop(outputs: CaptureOutputs, options: SessionStopOptions = {}): Promise<SessionResult> {
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
    addLiveFiles(files, options.live);

    const zipSession = withSessionJson(
      filterZipSessionFiles(files),
      outputs,
      endedAt,
      this.options.reactVersion ?? null
    );
    const { filename, archive } = await this.zipWriter.writeSession(
      sessionDirName,
      zipSession.files,
      options
    );
    return {
      sessionPath: filename,
      method: "zip",
      filesPresent: zipSession.filesPresent,
      sessionId: outputs.sessionId,
      filename,
      archive
    };
  }
}

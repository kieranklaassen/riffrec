import { randomUUID } from "node:crypto";
import { zip, type AsyncZippable } from "fflate";
import type { CompletedCaptureSession } from "./capture-session";
import type { SessionJson } from "../shared/types";

export interface SessionMedia {
  recording?: Uint8Array;
  voice?: Uint8Array;
  notes?: string;
}

export interface ArchiveResult {
  filename: string;
  bytes: Uint8Array;
  filesPresent: string[];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createSessionName(date = new Date(), shortId = randomUUID().slice(0, 6)): string {
  return `riffrec-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}-${shortId}`;
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function zipAsync(entries: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

export async function buildSessionArchive(
  session: CompletedCaptureSession,
  media: SessionMedia = {}
): Promise<ArchiveResult> {
  const entries: AsyncZippable = {};
  const optional: string[] = [];

  entries["events.json"] = jsonBytes(session.eventsJson);
  entries["context.json"] = jsonBytes(session.contextJson);

  if (media.recording?.byteLength) {
    entries["recording.webm"] = [media.recording, { level: 0 }];
    optional.push("recording.webm");
  }
  if (media.voice?.byteLength) {
    entries["voice.webm"] = [media.voice, { level: 0 }];
    optional.push("voice.webm");
  }
  if (media.notes?.trim()) {
    entries["notes.md"] = Buffer.from(`${media.notes.trim()}\n`, "utf8");
    optional.push("notes.md");
  }

  const filesPresent = ["session.json", "events.json", "context.json", ...optional];
  const metadata: SessionJson = {
    url: session.eventsJson.url,
    react_version: null,
    browser: `Riffrec Desktop / Electron ${session.contextJson.electron_version}`,
    started_at: session.startedAt.toISOString(),
    ended_at: session.endedAt.toISOString(),
    duration_seconds: session.durationSeconds,
    files_present: filesPresent
  };
  entries["session.json"] = jsonBytes(metadata);

  return {
    filename: `${createSessionName(session.endedAt, session.id.slice(0, 6))}.zip`,
    bytes: await zipAsync(entries),
    filesPresent
  };
}

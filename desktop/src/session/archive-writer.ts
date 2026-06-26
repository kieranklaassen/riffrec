import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CompletedCaptureSession } from "./capture-session";
import { buildPortableEntries } from "./exporter";

const execFileAsync = promisify(execFile);

export interface RecordingDraftFiles {
  directory: string;
  recordingPath: string;
  voicePath: string;
  hasRecording: boolean;
  hasVoice: boolean;
}

export async function writeSessionArchive(
  destination: string,
  session: CompletedCaptureSession,
  draft: RecordingDraftFiles,
  notes: string
): Promise<string[]> {
  const portable = buildPortableEntries(session, {
    recording: draft.hasRecording,
    voice: draft.hasVoice,
    notes
  });
  const filePaths: string[] = [];
  for (const [name, bytes] of Object.entries(portable.entries)) {
    const outputPath = path.join(draft.directory, name);
    await writeFile(outputPath, bytes);
    filePaths.push(outputPath);
  }
  if (draft.hasRecording) {
    filePaths.push(draft.recordingPath);
  }
  if (draft.hasVoice) {
    filePaths.push(draft.voicePath);
  }

  const temporaryArchive = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.partial`
  );
  try {
    await execFileAsync("/usr/bin/zip", ["-q", "-0", "-j", temporaryArchive, ...filePaths]);
    await rename(temporaryArchive, destination);
  } finally {
    await rm(temporaryArchive, { force: true });
  }
  return portable.filesPresent;
}

import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CompletedCaptureSession } from "./capture-session";
import type { RecordingDraftFiles } from "./archive-writer";

const DRAFT_DIRECTORY_NAME = "recording-drafts";
const DRAFT_PREFIX = "session-";
const DRAFT_MANIFEST = "pending-export.json";

export interface RecordingDraft extends RecordingDraftFiles {
  completed: CompletedCaptureSession | null;
  notes: string;
  mediaFinalized: boolean;
}

type DraftStatus = "active" | "pending" | "exported";

interface DraftManifest {
  status: DraftStatus;
  completed: CompletedCaptureSession;
  hasRecording: boolean;
  hasVoice: boolean;
  notes: string;
  mediaFinalized: boolean;
}

interface DraftRetirementActions {
  persist: (draft: RecordingDraft, status: DraftStatus) => Promise<void>;
  remove: (draft: RecordingDraft) => Promise<void>;
}

interface LegacyCleanupActions {
  readDirectories: (tempPath: string) => Promise<string[]>;
  removeDirectory: (directory: string) => Promise<void>;
}

export async function createRecordingDraft(userDataPath: string): Promise<RecordingDraft> {
  const root = await ensureDraftRoot(userDataPath);
  const directory = await mkdtemp(path.join(root, DRAFT_PREFIX));
  await chmod(directory, 0o700);
  return {
    directory,
    recordingPath: path.join(directory, "recording.webm"),
    voicePath: path.join(directory, "voice.webm"),
    hasRecording: false,
    hasVoice: false,
    completed: null,
    notes: "",
    mediaFinalized: false
  };
}

export async function persistRecordingDraft(
  draft: RecordingDraft,
  status: DraftStatus = "pending"
): Promise<void> {
  if (!draft.completed) {
    return;
  }
  const manifest: DraftManifest = {
    status,
    completed: draft.completed,
    hasRecording: draft.hasRecording,
    hasVoice: draft.hasVoice,
    notes: draft.notes,
    mediaFinalized: draft.mediaFinalized
  };
  const manifestPath = path.join(draft.directory, DRAFT_MANIFEST);
  const temporaryPath = path.join(draft.directory, `.${DRAFT_MANIFEST}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function restoreRecordingDrafts(
  userDataPath: string
): Promise<{ pending: RecordingDraft[]; quarantinedDirectories: string[] }> {
  const root = await ensureDraftRoot(userDataPath);
  const pending: RecordingDraft[] = [];
  const quarantinedDirectories: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.filter(
    (candidate) => candidate.isDirectory() && candidate.name.startsWith(DRAFT_PREFIX)
  )) {
    const directory = path.join(root, entry.name);
    try {
      const saved = JSON.parse(
        await readFile(path.join(directory, DRAFT_MANIFEST), "utf8")
      ) as Partial<DraftManifest>;
      if (saved.status !== "active" && saved.status !== "pending" && saved.status !== "exported") {
        quarantinedDirectories.push(directory);
        continue;
      }
      if (saved.status === "exported") {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      const completed = hydrateCompletedSession(saved.completed);
      if (!completed) {
        quarantinedDirectories.push(directory);
        continue;
      }
      const recordingPath = path.join(directory, "recording.webm");
      const voicePath = path.join(directory, "voice.webm");
      const hasRecordingOnDisk = await hasBytes(recordingPath);
      const hasVoiceOnDisk = await hasBytes(voicePath);
      const mediaWasReconciled =
        (hasRecordingOnDisk && saved.hasRecording !== true) ||
        (hasVoiceOnDisk && saved.hasVoice !== true);
      if (mediaWasReconciled) {
        const warning = "Recovered media was found after an interrupted save; exported video may be partial.";
        if (!completed.contextJson.warnings.includes(warning)) {
          completed.contextJson.warnings.push(warning);
        }
      }
      pending.push({
        directory,
        recordingPath,
        voicePath,
        hasRecording: saved.hasRecording === true || hasRecordingOnDisk,
        hasVoice: saved.hasVoice === true || hasVoiceOnDisk,
        completed,
        notes: typeof saved.notes === "string" ? saved.notes : "",
        mediaFinalized: saved.status !== "active" && saved.mediaFinalized === true
      });
    } catch {
      quarantinedDirectories.push(directory);
    }
  }
  pending.sort(
    (left, right) =>
      (left.completed?.endedAt.getTime() ?? 0) - (right.completed?.endedAt.getTime() ?? 0)
  );
  return { pending, quarantinedDirectories };
}

export async function removeRecordingDraft(draft: RecordingDraft | null): Promise<void> {
  if (draft) {
    await rm(draft.directory, { recursive: true, force: true });
  }
}

export async function removeQuarantinedDraftDirectories(directories: string[]): Promise<void> {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
}

export async function cleanupLegacyRecordingDrafts(
  tempPath: string,
  prefix: string,
  actions: LegacyCleanupActions = {
    readDirectories: async (directory) =>
      (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(directory, entry.name)),
    removeDirectory: async (directory) => rm(directory, { recursive: true, force: true })
  }
): Promise<string[]> {
  try {
    const directories = (await actions.readDirectories(tempPath)).filter((directory) =>
      path.basename(directory).startsWith(prefix)
    );
    const settled = await Promise.allSettled(
      directories.map((directory) => actions.removeDirectory(directory))
    );
    return directories.filter((_directory, index) => settled[index]?.status === "rejected");
  } catch {
    // Legacy cleanup must never prevent access to current recovery controls.
    return [];
  }
}

export async function retireRecordingDraft(
  draft: RecordingDraft,
  actions: DraftRetirementActions = {
    persist: persistRecordingDraft,
    remove: async (candidate) => removeRecordingDraft(candidate)
  }
): Promise<void> {
  try {
    await actions.persist(draft, "exported");
  } catch {
    // Physical deletion below is sufficient when tombstone persistence fails.
  }
  try {
    await actions.remove(draft);
  } catch {
    throw new Error("Could not delete the resolved recording draft from local storage.");
  }
}

async function ensureDraftRoot(userDataPath: string): Promise<string> {
  const root = path.join(userDataPath, DRAFT_DIRECTORY_NAME);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  return root;
}

async function hasBytes(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

function hydrateCompletedSession(value: unknown): CompletedCaptureSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Partial<CompletedCaptureSession>;
  const startedAt = new Date(typeof input.startedAt === "string" ? input.startedAt : "");
  const endedAt = new Date(typeof input.endedAt === "string" ? input.endedAt : "");
  if (
    typeof input.id !== "string" ||
    typeof input.startedAt !== "string" ||
    typeof input.endedAt !== "string" ||
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(endedAt.getTime()) ||
    !input.eventsJson ||
    typeof input.eventsJson.url !== "string" ||
    !Array.isArray(input.eventsJson.events) ||
    !input.contextJson ||
    typeof input.contextJson.electron_version !== "string" ||
    !Array.isArray(input.contextJson.warnings) ||
    !input.contextJson.warnings.every((warning) => typeof warning === "string")
  ) {
    return null;
  }
  return {
    id: input.id,
    startedAt,
    endedAt,
    durationSeconds: Number(input.durationSeconds) || 0,
    eventsJson: input.eventsJson,
    contextJson: input.contextJson
  };
}

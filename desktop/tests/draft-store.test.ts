import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CaptureSession } from "../src/session/capture-session";
import {
  cleanupLegacyRecordingDrafts,
  createRecordingDraft,
  persistRecordingDraft,
  retireRecordingDraft,
  restoreRecordingDrafts
} from "../src/session/draft-store";

function completedSession(url: string) {
  return new CaptureSession({
    initialState: {
      url,
      title: "Recovered",
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      canRecord: true
    },
    options: { microphone: false, captureClicks: false },
    outcomes: { screen: "captured", microphone: "disabled" },
    appVersion: "0.1.0",
    electronVersion: "42.3.0",
    viewport: { width: 800, height: 600, device_pixel_ratio: 2, zoom_factor: 1 }
  }).complete();
}

describe("draft-store", () => {
  it("restores all pending drafts while removing only explicitly exported drafts", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const first = await createRecordingDraft(userData);
    const second = await createRecordingDraft(userData);
    const exported = await createRecordingDraft(userData);
    first.completed = completedSession("https://example.test/one");
    second.completed = completedSession("https://example.test/two");
    exported.completed = completedSession("https://example.test/exported");
    await persistRecordingDraft(first);
    await persistRecordingDraft(second);
    await persistRecordingDraft(exported, "exported");

    const restored = await restoreRecordingDrafts(userData);

    expect(restored.pending).toHaveLength(2);
    expect(restored.pending.map((draft) => draft.completed?.eventsJson.url).sort()).toEqual([
      "https://example.test/one",
      "https://example.test/two"
    ]);
    await expect(stat(exported.directory)).rejects.toThrow();
  });

  it("quarantines media when a recovery manifest is corrupt instead of deleting the draft", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const draft = await createRecordingDraft(userData);
    await writeFile(path.join(draft.directory, "recording.webm"), Buffer.from([1, 2, 3]));
    await writeFile(path.join(draft.directory, "pending-export.json"), "{broken", "utf8");

    const restored = await restoreRecordingDrafts(userData);

    expect(restored.pending).toEqual([]);
    expect(restored.quarantinedDirectories).toEqual([draft.directory]);
    expect(await readFile(path.join(draft.directory, "recording.webm"))).toEqual(
      Buffer.from([1, 2, 3])
    );
  });

  it("quarantines a structurally malformed manifest instead of crashing recovery", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const draft = await createRecordingDraft(userData);
    const completed = completedSession("https://example.test/malformed");
    await writeFile(
      path.join(draft.directory, "pending-export.json"),
      JSON.stringify({ status: "pending", completed: { ...completed, contextJson: {} } }),
      "utf8"
    );

    const restored = await restoreRecordingDrafts(userData);

    expect(restored.pending).toEqual([]);
    expect(restored.quarantinedDirectories).toEqual([draft.directory]);
  });

  it("persists the finalization state used to label interrupted recovered recordings", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const draft = await createRecordingDraft(userData);
    draft.completed = completedSession("https://example.test/partial");
    draft.hasRecording = true;
    await persistRecordingDraft(draft);

    let restored = await restoreRecordingDrafts(userData);
    expect(restored.pending[0]?.mediaFinalized).toBe(false);

    draft.mediaFinalized = true;
    await persistRecordingDraft(draft);
    restored = await restoreRecordingDrafts(userData);
    expect(restored.pending[0]?.mediaFinalized).toBe(true);
  });

  it("restores interrupted active media and reconciles bytes written after its manifest", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const draft = await createRecordingDraft(userData);
    draft.completed = completedSession("https://example.test/interrupted");
    await persistRecordingDraft(draft, "active");
    await writeFile(draft.recordingPath, Buffer.from([1, 2, 3]));

    const restored = await restoreRecordingDrafts(userData);
    const pending = restored.pending[0];

    expect(pending?.hasRecording).toBe(true);
    expect(pending?.mediaFinalized).toBe(false);
    expect(pending?.completed?.contextJson.warnings).toContain(
      "Recovered media was found after an interrupted save; exported video may be partial."
    );
  });

  it("falls back to deletion when a resolved-draft tombstone cannot be persisted", async () => {
    const draft = await createRecordingDraft(await mkdtemp(path.join(os.tmpdir(), "riffrec-store-")));
    draft.completed = completedSession("https://example.test/resolved");
    let deleted = false;

    await retireRecordingDraft(draft, {
      persist: async () => {
        throw new Error("storage unavailable");
      },
      remove: async () => {
        deleted = true;
      }
    });

    expect(deleted).toBe(true);
  });

  it("does not report a resolved draft while physical deletion fails after tombstoning", async () => {
    const draft = await createRecordingDraft(await mkdtemp(path.join(os.tmpdir(), "riffrec-store-")));
    draft.completed = completedSession("https://example.test/unresolved");

    await expect(
      retireRecordingDraft(draft, {
        persist: async () => undefined,
        remove: async () => {
          throw new Error("delete unavailable");
        }
      })
    ).rejects.toThrow("Could not delete the resolved recording draft from local storage.");
  });

  it("does not let legacy temp cleanup failure block recovery startup", async () => {
    const missingTempPath = path.join(
      await mkdtemp(path.join(os.tmpdir(), "riffrec-store-")),
      "missing-temp"
    );

    await expect(cleanupLegacyRecordingDrafts(missingTempPath, "riffrec-recording-")).resolves.toEqual([]);
  });

  it("returns undeleted legacy recordings so the user can remove retained recovery data", async () => {
    const tempPath = await mkdtemp(path.join(os.tmpdir(), "riffrec-store-"));
    const retained = path.join(tempPath, "riffrec-recording-retained");
    const removed = path.join(tempPath, "riffrec-recording-removed");

    await expect(
      cleanupLegacyRecordingDrafts(tempPath, "riffrec-recording-", {
        readDirectories: async () => [retained, removed],
        removeDirectory: async (directory) => {
          if (directory === retained) {
            throw new Error("locked");
          }
        }
      })
    ).resolves.toEqual([retained]);
  });
});

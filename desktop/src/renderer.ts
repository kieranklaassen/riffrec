import type { BrowserState, DesktopApi, ExportResult, MediaKind } from "./shared/types";
import { resolveAddressDisplay } from "./address-display";

declare global {
  interface Window {
    riffrecDesktop: DesktopApi;
  }
}

type RecordingPhase =
  | "idle"
  | "preparing"
  | "recording"
  | "finalizing"
  | "pending-export"
  | "resolving-export";

const api = window.riffrecDesktop;
const MAX_PENDING_MEDIA_BYTES = 128 * 1024 * 1024;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const addressForm = $<HTMLFormElement>("address-form");
const address = $<HTMLInputElement>("address");
const back = $<HTMLButtonElement>("back");
const forward = $<HTMLButtonElement>("forward");
const reload = $<HTMLButtonElement>("reload");
const pageTitle = $<HTMLElement>("page-title");
const pageStatus = $<HTMLElement>("page-status");
const microphone = $<HTMLInputElement>("microphone");
const captureClicks = $<HTMLInputElement>("capture-clicks");
const notes = $<HTMLTextAreaElement>("notes");
const consent = $<HTMLInputElement>("consent");
const record = $<HTMLButtonElement>("record");
const marker = $<HTMLButtonElement>("marker");
const retryExport = $<HTMLButtonElement>("retry-export");
const discardDraft = $<HTMLButtonElement>("discard-draft");
const feedback = $<HTMLElement>("feedback");
const clearData = $<HTMLButtonElement>("clear-data");
const discardQuarantinedDrafts = $<HTMLButtonElement>("discard-quarantined-drafts");
const recordingChip = $<HTMLElement>("recording-chip");
const elapsed = $<HTMLTimeElement>("elapsed");
const emptyState = $<HTMLElement>("empty-state");

let state: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  canRecord: false,
  error: null
};
let phase: RecordingPhase = "idle";
let recordingStart = 0;
let clock: number | null = null;
let screenStream: MediaStream | null = null;
let voiceStream: MediaStream | null = null;
let screenRecorder: MediaRecorder | null = null;
let voiceRecorder: MediaRecorder | null = null;
let mediaWrites: Promise<void> = Promise.resolve();
let mediaWriteFailure: unknown = null;
let pendingMediaBytes = 0;
let automaticStopRequested = false;
let isPartialCapture = false;
let canRecoverPendingExport = true;
let addressDirty = false;
let quarantinedDraftCount = 0;
let removingQuarantinedDrafts = false;

function showMessage(message: string, kind: "quiet" | "error" | "success" = "quiet"): void {
  feedback.textContent = message;
  feedback.className = `feedback ${kind === "quiet" ? "" : kind}`.trim();
}

function layoutBrowser(): void {
  const hasWebsite = Boolean(state.url);
  const railWidth = 354;
  const toolbarHeight = 72;
  api.setBrowserBounds({
    x: 0,
    y: toolbarHeight,
    width: hasWebsite ? Math.max(0, window.innerWidth - railWidth) : 0,
    height: hasWebsite ? Math.max(0, window.innerHeight - toolbarHeight) : 0
  });
  emptyState.hidden = hasWebsite;
}

function isLocked(): boolean {
  return phase !== "idle";
}

function renderPhase(): void {
  const recording = phase === "recording";
  const resolvingExport = phase === "resolving-export";
  const awaitingExport = phase === "pending-export" || resolvingExport;
  const preparing = phase === "preparing";
  const finalizing = phase === "finalizing";
  record.hidden = awaitingExport;
  retryExport.hidden = !awaitingExport;
  discardDraft.hidden = !awaitingExport;
  marker.hidden = !recording;
  recordingChip.hidden = !(recording || finalizing);
  record.classList.toggle("recording", recording || finalizing);
  record.textContent = recording
    ? "Stop and save session"
    : preparing
      ? "Starting recording..."
      : finalizing
        ? "Finishing recording..."
        : "Start recording";
  record.disabled = preparing || finalizing || (!recording && (!state.canRecord || !consent.checked));
  marker.disabled = !recording;
  retryExport.disabled = phase !== "pending-export";
  discardDraft.disabled = phase !== "pending-export";
  consent.disabled = isLocked();
  microphone.disabled = isLocked();
  captureClicks.disabled = isLocked();
  address.disabled = isLocked();
  clearData.disabled = isLocked();
  discardQuarantinedDrafts.disabled =
    removingQuarantinedDrafts || preparing || recording || finalizing || resolvingExport;
  back.disabled = !state.canGoBack || isLocked();
  forward.disabled = !state.canGoForward || isLocked();
  reload.disabled = !state.url || isLocked();
}

function applyState(next: BrowserState): void {
  state = next;
  const displayAddress = resolveAddressDisplay(
    address.value,
    next.url,
    document.activeElement === address,
    addressDirty
  );
  address.value = displayAddress.value;
  addressDirty = displayAddress.dirty;
  pageTitle.textContent = next.title || (next.url ? "Website loaded" : "No site open");
  pageStatus.textContent = next.error
    ? `Page could not be loaded: ${next.error}`
    : next.isLoading
      ? "Loading website..."
      : next.canRecord
        ? "Ready to capture feedback."
        : "Open a website to begin.";
  pageStatus.classList.toggle("error", Boolean(next.error));
  renderPhase();
  layoutBrowser();
}

function setQuarantinedDraftCount(count: number): void {
  quarantinedDraftCount = count;
  discardQuarantinedDrafts.hidden = count === 0;
  discardQuarantinedDrafts.textContent =
    count === 1 ? "Delete retained recovery data" : `Delete ${count} retained recovery drafts`;
  renderPhase();
}

function chooseMimeType(candidates: string[]): string {
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function queueChunk(kind: MediaKind, blob: Blob): void {
  if (!blob.size || mediaWriteFailure) {
    return;
  }
  if (pendingMediaBytes + blob.size > MAX_PENDING_MEDIA_BYTES) {
    mediaWriteFailure = new Error(
      "Recording storage could not keep up. The available partial recording is preserved for export."
    );
    requestPartialStop(
      "Recording stopped because local storage could not keep up; exported video may be partial."
    );
    return;
  }
  pendingMediaBytes += blob.size;
  mediaWrites = mediaWrites
    .then(async () => {
      await api.appendMediaChunk(kind, await blob.arrayBuffer());
    })
    .catch((error: unknown) => {
      mediaWriteFailure = error;
      requestPartialStop("Recording stopped after a local media-write failure; exported video may be partial.");
    })
    .finally(() => {
      pendingMediaBytes = Math.max(0, pendingMediaBytes - blob.size);
    });
}

function stopRecorder(recorder: MediaRecorder | null): Promise<void> {
  if (!recorder || recorder.state === "inactive") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.stop();
  });
}

function updateElapsed(): void {
  const seconds = Math.floor((Date.now() - recordingStart) / 1000);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  elapsed.textContent = `${minutes}:${remainder}`;
}

function setPhase(next: RecordingPhase): void {
  phase = next;
  if (next === "recording") {
    recordingStart = Date.now();
    updateElapsed();
    if (clock === null) {
      clock = window.setInterval(updateElapsed, 1000);
    }
  } else if (next === "idle" || next === "pending-export") {
    if (clock !== null) {
      window.clearInterval(clock);
      clock = null;
    }
  }
  renderPhase();
}

function stopStreams(): void {
  screenStream?.getTracks().forEach((track) => track.stop());
  voiceStream?.getTracks().forEach((track) => track.stop());
  screenStream = null;
  voiceStream = null;
}

function requestPartialStop(warning: string): void {
  if (automaticStopRequested || phase !== "recording") {
    return;
  }
  automaticStopRequested = true;
  isPartialCapture = true;
  void (async () => {
    try {
      await api.addWarning(warning);
      await stopRecording();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), "error");
    }
  })();
}

async function startRecording(): Promise<void> {
  if (phase !== "idle") {
    return;
  }
  setPhase("preparing");
  address.value = state.url;
  addressDirty = false;
  showMessage("Requesting screen and microphone access...");
  const screenCaptureStatus = await api.getScreenCaptureStatus();
  if (screenCaptureStatus === "denied" || screenCaptureStatus === "restricted") {
    throw new Error(
      "Screen Recording is disabled. Enable Riffrec in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen the app."
    );
  }
  let startedSession = false;
  let microphoneOutcome: "captured" | "disabled" | "denied" = microphone.checked
    ? "denied"
    : "disabled";
  mediaWrites = Promise.resolve();
  mediaWriteFailure = null;
  pendingMediaBytes = 0;
  automaticStopRequested = false;
  isPartialCapture = false;
  canRecoverPendingExport = true;
  try {
    await api.authorizeDisplayCapture();
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: { frameRate: 30 }
    });
    screenStream.getVideoTracks()[0]?.addEventListener(
      "ended",
      () => requestPartialStop("Screen capture ended before the session was stopped; video may be partial."),
      { once: true }
    );
    if (microphone.checked) {
      try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        microphoneOutcome = "captured";
      } catch {
        microphoneOutcome = "denied";
        showMessage("Microphone unavailable. Recording screen-only feedback.");
      }
    }

    const videoMime = chooseMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
    screenRecorder = new MediaRecorder(screenStream, videoMime ? { mimeType: videoMime } : undefined);
    screenRecorder.addEventListener("dataavailable", (event) => queueChunk("recording", event.data));
    screenRecorder.addEventListener(
      "stop",
      () => requestPartialStop("Screen recording ended before the session was stopped; video may be partial."),
      { once: true }
    );
    screenRecorder.addEventListener(
      "error",
      () => {
        mediaWriteFailure = new Error("Screen recording failed; available media can still be exported.");
        requestPartialStop("Screen recording failed before the session was stopped; video may be partial.");
      },
      { once: true }
    );
    if (voiceStream) {
      const audioMime = chooseMimeType(["audio/webm;codecs=opus", "audio/webm"]);
      voiceRecorder = new MediaRecorder(voiceStream, audioMime ? { mimeType: audioMime } : undefined);
      voiceRecorder.addEventListener("dataavailable", (event) => queueChunk("voice", event.data));
    } else {
      voiceRecorder = null;
    }

    await api.startRecording({
      options: { microphone: microphone.checked, captureClicks: captureClicks.checked },
      outcomes: { screen: "captured", microphone: microphoneOutcome }
    });
    startedSession = true;
    screenRecorder.start(1000);
    voiceRecorder?.start(1000);
    setPhase("recording");
    showMessage(
      microphoneOutcome === "captured"
        ? "Recording website and narration locally."
        : "Recording website locally without microphone audio."
    );
  } catch (error) {
    stopStreams();
    screenRecorder = null;
    voiceRecorder = null;
    await api.cancelRecording();
    setPhase("idle");
    if (
      !startedSession &&
      error instanceof Error &&
      (error.message.includes("Invalid capture constraints") ||
        error.message.includes("Could not start video source"))
    ) {
      throw new Error(
        "Screen Recording permission is required. Enable Riffrec in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen the app."
      );
    }
    throw error;
  }
}

async function saveExport(action: () => Promise<ExportResult>): Promise<void> {
  const result = await action();
  if (result.canceled) {
    setPhase("pending-export");
    showMessage(
      canRecoverPendingExport
        ? "Recording is preserved. Choose Retry saving zip or Discard recording."
        : "Recording remains available in this open app. Save or discard it before closing.",
      canRecoverPendingExport ? "quiet" : "error"
    );
    return;
  }
  const nextPending = await api.getPendingExport();
  setQuarantinedDraftCount(nextPending.quarantinedCount);
  const savedMessage = isPartialCapture
    ? `Saved partial feedback session to ${result.path}. The zip includes a capture warning.`
    : `Saved feedback session to ${result.path}.`;
  if (nextPending.available) {
    notes.value = nextPending.notes;
    isPartialCapture = nextPending.partial;
    setPhase("pending-export");
    showMessage(
      `${savedMessage} Another recovered recording is ready to save.${
        nextPending.quarantinedCount ? " Damaged recovery data is also retained locally." : ""
      }`,
      "success"
    );
  } else {
    setPhase("idle");
    showMessage(
      `${savedMessage}${
        nextPending.quarantinedCount ? " Damaged recovery data is still retained locally; delete it below." : ""
      }`,
      nextPending.quarantinedCount ? "error" : "success"
    );
  }
  consent.checked = false;
  if (!nextPending.available) {
    notes.value = "";
  }
  renderPhase();
}

async function stopRecording(): Promise<void> {
  if (phase !== "recording") {
    return;
  }
  setPhase("finalizing");
  showMessage("Finishing recording and preparing export...");
  let telemetryEnded = false;
  try {
    const endResult = await api.endTelemetry();
    telemetryEnded = true;
    if (!endResult.recoveryPersisted) {
      canRecoverPendingExport = false;
      showMessage("Recovery metadata could not be stored. Save or discard this recording before closing.", "error");
    }
    await Promise.all([stopRecorder(screenRecorder), stopRecorder(voiceRecorder)]);
    await mediaWrites;
    if (mediaWriteFailure) {
      isPartialCapture = true;
      await api.addWarning("One or more media segments could not be saved; exported video may be partial.");
    }
    await api.finalizeMedia();
    stopStreams();
    screenRecorder = null;
    voiceRecorder = null;
    await saveExport(() => api.saveRecording(notes.value));
  } catch (error) {
    stopStreams();
    screenRecorder = null;
    voiceRecorder = null;
    setPhase(telemetryEnded ? "pending-export" : "recording");
    throw error;
  }
}

addressForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (phase !== "idle") {
    return;
  }
  const submittedAddress = address.value;
  addressDirty = false;
  showMessage("Opening website...");
  const result = await api.navigate(submittedAddress);
  if (!result.ok) {
    address.value = submittedAddress;
    addressDirty = true;
    showMessage(result.error ?? "Unable to open that website.", "error");
  } else {
    showMessage("");
  }
});

address.addEventListener("input", () => {
  addressDirty = true;
});
back.addEventListener("click", () => void api.goBack());
forward.addEventListener("click", () => void api.goForward());
reload.addEventListener("click", () => void api.reload());
consent.addEventListener("change", renderPhase);

record.addEventListener("click", async () => {
  try {
    if (phase === "recording") {
      await stopRecording();
    } else if (phase === "idle") {
      await startRecording();
    }
  } catch (error) {
    if (phase === "preparing") {
      setPhase("idle");
    }
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

marker.addEventListener("click", async () => {
  if (phase !== "recording") {
    return;
  }
  marker.disabled = true;
  try {
    await api.addMarker("User marked this moment");
    showMessage("Moment marked for the reviewer.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    renderPhase();
  }
});

retryExport.addEventListener("click", async () => {
  if (phase !== "pending-export") {
    return;
  }
  setPhase("resolving-export");
  try {
    await saveExport(() => api.retryExport(notes.value));
  } catch (error) {
    setPhase("pending-export");
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

discardDraft.addEventListener("click", async () => {
  if (phase !== "pending-export") {
    return;
  }
  setPhase("resolving-export");
  try {
    await api.discardDraft();
    const nextPending = await api.getPendingExport();
    setQuarantinedDraftCount(nextPending.quarantinedCount);
    if (nextPending.available) {
      notes.value = nextPending.notes;
      isPartialCapture = nextPending.partial;
      setPhase("pending-export");
      showMessage(
        `Discarded that recording. Another recovered recording is ready to review.${
          nextPending.quarantinedCount ? " Damaged recovery data is also retained locally." : ""
        }`
      );
    } else {
      setPhase("idle");
      notes.value = "";
      showMessage(
        nextPending.quarantinedCount
          ? "Discarded the unsaved recording. Damaged recovery data is still retained locally; delete it below."
          : "Discarded the unsaved recording.",
        nextPending.quarantinedCount ? "error" : "quiet"
      );
    }
  } catch (error) {
    setPhase("pending-export");
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

discardQuarantinedDrafts.addEventListener("click", async () => {
  if (!quarantinedDraftCount || removingQuarantinedDrafts) {
    return;
  }
  removingQuarantinedDrafts = true;
  renderPhase();
  try {
    const result = await api.discardQuarantinedDrafts();
    setQuarantinedDraftCount(0);
    showMessage(
      result.removed === 1
        ? "Deleted the retained recovery draft from this Mac."
        : `Deleted ${result.removed} retained recovery drafts from this Mac.`,
      "success"
    );
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    removingQuarantinedDrafts = false;
    renderPhase();
  }
});

clearData.addEventListener("click", async () => {
  if (phase !== "idle") {
    return;
  }
  try {
    await api.clearBrowsingData();
    showMessage("Website sign-in data and cache cleared.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

window.addEventListener("resize", layoutBrowser);
api.onBrowserState(applyState);
api.onNotice((message) => showMessage(message, "error"));
renderPhase();
layoutBrowser();
void api.getPendingExport().then((pending) => {
  setQuarantinedDraftCount(pending.quarantinedCount);
  if (pending.available) {
    notes.value = pending.notes;
    isPartialCapture = pending.partial;
    setPhase("pending-export");
    showMessage(
      `${
        pending.activeAborted
          ? "Recovered an interrupted in-progress recording; its video may be partial."
          : pending.additionalCount
            ? `Recovered an unsaved recording. ${pending.additionalCount} additional recording(s) remain queued.`
            : "Recovered an unsaved recording. Retry saving the zip or discard the recording."
      }${pending.quarantinedCount ? " Damaged recovery data is also retained locally." : ""}`
    );
  } else if (pending.quarantinedCount) {
    showMessage(
      "A damaged recording draft was retained locally because it could not be recovered automatically.",
      "error"
    );
  }
});

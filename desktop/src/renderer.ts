import type { BrowserState, DesktopApi, RecordingMediaPayload } from "./shared/types";

declare global {
  interface Window {
    riffrecDesktop: DesktopApi;
  }
}

const api = window.riffrecDesktop;
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
const feedback = $<HTMLElement>("feedback");
const clearData = $<HTMLButtonElement>("clear-data");
const recordingChip = $<HTMLElement>("recording-chip");
const elapsed = $<HTMLTimeElement>("elapsed");
const emptyState = $<HTMLElement>("empty-state");

let state: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  error: null
};
let isRecording = false;
let recordingStart = 0;
let clock: number | null = null;
let screenStream: MediaStream | null = null;
let voiceStream: MediaStream | null = null;
let screenRecorder: MediaRecorder | null = null;
let voiceRecorder: MediaRecorder | null = null;
let screenChunks: Blob[] = [];
let voiceChunks: Blob[] = [];

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

function applyState(next: BrowserState): void {
  state = next;
  if (next.url && document.activeElement !== address) {
    address.value = next.url;
  }
  back.disabled = !next.canGoBack || isRecording;
  forward.disabled = !next.canGoForward || isRecording;
  reload.disabled = !next.url || isRecording;
  pageTitle.textContent = next.title || (next.url ? "Website loaded" : "No site open");
  pageStatus.textContent = next.error
    ? `Page could not be loaded: ${next.error}`
    : next.isLoading
      ? "Loading website..."
      : next.url
        ? "Ready to capture feedback."
        : "Open a website to begin.";
  pageStatus.classList.toggle("error", Boolean(next.error));
  updateRecordAvailability();
  layoutBrowser();
}

function updateRecordAvailability(): void {
  if (isRecording) {
    record.disabled = false;
    return;
  }
  record.disabled = !state.url || !consent.checked;
}

function chooseMimeType(candidates: string[]): string {
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function collectRecorder(recorder: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
  if (!recorder) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    recorder.addEventListener(
      "stop",
      () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null),
      { once: true }
    );
    if (recorder.state === "inactive") {
      resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
    } else {
      recorder.stop();
    }
  });
}

function updateElapsed(): void {
  const seconds = Math.floor((Date.now() - recordingStart) / 1000);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  elapsed.textContent = `${minutes}:${remainder}`;
}

function enterRecordingState(): void {
  isRecording = true;
  recordingStart = Date.now();
  record.textContent = "Stop and save session";
  record.classList.add("recording");
  marker.hidden = false;
  recordingChip.hidden = false;
  consent.disabled = true;
  microphone.disabled = true;
  captureClicks.disabled = true;
  address.disabled = true;
  updateRecordAvailability();
  applyState(state);
  updateElapsed();
  clock = window.setInterval(updateElapsed, 1000);
}

function leaveRecordingState(): void {
  isRecording = false;
  record.textContent = "Start recording";
  record.classList.remove("recording");
  marker.hidden = true;
  recordingChip.hidden = true;
  consent.disabled = false;
  microphone.disabled = false;
  captureClicks.disabled = false;
  address.disabled = false;
  if (clock !== null) {
    window.clearInterval(clock);
    clock = null;
  }
  updateRecordAvailability();
  applyState(state);
}

function stopStreams(): void {
  screenStream?.getTracks().forEach((track) => track.stop());
  voiceStream?.getTracks().forEach((track) => track.stop());
  screenStream = null;
  voiceStream = null;
}

async function startRecording(): Promise<void> {
  showMessage("Requesting screen and microphone access...");
  const screenCaptureStatus = await api.getScreenCaptureStatus();
  if (screenCaptureStatus === "denied" || screenCaptureStatus === "restricted") {
    throw new Error(
      "Screen Recording is disabled. Enable Riffrec in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen the app."
    );
  }
  screenChunks = [];
  voiceChunks = [];
  let microphoneOutcome: "captured" | "disabled" | "denied" = microphone.checked
    ? "denied"
    : "disabled";
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: 30
      }
    });

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
    screenRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) {
        screenChunks.push(event.data);
      }
    });

    if (voiceStream) {
      const audioMime = chooseMimeType(["audio/webm;codecs=opus", "audio/webm"]);
      voiceRecorder = new MediaRecorder(voiceStream, audioMime ? { mimeType: audioMime } : undefined);
      voiceRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) {
          voiceChunks.push(event.data);
        }
      });
    } else {
      voiceRecorder = null;
    }

    await api.startRecording({
      options: { microphone: microphone.checked, captureClicks: captureClicks.checked },
      outcomes: { screen: "captured", microphone: microphoneOutcome }
    });
    screenRecorder.start(1000);
    voiceRecorder?.start(1000);
    enterRecordingState();
    showMessage(
      microphoneOutcome === "captured"
        ? "Recording website and narration locally."
        : "Recording website locally without microphone audio."
    );
  } catch (error) {
    stopStreams();
    await api.cancelRecording();
    if (
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

async function stopRecording(): Promise<void> {
  record.disabled = true;
  showMessage("Finalizing recording and building zip...");
  const [recordingBlob, voiceBlob] = await Promise.all([
    collectRecorder(screenRecorder, screenChunks),
    collectRecorder(voiceRecorder, voiceChunks)
  ]);
  stopStreams();
  screenRecorder = null;
  voiceRecorder = null;
  if (!recordingBlob) {
    await api.cancelRecording();
    leaveRecordingState();
    throw new Error("The screen recording did not contain media.");
  }
  const payload: RecordingMediaPayload = {
    recording: await recordingBlob.arrayBuffer(),
    voice: voiceBlob ? await voiceBlob.arrayBuffer() : null,
    notes: notes.value
  };
  const result = await api.stopRecording(payload);
  leaveRecordingState();
  if (result.canceled) {
    showMessage("Recording finished. Export was canceled; start again to create a new session.");
  } else {
    showMessage(`Saved feedback session to ${result.path}`, "success");
    consent.checked = false;
    updateRecordAvailability();
  }
}

addressForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isRecording) {
    return;
  }
  showMessage("Opening website...");
  const result = await api.navigate(address.value);
  if (!result.ok) {
    showMessage(result.error ?? "Unable to open that website.", "error");
  } else {
    showMessage("");
  }
});

back.addEventListener("click", () => void api.goBack());
forward.addEventListener("click", () => void api.goForward());
reload.addEventListener("click", () => void api.reload());
consent.addEventListener("change", updateRecordAvailability);

record.addEventListener("click", async () => {
  try {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  } catch (error) {
    leaveRecordingState();
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

marker.addEventListener("click", async () => {
  try {
    await api.addMarker("User marked this moment");
    showMessage("Moment marked for the reviewer.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

clearData.addEventListener("click", async () => {
  try {
    await api.clearBrowsingData();
    showMessage("Website sign-in data and cache cleared.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
});

window.addEventListener("resize", layoutBrowser);
api.onBrowserState(applyState);
layoutBrowser();

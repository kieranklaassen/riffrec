import { appendFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session,
  systemPreferences,
  WebContentsView,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session
} from "electron";
import type {
  BrowserState,
  CaptureOptions,
  ExportResult,
  MediaKind,
  Rectangle,
  RecordingStartInput
} from "./shared/types";
import { CaptureSession, type CompletedCaptureSession } from "./session/capture-session";
import { findAuthorizedWindowSource } from "./session/capture-source";
import { writeSessionArchive } from "./session/archive-writer";
import {
  createRecordingDraft,
  cleanupLegacyRecordingDrafts,
  persistRecordingDraft,
  removeQuarantinedDraftDirectories,
  removeRecordingDraft,
  retireRecordingDraft,
  restoreRecordingDrafts,
  type RecordingDraft
} from "./session/draft-store";
import { createSessionName } from "./session/exporter";
import {
  isAllowedWebsiteUrl,
  normalizeWebsiteUrl,
  redactUrl,
  sanitizeClickObservation,
  truncate
} from "./session/privacy";

const WEBSITE_PARTITION = "persist:riffrec-sites";
const LEGACY_DRAFT_PREFIX = "riffrec-recording-";
const MAX_MEDIA_CHUNK_BYTES = 64 * 1024 * 1024;
const CHANNELS = {
  browserState: "riffrec:browser-state",
  notice: "riffrec:notice",
  navigate: "riffrec:navigate",
  goBack: "riffrec:go-back",
  goForward: "riffrec:go-forward",
  reload: "riffrec:reload",
  bounds: "riffrec:bounds",
  clearData: "riffrec:clear-data",
  screenCaptureStatus: "riffrec:screen-capture-status",
  authorizeDisplayCapture: "riffrec:authorize-display-capture",
  startRecording: "riffrec:start-recording",
  appendMediaChunk: "riffrec:append-media-chunk",
  endTelemetry: "riffrec:end-telemetry",
  finalizeMedia: "riffrec:finalize-media",
  saveRecording: "riffrec:save-recording",
  retryExport: "riffrec:retry-export",
  discardDraft: "riffrec:discard-draft",
  discardQuarantinedDrafts: "riffrec:discard-quarantined-drafts",
  cancelRecording: "riffrec:cancel-recording",
  getPendingExport: "riffrec:get-pending-export",
  marker: "riffrec:marker",
  warning: "riffrec:warning",
  guestClick: "riffrec:guest-click"
} as const;

let controlWindow: BrowserWindow | null = null;
let websiteView: WebContentsView | null = null;
let trustedControlUrl = "";
let loadedUrl = "";
let displayCaptureAuthorized = false;
let websiteSessionConfigured = false;
let browserState: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  canRecord: false,
  error: null
};
let activeSession: CaptureSession | null = null;
let activeOptions: CaptureOptions | null = null;
let activeDraft: RecordingDraft | null = null;
let pendingExport: RecordingDraft | null = null;
let recoveredExports: RecordingDraft[] = [];
let quarantinedDraftsCount = 0;
let quarantinedDraftDirectories: string[] = [];
let pendingOperation: "saving" | "discarding" | null = null;

function requireControlSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (
    !controlWindow ||
    event.sender !== controlWindow.webContents ||
    event.senderFrame !== controlWindow.webContents.mainFrame ||
    event.senderFrame?.url !== trustedControlUrl
  ) {
    throw new Error("Rejected IPC from an untrusted renderer.");
  }
}

function websiteContents() {
  if (!websiteView) {
    throw new Error("The website browser is not ready.");
  }
  return websiteView.webContents;
}

function notify(message: string): void {
  controlWindow?.webContents.send(CHANNELS.notice, message);
}

function updateBrowserState(partial: Partial<BrowserState> = {}): void {
  if (!websiteView) {
    return;
  }
  const contents = websiteView.webContents;
  browserState = {
    url: loadedUrl,
    title: loadedUrl ? truncate(contents.getTitle() || browserState.title, 240) : "",
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    isLoading: contents.isLoading(),
    canRecord: Boolean(loadedUrl),
    ...partial
  };
  activeSession?.updateBrowserState(browserState);
  controlWindow?.webContents.send(CHANNELS.browserState, {
    ...browserState,
    url: redactUrl(browserState.url)
  });
}

function configureWebsiteSession(websiteSession: Session): void {
  if (websiteSessionConfigured) {
    return;
  }
  websiteSessionConfigured = true;
  websiteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  websiteSession.setPermissionCheckHandler(() => false);
  websiteSession.on("will-download", (event, _item, contents) => {
    if (contents === websiteView?.webContents) {
      event.preventDefault();
      notify("Downloads are blocked in the feedback browser.");
    }
  });
  websiteSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.webContentsId === websiteView?.webContents.id) {
      activeSession?.beginNetwork(details.id, details.method, details.url);
    }
    callback({});
  });
  websiteSession.webRequest.onCompleted((details) => {
    if (details.webContentsId === websiteView?.webContents.id) {
      activeSession?.completeNetwork(details.id, details.statusCode);
    }
  });
  websiteSession.webRequest.onErrorOccurred((details) => {
    if (details.webContentsId === websiteView?.webContents.id) {
      activeSession?.completeNetwork(details.id, -1);
    }
  });
}

function setupWebsiteView(): WebContentsView {
  const websiteSession = session.fromPartition(WEBSITE_PARTITION, { cache: true });
  configureWebsiteSession(websiteSession);
  const view = new WebContentsView({
    webPreferences: {
      session: websiteSession,
      preload: path.join(__dirname, "guest-preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  view.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedWebsiteUrl(url)) {
      event.preventDefault();
      notify("Navigation outside HTTPS or a local development address was blocked.");
    }
  });
  view.webContents.on("will-redirect", (event) => {
    if (event.isMainFrame && !isAllowedWebsiteUrl(event.url)) {
      event.preventDefault();
      updateBrowserState({
        isLoading: false,
        error: "A redirect outside allowed website addresses was blocked."
      });
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedWebsiteUrl(url)) {
      void view.webContents.loadURL(normalizeWebsiteUrl(url));
    } else {
      notify("Popup navigation outside allowed website addresses was blocked.");
    }
    return { action: "deny" };
  });
  view.webContents.on("did-start-loading", () => updateBrowserState({ isLoading: true, error: null }));
  view.webContents.on("did-stop-loading", () => updateBrowserState({ isLoading: false }));
  view.webContents.on("page-title-updated", () => updateBrowserState());
  view.webContents.on("did-navigate", (_event, url) => {
    loadedUrl = url;
    activeSession?.addNavigation(url);
    updateBrowserState({ url, canRecord: true });
  });
  view.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) {
      loadedUrl = url;
      activeSession?.addNavigation(url);
      updateBrowserState({ url, canRecord: true });
    }
  });
  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        if (activeSession && validatedUrl) {
          loadedUrl = validatedUrl;
          activeSession.addNavigation(validatedUrl);
          updateBrowserState({
            url: validatedUrl,
            isLoading: false,
            canRecord: false,
            error: truncate(errorDescription, 160)
          });
        } else {
          loadedUrl = "";
          updateBrowserState({
            url: "",
            isLoading: false,
            canRecord: false,
            error: truncate(errorDescription, 160)
          });
        }
      }
    }
  );
  view.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 3) {
      const source = sourceId ? ` at ${redactUrl(sourceId)}:${line}` : "";
      activeSession?.addConsoleError(`${message}${source}`);
    }
  });
  return view;
}

function createWindow(): void {
  const pagePath = path.join(__dirname, "../assets/index.html");
  trustedControlUrl = pathToFileURL(pagePath).href;
  controlWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1020,
    minHeight: 700,
    title: "Riffrec",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f3efe7",
    webPreferences: {
      preload: path.join(__dirname, "control-preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  controlWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== trustedControlUrl) {
      event.preventDefault();
    }
  });
  controlWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  controlWindow.on("close", (event) => {
    if (activeSession || pendingExport) {
      event.preventDefault();
      notify("Stop and save your recording, or discard the pending export, before closing Riffrec.");
    }
  });

  websiteView = setupWebsiteView();
  controlWindow.contentView.addChildView(websiteView);
  void controlWindow.loadFile(pagePath);
  controlWindow.on("closed", () => {
    websiteView?.webContents.close();
    websiteView = null;
    controlWindow = null;
    loadedUrl = "";
    displayCaptureAuthorized = false;
  });
}

function setupTrustedDisplayCapture(): void {
  const denyCapture = (callback: (streams: {}) => void) => {
    try {
      callback({});
    } catch {
      // The renderer receives Electron's rejection for the required video stream.
    }
  };
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const trustedRequest =
      controlWindow &&
      displayCaptureAuthorized &&
      request.frame === controlWindow.webContents.mainFrame &&
      request.frame?.url === trustedControlUrl;
    displayCaptureAuthorized = false;
    if (!trustedRequest || !controlWindow) {
      denyCapture(callback);
      return;
    }
    try {
      const sourceId = controlWindow.getMediaSourceId();
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 0, height: 0 }
      });
      const source = findAuthorizedWindowSource(sources, sourceId);
      if (source) {
        callback({ video: source });
      } else {
        denyCapture(callback);
      }
    } catch {
      denyCapture(callback);
    }
  });
}

function currentViewport(): CompletedCaptureSession["contextJson"]["viewport"] {
  const bounds = websiteView?.getBounds() ?? { width: 0, height: 0 };
  const scale = controlWindow ? screen.getDisplayMatching(controlWindow.getBounds()).scaleFactor : 1;
  return {
    width: bounds.width,
    height: bounds.height,
    device_pixel_ratio: scale,
    zoom_factor: websiteView?.webContents.getZoomFactor() ?? 1
  };
}

async function createDraft(): Promise<RecordingDraft> {
  return createRecordingDraft(app.getPath("userData"));
}

async function persistPendingDraft(draft: RecordingDraft): Promise<void> {
  await persistRecordingDraft(draft);
}

async function persistActiveDraft(draft: RecordingDraft): Promise<void> {
  await persistRecordingDraft(draft, "active");
}

async function markPartialRecovery(draft: RecordingDraft | null): Promise<void> {
  if (!draft?.completed || draft.mediaFinalized) {
    return;
  }
  const warning = "Recording was recovered before final media was saved; exported video may be partial.";
  if (!draft.completed.contextJson.warnings.includes(warning)) {
    draft.completed.contextJson.warnings.push(warning);
    try {
      await persistPendingDraft(draft);
    } catch {
      // The in-memory warning still ships if the user exports in this process.
    }
  }
}

async function restorePendingDraft(): Promise<void> {
  const recovered = await restoreRecordingDrafts(app.getPath("userData"));
  recoveredExports = recovered.pending;
  quarantinedDraftDirectories = recovered.quarantinedDirectories;
  pendingExport = recoveredExports.shift() ?? null;
  await markPartialRecovery(pendingExport);

  const retainedLegacyDrafts = await cleanupLegacyRecordingDrafts(
    app.getPath("temp"),
    LEGACY_DRAFT_PREFIX
  );
  quarantinedDraftDirectories.push(...retainedLegacyDrafts);
  quarantinedDraftsCount = quarantinedDraftDirectories.length;
}

async function removeDraft(draft: RecordingDraft | null): Promise<void> {
  await removeRecordingDraft(draft);
}

async function showNextRecoveredExport(): Promise<void> {
  pendingExport = recoveredExports.shift() ?? null;
  await markPartialRecovery(pendingExport);
}

async function recordDraftWarning(draft: RecordingDraft, warning: string): Promise<void> {
  if (activeSession) {
    activeSession.addWarning(warning);
    draft.completed = activeSession.complete();
    try {
      await persistActiveDraft(draft);
    } catch {
      // Continue recording when a recovery snapshot cannot be refreshed.
    }
    return;
  }
  if (draft.completed && !draft.completed.contextJson.warnings.includes(warning)) {
    draft.completed.contextJson.warnings.push(warning);
    await persistPendingDraft(draft);
  }
}

async function withPendingOperation<T>(
  operation: "saving" | "discarding",
  perform: (draft: RecordingDraft) => Promise<T>
): Promise<T> {
  if (pendingOperation) {
    throw new Error("A recording export action is already in progress.");
  }
  const draft = pendingExport;
  if (!draft?.completed) {
    throw new Error("There is no completed recording to export.");
  }
  pendingOperation = operation;
  try {
    return await perform(draft);
  } finally {
    pendingOperation = null;
  }
}

async function advanceSavedDraft(
  draft: RecordingDraft,
  savedPath: string
): Promise<void> {
  if (pendingExport !== draft) {
    throw new Error("The pending recording changed before its local recovery copy was cleared.");
  }
  try {
    await retireRecordingDraft(draft);
  } catch {
    throw new Error(
      `Saved the zip to ${savedPath}, but could not delete its local recovery copy. Use Discard recording to remove it before closing Riffrec.`
    );
  }
  await showNextRecoveredExport();
}

async function savePendingRecording(notes: string): Promise<ExportResult> {
  return withPendingOperation("saving", async (draft) => {
    if (!controlWindow || !draft.completed) {
      throw new Error("There is no completed recording to export.");
    }
    if (!draft.hasRecording) {
      throw new Error("The screen recording did not contain media. Discard this draft to begin again.");
    }
    draft.notes = notes.slice(0, 100_000);
    try {
      await persistPendingDraft(draft);
    } catch {
      if (
        !draft.completed.contextJson.warnings.includes(
          "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
        )
      ) {
        draft.completed.contextJson.warnings.push(
          "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
        );
      }
    }
    const completed = draft.completed;
    const filename = `${createSessionName(completed.endedAt, completed.id.slice(0, 6))}.zip`;
    const result = await dialog.showSaveDialog(controlWindow, {
      title: "Save Riffrec feedback session",
      defaultPath: path.join(app.getPath("downloads"), filename),
      filters: [{ name: "Riffrec zip session", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePath) {
      return { path: null, canceled: true, retryAvailable: true };
    }
    await writeSessionArchive(result.filePath, completed, draft, draft.notes);
    await advanceSavedDraft(draft, result.filePath);
    return { path: result.filePath, canceled: false, retryAvailable: false };
  });
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.navigate, async (event, value: unknown) => {
    requireControlSender(event);
    if (typeof value !== "string") {
      return { ok: false, error: "Enter a website address first." };
    }
    try {
      const url = normalizeWebsiteUrl(value);
      updateBrowserState({ isLoading: true, error: null });
      await websiteContents().loadURL(url);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ERR_ABORTED")) {
        return { ok: true };
      }
      updateBrowserState({ isLoading: false, error: truncate(message, 160) });
      return { ok: false, error: message };
    }
  });
  ipcMain.handle(CHANNELS.goBack, (event) => {
    requireControlSender(event);
    if (websiteContents().navigationHistory.canGoBack()) {
      websiteContents().navigationHistory.goBack();
    }
  });
  ipcMain.handle(CHANNELS.goForward, (event) => {
    requireControlSender(event);
    if (websiteContents().navigationHistory.canGoForward()) {
      websiteContents().navigationHistory.goForward();
    }
  });
  ipcMain.handle(CHANNELS.reload, (event) => {
    requireControlSender(event);
    websiteContents().reload();
  });
  ipcMain.on(CHANNELS.bounds, (event, bounds: Rectangle) => {
    requireControlSender(event);
    if (
      !bounds ||
      ![bounds.x, bounds.y, bounds.width, bounds.height].every((value) => Number.isFinite(value))
    ) {
      return;
    }
    websiteView?.setBounds({
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    });
  });
  ipcMain.handle(CHANNELS.clearData, async (event) => {
    requireControlSender(event);
    if (activeSession || pendingExport) {
      throw new Error("Finish or discard the recording before clearing browser data.");
    }
    const websiteSession = session.fromPartition(WEBSITE_PARTITION);
    await Promise.all([
      websiteSession.clearCache(),
      websiteSession.clearStorageData(),
      websiteSession.clearAuthCache()
    ]);
    websiteContents().reloadIgnoringCache();
  });
  ipcMain.handle(CHANNELS.screenCaptureStatus, (event) => {
    requireControlSender(event);
    return systemPreferences.getMediaAccessStatus("screen");
  });
  ipcMain.handle(CHANNELS.authorizeDisplayCapture, (event) => {
    requireControlSender(event);
    displayCaptureAuthorized = true;
  });
  ipcMain.on(CHANNELS.guestClick, (event, payload: unknown) => {
    if (
      !websiteView ||
      event.sender !== websiteView.webContents ||
      event.senderFrame !== websiteView.webContents.mainFrame ||
      !activeSession ||
      !activeOptions?.captureClicks
    ) {
      return;
    }
    const observation = sanitizeClickObservation(payload);
    if (observation) {
      activeSession.addClick(observation);
    }
  });
  ipcMain.handle(CHANNELS.startRecording, async (event, input: RecordingStartInput) => {
    requireControlSender(event);
    if (activeSession || pendingExport || pendingOperation) {
      throw new Error("Save or discard the current recording before starting another.");
    }
    if (!browserState.canRecord) {
      throw new Error("Open a successfully loaded website before starting a recording.");
    }
    activeDraft = await createDraft();
    activeOptions = input.options;
    activeSession = new CaptureSession({
      initialState: browserState,
      options: input.options,
      outcomes: input.outcomes,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      viewport: currentViewport()
    });
    activeDraft.completed = activeSession.complete();
    try {
      await persistActiveDraft(activeDraft);
    } catch {
      const failedDraft = activeDraft;
      activeDraft = null;
      activeSession = null;
      activeOptions = null;
      await removeDraft(failedDraft);
      throw new Error("Could not create recoverable local storage for this recording.");
    }
  });
  ipcMain.handle(CHANNELS.appendMediaChunk, async (event, kind: MediaKind, chunk: unknown) => {
    requireControlSender(event);
    const draft = activeDraft ?? pendingExport;
    if (!draft || (kind !== "recording" && kind !== "voice") || !(chunk instanceof ArrayBuffer)) {
      throw new Error("Rejected invalid recording media.");
    }
    if (chunk.byteLength > MAX_MEDIA_CHUNK_BYTES) {
      throw new Error("A recording media segment exceeded the local storage limit.");
    }
    const outputPath = kind === "recording" ? draft.recordingPath : draft.voicePath;
    try {
      await appendFile(outputPath, Buffer.from(chunk));
    } catch (error) {
      await recordDraftWarning(
        draft,
        "One or more media segments could not be saved; exported video may be partial."
      );
      throw error;
    }
    if (kind === "recording") {
      draft.hasRecording = true;
    } else {
      draft.hasVoice = true;
    }
    if (draft === activeDraft && activeSession) {
      draft.completed = activeSession.complete();
      try {
        await persistActiveDraft(draft);
      } catch {
        activeSession.addWarning(
          "Crash recovery metadata could not be refreshed; export this recording before closing Riffrec."
        );
      }
    } else if (draft.completed) {
      try {
        await persistPendingDraft(draft);
      } catch {
        if (
          !draft.completed.contextJson.warnings.includes(
            "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
          )
        ) {
          draft.completed.contextJson.warnings.push(
            "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
          );
        }
      }
    }
  });
  ipcMain.handle(CHANNELS.endTelemetry, async (event) => {
    requireControlSender(event);
    if (!activeSession || !activeDraft) {
      throw new Error("No recording is running.");
    }
    const completed = activeSession.complete();
    activeDraft.completed = completed;
    pendingExport = activeDraft;
    activeDraft = null;
    activeSession = null;
    activeOptions = null;
    try {
      await persistPendingDraft(pendingExport);
      return { recoveryPersisted: true };
    } catch {
      completed.contextJson.warnings.push(
        "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
      );
      return { recoveryPersisted: false };
    }
  });
  ipcMain.handle(CHANNELS.finalizeMedia, async (event) => {
    requireControlSender(event);
    if (!pendingExport) {
      throw new Error("There is no recording media to finalize.");
    }
    pendingExport.mediaFinalized = true;
    try {
      await persistPendingDraft(pendingExport);
    } catch {
      if (pendingExport.completed) {
        pendingExport.completed.contextJson.warnings.push(
          "Crash recovery metadata could not record media finalization; export before closing Riffrec."
        );
      }
    }
  });
  ipcMain.handle(CHANNELS.marker, (event, label: unknown) => {
    requireControlSender(event);
    if (!activeSession) {
      throw new Error("Start recording before adding a marker.");
    }
    activeSession.addMarker(typeof label === "string" ? label : "");
  });
  ipcMain.handle(CHANNELS.warning, async (event, warning: unknown) => {
    requireControlSender(event);
    const message = typeof warning === "string" ? truncate(warning, 240) : "";
    if (activeSession) {
      activeSession.addWarning(message);
    } else if (pendingExport?.completed) {
      if (!pendingExport.completed.contextJson.warnings.includes(message)) {
        pendingExport.completed.contextJson.warnings.push(message);
      }
      await persistPendingDraft(pendingExport);
    } else {
      throw new Error("Start recording before adding a warning.");
    }
  });
  ipcMain.handle(CHANNELS.saveRecording, (event, notes: unknown) => {
    requireControlSender(event);
    return savePendingRecording(typeof notes === "string" ? notes : "");
  });
  ipcMain.handle(CHANNELS.retryExport, (event, notes: unknown) => {
    requireControlSender(event);
    return savePendingRecording(typeof notes === "string" ? notes : "");
  });
  ipcMain.handle(CHANNELS.discardDraft, async (event) => {
    requireControlSender(event);
    if (activeSession) {
      throw new Error("Stop the active recording before discarding an export.");
    }
    await withPendingOperation("discarding", async (draft) => {
      try {
        await removeDraft(draft);
      } catch {
        throw new Error(
          "Could not delete the local recording draft. It remains available to save or discard again."
        );
      }
      await showNextRecoveredExport();
    });
  });
  ipcMain.handle(CHANNELS.discardQuarantinedDrafts, async (event) => {
    requireControlSender(event);
    if (activeSession || pendingOperation) {
      throw new Error("Finish the current recording action before deleting retained recovery data.");
    }
    const directories = quarantinedDraftDirectories;
    await removeQuarantinedDraftDirectories(directories);
    quarantinedDraftDirectories = [];
    quarantinedDraftsCount = 0;
    return { removed: directories.length };
  });
  ipcMain.handle(CHANNELS.cancelRecording, async (event) => {
    requireControlSender(event);
    displayCaptureAuthorized = false;
    const draft = activeDraft;
    activeDraft = null;
    activeSession = null;
    activeOptions = null;
    await removeDraft(draft);
  });
  ipcMain.handle(CHANNELS.getPendingExport, async (event) => {
    requireControlSender(event);
    let activeAborted = false;
    if (activeSession && activeDraft) {
      activeAborted = true;
      const interrupted = activeDraft;
      activeSession.addWarning(
        "Recording was interrupted after the recorder reloaded; exported video may be partial."
      );
      interrupted.completed = activeSession.complete();
      interrupted.mediaFinalized = false;
      pendingExport = interrupted;
      activeDraft = null;
      activeSession = null;
      activeOptions = null;
      try {
        await persistPendingDraft(interrupted);
      } catch {
        interrupted.completed.contextJson.warnings.push(
          "Crash recovery metadata could not be saved; export this recording before closing Riffrec."
        );
      }
    }
    return {
      available: Boolean(pendingExport),
      notes: pendingExport?.notes ?? "",
      activeAborted,
      additionalCount: recoveredExports.length,
      quarantinedCount: quarantinedDraftsCount,
      partial:
        pendingExport?.completed?.contextJson.warnings.some((warning) =>
          warning.toLowerCase().includes("partial")
        ) ?? false
    };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    await restorePendingDraft();
    registerIpc();
    createWindow();
    setupTrustedDisplayCapture();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
  app.on("second-instance", () => {
    controlWindow?.show();
    controlWindow?.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

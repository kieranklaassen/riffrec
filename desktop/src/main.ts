import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  session,
  systemPreferences,
  WebContentsView,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from "electron";
import type {
  BrowserState,
  CaptureOptions,
  ExportResult,
  Rectangle,
  RecordingMediaPayload,
  RecordingStartInput
} from "./shared/types";
import { CaptureSession } from "./session/capture-session";
import { buildSessionArchive } from "./session/exporter";
import { normalizeWebsiteUrl, redactUrl, sanitizeClickObservation, truncate } from "./session/privacy";

const WEBSITE_PARTITION = "persist:riffrec-sites";
const CHANNELS = {
  browserState: "riffrec:browser-state",
  navigate: "riffrec:navigate",
  goBack: "riffrec:go-back",
  goForward: "riffrec:go-forward",
  reload: "riffrec:reload",
  bounds: "riffrec:bounds",
  clearData: "riffrec:clear-data",
  screenCaptureStatus: "riffrec:screen-capture-status",
  startRecording: "riffrec:start-recording",
  stopRecording: "riffrec:stop-recording",
  cancelRecording: "riffrec:cancel-recording",
  marker: "riffrec:marker",
  guestClick: "riffrec:guest-click"
} as const;

let controlWindow: BrowserWindow | null = null;
let websiteView: WebContentsView | null = null;
let browserState: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  error: null
};
let activeSession: CaptureSession | null = null;
let activeOptions: CaptureOptions | null = null;

function requireControlSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!controlWindow || event.sender !== controlWindow.webContents) {
    throw new Error("Rejected IPC from an untrusted renderer.");
  }
}

function websiteContents() {
  if (!websiteView) {
    throw new Error("The website browser is not ready.");
  }
  return websiteView.webContents;
}

function updateBrowserState(partial: Partial<BrowserState> = {}): void {
  if (!websiteView) {
    return;
  }
  const contents = websiteView.webContents;
  browserState = {
    url: contents.getURL().startsWith("http") ? contents.getURL() : browserState.url,
    title: truncate(contents.getTitle() || browserState.title, 240),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    isLoading: contents.isLoading(),
    ...partial
  };
  activeSession?.updateBrowserState(browserState);
  controlWindow?.webContents.send(CHANNELS.browserState, browserState);
}

function isWebsiteAddress(value: string): boolean {
  try {
    normalizeWebsiteUrl(value);
    return true;
  } catch {
    return false;
  }
}

function setupWebsiteView(): WebContentsView {
  const websiteSession = session.fromPartition(WEBSITE_PARTITION, { cache: true });
  websiteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  websiteSession.setPermissionCheckHandler(() => false);

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

  websiteSession.webRequest.onBeforeRequest((details, callback) => {
    activeSession?.beginNetwork(details.id, details.method, details.url);
    callback({});
  });
  websiteSession.webRequest.onCompleted((details) => {
    activeSession?.completeNetwork(details.id, details.statusCode);
  });
  websiteSession.webRequest.onErrorOccurred((details) => {
    activeSession?.completeNetwork(details.id, -1);
  });

  view.webContents.on("will-navigate", (event, url) => {
    if (!isWebsiteAddress(url)) {
      event.preventDefault();
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebsiteAddress(url)) {
      void view.webContents.loadURL(normalizeWebsiteUrl(url));
    }
    return { action: "deny" };
  });
  view.webContents.on("did-start-loading", () => updateBrowserState({ isLoading: true, error: null }));
  view.webContents.on("did-stop-loading", () => updateBrowserState({ isLoading: false }));
  view.webContents.on("page-title-updated", () => updateBrowserState());
  view.webContents.on("did-navigate", (_event, url) => {
    activeSession?.addNavigation(url);
    updateBrowserState({ url });
  });
  view.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) {
      activeSession?.addNavigation(url);
      updateBrowserState({ url });
    }
  });
  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        updateBrowserState({
          url: validatedUrl || browserState.url,
          isLoading: false,
          error: truncate(errorDescription, 160)
        });
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

  websiteView = setupWebsiteView();
  controlWindow.contentView.addChildView(websiteView);
  void controlWindow.loadFile(path.join(__dirname, "../assets/index.html"));
  controlWindow.on("closed", () => {
    websiteView?.webContents.close();
    websiteView = null;
    controlWindow = null;
    activeSession = null;
    activeOptions = null;
  });
}

function setupTrustedDisplayCapture(): void {
  const denyCapture = (callback: (streams: {}) => void) => {
    try {
      callback({});
    } catch {
      // Electron throws while rejecting a required video stream; renderer receives the denial.
    }
  };
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!controlWindow || !request.securityOrigin.startsWith("file://")) {
      denyCapture(callback);
      return;
    }
    try {
      const sourceId = controlWindow.getMediaSourceId();
      const windowId = sourceId.split(":")[1];
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 0, height: 0 }
      });
      const source =
        sources.find((candidate) => candidate.id === sourceId) ??
        sources.find((candidate) => candidate.id.split(":")[1] === windowId) ??
        sources.find((candidate) => candidate.name === controlWindow?.getTitle());
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

function registerIpc(): void {
  ipcMain.handle(CHANNELS.navigate, async (event, value: unknown) => {
    requireControlSender(event);
    if (typeof value !== "string") {
      return { ok: false, error: "Enter a website address first." };
    }
    try {
      const url = normalizeWebsiteUrl(value);
      updateBrowserState({ url, isLoading: true, error: null });
      await websiteContents().loadURL(url);
      updateBrowserState({ url });
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
    if (activeSession) {
      throw new Error("Stop recording before clearing browser data.");
    }
    const websiteSession = session.fromPartition(WEBSITE_PARTITION);
    await Promise.all([websiteSession.clearCache(), websiteSession.clearStorageData()]);
    websiteContents().reloadIgnoringCache();
  });
  ipcMain.handle(CHANNELS.screenCaptureStatus, (event) => {
    requireControlSender(event);
    return systemPreferences.getMediaAccessStatus("screen");
  });

  ipcMain.on(CHANNELS.guestClick, (event, payload: unknown) => {
    if (!websiteView || event.sender !== websiteView.webContents || !activeSession || !activeOptions?.captureClicks) {
      return;
    }
    const observation = sanitizeClickObservation(payload);
    if (observation) {
      activeSession.addClick(observation);
    }
  });

  ipcMain.handle(CHANNELS.startRecording, (event, input: RecordingStartInput) => {
    requireControlSender(event);
    if (activeSession) {
      throw new Error("A recording is already running.");
    }
    if (!browserState.url) {
      throw new Error("Open a website before starting a recording.");
    }
    activeOptions = input.options;
    activeSession = new CaptureSession({
      initialState: browserState,
      options: input.options,
      outcomes: input.outcomes,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron
    });
  });
  ipcMain.handle(CHANNELS.marker, (event, label: unknown) => {
    requireControlSender(event);
    if (!activeSession) {
      throw new Error("Start recording before adding a marker.");
    }
    activeSession.addMarker(typeof label === "string" ? label : "");
  });
  ipcMain.handle(CHANNELS.cancelRecording, (event) => {
    requireControlSender(event);
    activeSession = null;
    activeOptions = null;
  });
  ipcMain.handle(
    CHANNELS.stopRecording,
    async (event, payload: RecordingMediaPayload): Promise<ExportResult> => {
      requireControlSender(event);
      if (!activeSession || !controlWindow) {
        throw new Error("No recording is running.");
      }
      const completed = activeSession.complete();
      activeSession = null;
      activeOptions = null;
      const archive = await buildSessionArchive(completed, {
        recording: new Uint8Array(payload.recording),
        voice: payload.voice ? new Uint8Array(payload.voice) : undefined,
        notes: payload.notes
      });
      const result = await dialog.showSaveDialog(controlWindow, {
        title: "Save Riffrec feedback session",
        defaultPath: path.join(app.getPath("downloads"), archive.filename),
        filters: [{ name: "Riffrec zip session", extensions: ["zip"] }]
      });
      if (result.canceled || !result.filePath) {
        return { path: null, canceled: true };
      }
      await writeFile(result.filePath, archive.bytes);
      return { path: result.filePath, canceled: false };
    }
  );
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  setupTrustedDisplayCapture();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

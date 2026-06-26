import { contextBridge, ipcRenderer } from "electron";
import type {
  BrowserState,
  DesktopApi,
  MediaKind,
  RecordingStartInput,
  Rectangle
} from "./shared/types";

const api: DesktopApi = {
  navigate: (value: string) => ipcRenderer.invoke("riffrec:navigate", value),
  goBack: () => ipcRenderer.invoke("riffrec:go-back"),
  goForward: () => ipcRenderer.invoke("riffrec:go-forward"),
  reload: () => ipcRenderer.invoke("riffrec:reload"),
  setBrowserBounds: (bounds: Rectangle) => ipcRenderer.send("riffrec:bounds", bounds),
  clearBrowsingData: () => ipcRenderer.invoke("riffrec:clear-data"),
  getScreenCaptureStatus: () => ipcRenderer.invoke("riffrec:screen-capture-status"),
  authorizeDisplayCapture: () => ipcRenderer.invoke("riffrec:authorize-display-capture"),
  startRecording: (input: RecordingStartInput) =>
    ipcRenderer.invoke("riffrec:start-recording", input),
  appendMediaChunk: (kind: MediaKind, chunk: ArrayBuffer) =>
    ipcRenderer.invoke("riffrec:append-media-chunk", kind, chunk),
  endTelemetry: () => ipcRenderer.invoke("riffrec:end-telemetry"),
  finalizeMedia: () => ipcRenderer.invoke("riffrec:finalize-media"),
  addMarker: (label: string) => ipcRenderer.invoke("riffrec:marker", label),
  addWarning: (warning: string) => ipcRenderer.invoke("riffrec:warning", warning),
  saveRecording: (notes: string) => ipcRenderer.invoke("riffrec:save-recording", notes),
  retryExport: (notes: string) => ipcRenderer.invoke("riffrec:retry-export", notes),
  discardDraft: () => ipcRenderer.invoke("riffrec:discard-draft"),
  discardQuarantinedDrafts: () => ipcRenderer.invoke("riffrec:discard-quarantined-drafts"),
  cancelRecording: () => ipcRenderer.invoke("riffrec:cancel-recording"),
  getPendingExport: () => ipcRenderer.invoke("riffrec:get-pending-export"),
  onBrowserState: (listener: (state: BrowserState) => void) => {
    const callback = (_event: Electron.IpcRendererEvent, state: BrowserState) => listener(state);
    ipcRenderer.on("riffrec:browser-state", callback);
    return () => ipcRenderer.removeListener("riffrec:browser-state", callback);
  },
  onNotice: (listener: (message: string) => void) => {
    const callback = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on("riffrec:notice", callback);
    return () => ipcRenderer.removeListener("riffrec:notice", callback);
  }
};

contextBridge.exposeInMainWorld("riffrecDesktop", api);

import { contextBridge, ipcRenderer } from "electron";
import type {
  BrowserState,
  DesktopApi,
  RecordingMediaPayload,
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
  startRecording: (input: RecordingStartInput) =>
    ipcRenderer.invoke("riffrec:start-recording", input),
  addMarker: (label: string) => ipcRenderer.invoke("riffrec:marker", label),
  stopRecording: (payload: RecordingMediaPayload) =>
    ipcRenderer.invoke("riffrec:stop-recording", payload),
  cancelRecording: () => ipcRenderer.invoke("riffrec:cancel-recording"),
  onBrowserState: (listener: (state: BrowserState) => void) => {
    const callback = (_event: Electron.IpcRendererEvent, state: BrowserState) => listener(state);
    ipcRenderer.on("riffrec:browser-state", callback);
    return () => ipcRenderer.removeListener("riffrec:browser-state", callback);
  }
};

contextBridge.exposeInMainWorld("riffrecDesktop", api);

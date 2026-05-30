import { ipcRenderer } from "electron";
import { observationForElement } from "./session/dom-observation";

document.addEventListener(
  "click",
  (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) {
      return;
    }
    ipcRenderer.send("riffrec:guest-click", observationForElement(event.target));
  },
  true
);

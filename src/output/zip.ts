import { zip, zipSync, type Zippable } from "fflate";

export const MAX_RECORDING_IN_ZIP_BYTES = 50 * 1024 * 1024;

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function triggerDownload(filename: string, blob: Blob): void {
  if (typeof window === "undefined" || typeof document === "undefined" || !URL.createObjectURL) {
    throw new Error("Browser download APIs are not available.");
  }

  const url = URL.createObjectURL(blob);
  const fragment = document.createRange().createContextualFragment('<a style="display: none"></a>');
  const anchor = fragment.firstElementChild as HTMLAnchorElement | null;
  if (!anchor) {
    throw new Error("Browser download anchor could not be created.");
  }

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class ZipWriter {
  async writeSession(sessionDirName: string, files: Map<string, Blob>): Promise<string> {
    const zipFiles: Zippable = {};
    let totalBytes = 0;

    for (const [filename, blob] of filterZipSessionFiles(files)) {
      zipFiles[filename] = await blobToUint8Array(blob);
      totalBytes += blob.size;
    }

    const data =
      totalBytes < MAX_RECORDING_IN_ZIP_BYTES ? zipSync(zipFiles) : await zipAsync(zipFiles);
    const archive = new Blob([toArrayBuffer(data)], { type: "application/zip" });
    triggerDownload(`${sessionDirName}.zip`, archive);
    return `${sessionDirName}.zip`;
  }
}

export function isSupported(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined" && typeof URL !== "undefined";
}

export function filterZipSessionFiles(files: Map<string, Blob>): Map<string, Blob> {
  const filtered = new Map<string, Blob>();

  for (const [filename, blob] of files) {
    if (filename === "recording.webm" && blob.size > MAX_RECORDING_IN_ZIP_BYTES) {
      continue;
    }
    filtered.set(filename, blob);
  }

  return filtered;
}

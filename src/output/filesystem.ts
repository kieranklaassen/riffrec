type FileSystemPermissionMode = "read" | "readwrite";
type PermissionStateLike = "granted" | "denied" | "prompt";
type SessionFileValue = Blob | AsyncIterable<Uint8Array>;

interface FileSystemPermissionDescriptorLike {
  mode: FileSystemPermissionMode;
}

interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor?: FileSystemPermissionDescriptorLike) => Promise<PermissionStateLike>;
  requestPermission?: (descriptor?: FileSystemPermissionDescriptorLike) => Promise<PermissionStateLike>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: { mode?: FileSystemPermissionMode }) => Promise<PermissionedDirectoryHandle>;
}

const DB_NAME = "riffrec-db";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open riffrec IndexedDB database."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function getStoredHandle(db: IDBDatabase): Promise<PermissionedDirectoryHandle | null> {
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  return (await requestToPromise(store.get(DIRECTORY_HANDLE_KEY))) ?? null;
}

async function setStoredHandle(db: IDBDatabase, handle: PermissionedDirectoryHandle): Promise<void> {
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  await requestToPromise(store.put(handle, DIRECTORY_HANDLE_KEY));
}

async function hasWritePermission(handle: PermissionedDirectoryHandle): Promise<boolean> {
  const descriptor = { mode: "readwrite" as const };
  const queryPermission = handle.queryPermission?.bind(handle);
  const requestPermission = handle.requestPermission?.bind(handle);

  if (queryPermission && (await queryPermission(descriptor)) === "granted") {
    return true;
  }

  if (requestPermission) {
    return (await requestPermission(descriptor)) === "granted";
  }

  return true;
}

function isAsyncIterable(value: SessionFileValue): value is AsyncIterable<Uint8Array> {
  return Symbol.asyncIterator in Object(value);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function writeFile(fileHandle: FileSystemFileHandle, value: SessionFileValue): Promise<void> {
  const writable = await fileHandle.createWritable();
  try {
    if (value instanceof Blob) {
      await writable.write(value);
    } else if (isAsyncIterable(value)) {
      for await (const chunk of value) {
        await writable.write(toArrayBuffer(chunk));
      }
    }
  } finally {
    await writable.close();
  }
}

export class FileSystemWriter {
  async getOrRequestDirectory(): Promise<PermissionedDirectoryHandle> {
    if (!isSupported()) {
      throw new Error("File System Access API is not supported in this browser.");
    }

    const db = await openDb();
    const storedHandle = await getStoredHandle(db);

    if (storedHandle && (await hasWritePermission(storedHandle))) {
      return storedHandle;
    }

    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      throw new Error("Directory picker is not available.");
    }

    try {
      const handle = await picker({ mode: "readwrite" });
      await setStoredHandle(db, handle);
      return handle;
    } catch (error) {
      throw new Error(`Directory selection cancelled or failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async writeSession(sessionDirName: string, files: Map<string, SessionFileValue>): Promise<string> {
    const rootHandle = await this.getOrRequestDirectory();
    const sessionHandle = await rootHandle.getDirectoryHandle(sessionDirName, { create: true });
    const writtenFiles: string[] = [];

    try {
      for (const [filename, value] of files) {
        const fileHandle = await sessionHandle.getFileHandle(filename, { create: true });
        await writeFile(fileHandle, value);
        writtenFiles.push(filename);
      }
    } catch (error) {
      await Promise.allSettled(writtenFiles.map((filename) => sessionHandle.removeEntry(filename)));
      throw error;
    }

    return sessionDirName;
  }
}

export function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === "function"
  );
}

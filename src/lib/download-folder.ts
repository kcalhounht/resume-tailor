const DB_NAME = "resume-tailor-prefs";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const HANDLE_KEY = "downloadFolder";
const AUTO_DOWNLOAD_KEY = "resume-tailor-auto-download";
const FOLDER_NAME_KEY = "resume-tailor-download-folder-name";

export type DownloadFolderHandle = FileSystemDirectoryHandle;

type PermissionMode = "read" | "readwrite";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: PermissionMode;
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads";
  }) => Promise<FileSystemDirectoryHandle>;
};

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
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB get failed"));
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB put failed"));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB delete failed"));
    });
  } finally {
    db.close();
  }
}

export function isDirectoryPickerSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export function getAutoDownloadPreference(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(AUTO_DOWNLOAD_KEY);
  if (raw == null) return true;
  return raw === "1";
}

export function setAutoDownloadPreference(enabled: boolean): void {
  localStorage.setItem(AUTO_DOWNLOAD_KEY, enabled ? "1" : "0");
}

export function getStoredFolderName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(FOLDER_NAME_KEY);
}

async function queryPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = "readwrite",
): Promise<PermissionState> {
  const withPerms = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode?: PermissionMode }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode?: PermissionMode }) => Promise<PermissionState>;
  };
  if (typeof withPerms.queryPermission === "function") {
    return withPerms.queryPermission({ mode });
  }
  return "granted";
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = "readwrite",
): Promise<boolean> {
  const withPerms = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode?: PermissionMode }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode?: PermissionMode }) => Promise<PermissionState>;
  };

  let state = await queryPermission(handle, mode);
  if (state === "granted") return true;

  if (typeof withPerms.requestPermission === "function") {
    state = await withPerms.requestPermission({ mode });
  }
  return state === "granted";
}

export async function pickDownloadFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "Folder selection needs Chrome, Edge, or another Chromium browser.",
    );
  }

  const handle = await picker({
    id: "resume-tailor-downloads",
    mode: "readwrite",
    startIn: "downloads",
  });

  await idbSet(HANDLE_KEY, handle);
  localStorage.setItem(FOLDER_NAME_KEY, handle.name);
  return handle;
}

export async function loadStoredDownloadFolder(): Promise<{
  handle: FileSystemDirectoryHandle | null;
  name: string | null;
  needsPermission: boolean;
}> {
  const name = getStoredFolderName();
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!handle) {
      return { handle: null, name: null, needsPermission: false };
    }

    const state = await queryPermission(handle);
    if (state === "granted") {
      localStorage.setItem(FOLDER_NAME_KEY, handle.name);
      return { handle, name: handle.name, needsPermission: false };
    }
    if (state === "prompt") {
      return {
        handle,
        name: handle.name || name,
        needsPermission: true,
      };
    }

    await clearDownloadFolder();
    return { handle: null, name: null, needsPermission: false };
  } catch {
    return { handle: null, name, needsPermission: Boolean(name) };
  }
}

export async function clearDownloadFolder(): Promise<void> {
  await idbDelete(HANDLE_KEY);
  localStorage.removeItem(FOLDER_NAME_KEY);
}

export async function saveBlobToDirectory(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
  subfolder?: string,
): Promise<void> {
  let target = directory;
  if (subfolder) {
    target = await directory.getDirectoryHandle(subfolder, { create: true });
  }

  const fileHandle = await target.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

export async function fetchAndSaveToDirectory(
  directory: FileSystemDirectoryHandle,
  url: string,
  fileName: string,
  subfolder?: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  await saveBlobToDirectory(directory, fileName, blob, subfolder);
}

/** Browser fallback when no folder is chosen or FS Access API is unavailable. */
export async function forceBrowserDownload(
  url: string,
  fileName: string,
): Promise<void> {
  // blob:/data: can be triggered directly — no network round-trip.
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadFile(
  url: string,
  fileName: string,
  directory: FileSystemDirectoryHandle | null,
  subfolder?: string,
): Promise<"folder" | "browser"> {
  if (directory) {
    const allowed = await ensureDirectoryPermission(directory);
    if (allowed) {
      await fetchAndSaveToDirectory(directory, url, fileName, subfolder);
      return "folder";
    }
  }
  await forceBrowserDownload(url, fileName);
  return "browser";
}

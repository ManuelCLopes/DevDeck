export type AppFileSystemFileHandle = {
  getFile(): Promise<File>;
  kind: "file";
  name: string;
};

export type AppFileSystemDirectoryHandle = {
  getDirectoryHandle(name: string): Promise<AppFileSystemDirectoryHandle>;
  getFileHandle(name: string): Promise<AppFileSystemFileHandle>;
  kind: "directory";
  name: string;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  values(): AsyncIterable<AppFileSystemHandle>;
};

export type AppFileSystemHandle =
  | AppFileSystemDirectoryHandle
  | AppFileSystemFileHandle;

const DATABASE_NAME = "devdeck-workspace";
const HANDLE_KEY = "root";
const HANDLE_STORE_NAME = "handles";

function openWorkspaceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        database.createObjectStore(HANDLE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openWorkspaceDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE_NAME, mode);
    const store = transaction.objectStore(HANDLE_STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getWorkspaceHandle() {
  return withStore<AppFileSystemDirectoryHandle | null>("readonly", (store) =>
    store.get(HANDLE_KEY),
  );
}

export async function setWorkspaceHandle(handle: AppFileSystemDirectoryHandle) {
  await withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));
}

export async function clearWorkspaceHandle() {
  await withStore("readwrite", (store) => store.delete(HANDLE_KEY));
}

export async function ensureWorkspaceHandlePermission(
  handle: AppFileSystemDirectoryHandle,
) {
  const queryPermission = handle.queryPermission;
  if (!queryPermission) {
    return true;
  }

  const currentPermission = await queryPermission({ mode: "read" });
  if (currentPermission === "granted") {
    return true;
  }

  const requestPermission = handle.requestPermission;
  if (!requestPermission) {
    return false;
  }

  return (await requestPermission({ mode: "read" })) === "granted";
}

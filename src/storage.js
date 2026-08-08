const DATABASE_NAME = "zenexpander-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "state";
const CONFIG_KEY = "workspace";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const result = await callback(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    database.close();
  }
}

export function loadWorkspace() {
  return withStore("readonly", (store) => requestResult(store.get(CONFIG_KEY)));
}

export async function saveWorkspace(workspace) {
  const record = { ...workspace, updatedAt: Date.now() };
  await withStore("readwrite", (store) => requestResult(store.put(record, CONFIG_KEY)));
  return record;
}

export function createPairingToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

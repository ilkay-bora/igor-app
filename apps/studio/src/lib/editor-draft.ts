// The editor's work in progress, kept in this browser so a reload or a dev
// server update doesn't lose it. IndexedDB rather than localStorage: uploaded
// audio and images live in the draft as data URLs and outgrow its ~5MB quota.
const DB_NAME = "igor-editor";
const STORE = "drafts";
const DRAFT_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDraft<T>(): Promise<T | null> {
  try {
    return (await withStore("readonly", (store) => store.get(DRAFT_KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function saveDraft<T>(draft: T): Promise<boolean> {
  try {
    await withStore("readwrite", (store) => store.put(draft, DRAFT_KEY));
    return true;
  } catch {
    return false;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(DRAFT_KEY));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

const DB_NAME = 'dither-dot-db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const HISTORY_KEY = 'gallery_history';

let openDbPromise = null;

function openDb() {
  if (openDbPromise) return openDbPromise;

  openDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });

  return openDbPromise;
}

function withStore(mode, operation) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);

    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    tx.oncomplete = () => finishResolve(undefined);
    tx.onerror = () => finishReject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => finishReject(tx.error || new Error('IndexedDB transaction aborted.'));

    try {
      operation(store, finishResolve, finishReject);
    } catch (error) {
      finishReject(error instanceof Error ? error : new Error('IndexedDB operation failed.'));
    }
  }));
}

export async function loadGalleryHistoryFromDb() {
  try {
    const value = await withStore('readonly', (store, resolve, reject) => {
      const request = store.get(HISTORY_KEY);
      request.onsuccess = () => {
        const payload = request.result?.value;
        resolve(Array.isArray(payload) ? payload : []);
      };
      request.onerror = () => reject(request.error || new Error('Failed to read gallery history.'));
    });
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveGalleryHistoryToDb(history) {
  try {
    await withStore('readwrite', (store, resolve, reject) => {
      const request = store.put({ key: HISTORY_KEY, value: history, updatedAt: Date.now() });
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error || new Error('Failed to write gallery history.'));
    });
  } catch {
    // Ignore persistence failures to keep the UI responsive.
  }
}

export async function clearGalleryHistoryFromDb() {
  try {
    await withStore('readwrite', (store, resolve, reject) => {
      const request = store.delete(HISTORY_KEY);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error || new Error('Failed to clear gallery history.'));
    });
  } catch {
    // Ignore persistence failures to keep the UI responsive.
  }
}

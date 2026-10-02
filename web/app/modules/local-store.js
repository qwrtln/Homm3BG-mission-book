// A crash-safe second copy of the local draft, in IndexedDB rather than
// localStorage: `setItem` returns before the browser has written to disk, so
// a whole-browser `kill -9` can lose the last few seconds `localStorage` ever
// saw. IndexedDB's transaction-complete event does not fire until the write
// has actually landed. One record per scenario path, holding both the text
// and the staged upload set, so the same crash-safety guarantee covers both.
//
// Every failure (blocked storage, a closed or broken database) is caught and
// resolves quietly, exactly as drafts.js's saveDraft does: losing this
// second copy is not fatal, localStorage is still the fallback.

const DB_NAME = "wasm-scenario-builder:local-store";
const STORE_NAME = "records";
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME, { keyPath: "path" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

/**
 * @typedef {object} StagedAsset
 * @property {string} path
 * @property {Uint8Array} bytes
 */

/**
 * @typedef {object} LocalRecord
 * @property {string | null} text the autosaved text; null = no local opinion
 * @property {StagedAsset[] | null} uploads the staged upload set; null = no
 *   local opinion, an empty array = "every upload was removed"
 */

/** @type {LocalRecord} */
const NO_RECORD = { text: null, uploads: null };

/**
 * Reads the stored record for a scenario path.
 *
 * @param {string} path
 * @returns {Promise<LocalRecord>} `{text: null, uploads: null}` when nothing
 *   is stored for this path, or storage is blocked or unavailable
 */
export async function loadRecord(path) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(path);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value ? { text: value.text ?? null, uploads: value.uploads ?? null } : NO_RECORD);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return NO_RECORD;
  }
}

/**
 * Merges a patch into the record for a path, creating it if it did not
 * exist. Resolves on the transaction's `complete` event, not on the write
 * request's own success, and requests default transaction durability (never
 * "strict"): a relaxed flush is an acceptable trade against blocking the
 * caller, since this copy is a second line of defense, not the source of
 * truth.
 *
 * @param {string} path
 * @param {Partial<LocalRecord>} patch
 * @returns {Promise<void>}
 */
async function mergeWrite(path, patch) {
  try {
    const db = await openDb();
    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(path);
        getRequest.onsuccess = () => {
          const existing = getRequest.result ?? { path, text: null, uploads: null };
          store.put({ ...existing, ...patch, path });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch {
    // full or blocked storage: losing this crash-safety copy is not fatal
  }
}

/**
 * @param {string} path
 * @param {string} text
 * @returns {Promise<void>}
 */
export function saveText(path, text) {
  return mergeWrite(path, { text });
}

/**
 * @param {string} path
 * @param {StagedAsset[]} uploads an empty array counts as "every upload was
 *   removed", not "no opinion"
 * @returns {Promise<void>}
 */
export function saveUploads(path, uploads) {
  return mergeWrite(path, { uploads });
}

/**
 * Drops the stored upload set for a path, keeping its text field as is. Used
 * once staged uploads are committed elsewhere (a GitHub save) or discarded,
 * when the text copy must still survive.
 *
 * @param {string} path
 * @returns {Promise<void>}
 */
export function clearUploads(path) {
  return mergeWrite(path, { uploads: null });
}

/**
 * Removes the whole record for a path: both its text and its upload set.
 *
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function deleteRecord(path) {
  try {
    const db = await openDb();
    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch {
    /* blocked storage: nothing was stored */
  }
}

/**
 * Moves a whole record (text and uploads together) to a new path, as a
 * category move does to the localStorage draft. A no-op when nothing is
 * stored under the old path.
 *
 * @param {string} oldPath
 * @param {string} newPath
 * @returns {Promise<void>}
 */
export async function moveRecord(oldPath, newPath) {
  try {
    const db = await openDb();
    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(oldPath);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (existing) {
            store.put({ ...existing, path: newPath });
            store.delete(oldPath);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch {
    /* blocked storage: nothing was stored */
  }
}

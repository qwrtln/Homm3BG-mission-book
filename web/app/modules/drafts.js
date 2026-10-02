import { saveText } from "./local-store.js";
import { state } from "./state.js";

/**
 * @param {string} path
 * @returns {string} the localStorage key holding that path's autosaved draft
 */
export function storageKey(path) {
  return `wasm-scenario-builder:draft:${path}`;
}

/**
 * @param {string} path
 * @returns {string | null} null when there is no draft, or storage is blocked
 */
export function loadDraft(path) {
  try {
    return localStorage.getItem(storageKey(path));
  } catch {
    return null; // private mode, blocked storage: fall back to the pristine source
  }
}

/**
 * @param {string} path
 * @returns {void}
 */
export function deleteDraft(path) {
  try {
    localStorage.removeItem(storageKey(path));
  } catch {
    /* blocked storage: nothing was stored */
  }
}

/**
 * @param {string} path
 * @param {string} text
 * @returns {void}
 */
export function saveDraft(path, text) {
  try {
    localStorage.setItem(storageKey(path), text);
  } catch {
    // full or blocked storage: losing autosave is not fatal
  }
}

/**
 * Writes the draft to both local stores at once: localStorage, and the
 * IndexedDB copy every read prefers. A flush that skipped IndexedDB would
 * leave an older text there to win on the next open.
 *
 * @param {string} path
 * @param {string} text
 * @returns {Promise<void>} settles once the IndexedDB write has landed or failed
 */
export function flushDraft(path, text) {
  saveDraft(path, text);
  return saveText(path, text);
}

/**
 * Debounces an autosave 400 ms out. Deliberately re-reads state when it
 * fires rather than closing over the path, so a save always writes whatever
 * is open at that moment.
 *
 * @returns {void}
 */
export function scheduleSave() {
  if (!state.chosenPath) return;
  clearTimeout(state.saveTimer ?? undefined);
  state.saveTimer = setTimeout(() => {
    // Re-checked here, not just above: 400 ms is long enough for either to
    // have been cleared, and writing a draft under the key "null" is worse
    // than skipping the save.
    if (state.chosenPath && state.cm) {
      const text = state.cm.getValue();
      saveDraft(state.chosenPath, text);
      void saveText(state.chosenPath, text);
    }
  }, 400);
}

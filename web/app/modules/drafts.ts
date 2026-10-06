import { store } from "../store.ts";
import { getEditor } from "./editor-api.ts";
import { saveText } from "./local-store.ts";

/** @returns the localStorage key holding that path's autosaved draft */
export function storageKey(path: string): string {
  return `wasm-scenario-builder:draft:${path}`;
}

/** @returns null when there is no draft, or storage is blocked */
export function loadDraft(path: string): string | null {
  try {
    return localStorage.getItem(storageKey(path));
  } catch {
    return null; // private mode, blocked storage: fall back to the pristine source
  }
}

export function deleteDraft(path: string): void {
  try {
    localStorage.removeItem(storageKey(path));
  } catch {
    /* blocked storage: nothing was stored */
  }
}

export function saveDraft(path: string, text: string): void {
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
 * @returns settles once the IndexedDB write has landed or failed
 */
export function flushDraft(path: string, text: string): Promise<void> {
  saveDraft(path, text);
  return saveText(path, text);
}

/**
 * Debounces an autosave 400 ms out. Deliberately re-reads state when it
 * fires rather than closing over the path, so a save always writes whatever
 * is open at that moment.
 */
export function scheduleSave(): void {
  if (!store.getState().chosenPath) return;
  clearTimeout(store.getState().saveTimer ?? undefined);
  const saveTimer = window.setTimeout(() => {
    // Re-checked here, not just above: 400 ms is long enough for either to
    // have been cleared, and writing a draft under the key "null" is worse
    // than skipping the save.
    const editor = getEditor();
    const { chosenPath } = store.getState();
    if (chosenPath && editor) {
      const text = editor.getText();
      saveDraft(chosenPath, text);
      void saveText(chosenPath, text);
    }
  }, 400);
  store.setState({ saveTimer });
}

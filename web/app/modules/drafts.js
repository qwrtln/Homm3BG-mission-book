import { state } from "./state.js";

export function storageKey(path) {
  return `wasm-scenario-builder:draft:${path}`;
}

export function loadDraft(path) {
  try {
    return localStorage.getItem(storageKey(path));
  } catch {
    return null; // private mode, blocked storage: fall back to the pristine source
  }
}

export function saveDraft(path, text) {
  try {
    localStorage.setItem(storageKey(path), text);
  } catch {
    // full or blocked storage: losing autosave is not fatal
  }
}

export function scheduleSave() {
  if (!state.chosenPath) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveDraft(state.chosenPath, state.cm.getValue()), 400);
}

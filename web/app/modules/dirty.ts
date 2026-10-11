import { hasUnsavedChanges, uploadsSignature } from "../../shared/unsaved.ts";
import { store } from "../store.ts";
import { getEditor } from "./editor-api.ts";

/**
 * Records what "nothing to save" looks like: the source as it was opened or
 * last saved, plus the uploads staged at that moment.
 *
 * @param text the clean source; the editor's own when omitted, null when there is no clean copy to compare with
 * @param uploads a signature taken earlier, for a save that took time
 */
export function markClean(text?: string | null, uploads?: string): void {
  const clean = {
    text: text === undefined ? (getEditor()?.getText() ?? "") : text,
    uploads: uploads ?? uploadsSignature(store.getState().uploadedFiles),
  };
  store.setState({ clean });
  refreshUnsavedNote();
}

/** @returns true when a scenario is open and differs from its last clean state */
export function isDirty(): boolean {
  const editor = getEditor();
  const { chosenPath, clean, uploadedFiles } = store.getState();
  if (!chosenPath || !editor || !clean) return false;
  return hasUnsavedChanges(clean, {
    text: editor.getText(),
    uploads: uploadsSignature(uploadedFiles),
  });
}

/**
 * Brings the store's `dirty` flag, which the header's "Unsaved" note renders
 * from, up to date. The editor's text is not in the store, so call it after
 * an edit, an upload change or a new clean state. The note itself also needs
 * a sign-in: signed out, there is no pull request to lose the changes to,
 * only the browser's own autosave (see leaveWorkspace's warning), so it would
 * just be noise.
 */
export function refreshUnsavedNote(): void {
  const dirty = isDirty();
  if (store.getState().dirty !== dirty) store.setState({ dirty });
}

/** Forgets the clean state, when no scenario is open any more. */
export function clearClean(): void {
  store.setState({ clean: null });
  refreshUnsavedNote();
}

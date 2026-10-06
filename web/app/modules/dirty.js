import { getToken } from "../../shared/github-auth.js";
import { hasUnsavedChanges, uploadsSignature } from "../../shared/unsaved.js";
import { el } from "./dom.js";
import { state } from "./state.js";

/**
 * Records what "nothing to save" looks like: the source as it was opened or
 * last saved, plus the uploads staged at that moment.
 *
 * @param {string | null} [text] the clean source; the editor's own when omitted, null when there is no clean copy to compare with
 * @param {string} [uploads] a signature taken earlier, for a save that took time
 * @returns {void}
 */
export function markClean(text, uploads) {
  state.clean = {
    text: text === undefined ? (state.cm ? state.cm.getValue() : "") : text,
    uploads: uploads ?? uploadsSignature(state.uploadedFiles),
  };
  refreshUnsavedNote();
}

/**
 * @returns {boolean} true when a scenario is open and differs from its last clean state
 */
export function isDirty() {
  if (!state.chosenPath || !state.cm || !state.clean) return false;
  return hasUnsavedChanges(state.clean, {
    text: state.cm.getValue(),
    uploads: uploadsSignature(state.uploadedFiles),
  });
}

/**
 * Shows or hides the header's "Unsaved" note. Signed out, there
 * is no pull request to lose the changes to, only the browser's own
 * autosave (see leaveWorkspace's warning), so the note would just be noise.
 *
 * @returns {void}
 */
export function refreshUnsavedNote() {
  el("unsaved-note").hidden = !isDirty() || !getToken();
}

/**
 * Forgets the clean state, when no scenario is open any more.
 *
 * @returns {void}
 */
export function clearClean() {
  state.clean = null;
  refreshUnsavedNote();
}

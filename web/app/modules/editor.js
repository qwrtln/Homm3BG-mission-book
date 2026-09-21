import { state } from "./state.js";
import { el } from "./dom.js";
import { scheduleSave, saveDraft } from "./drafts.js";
import { refreshUnsavedNote } from "./dirty.js";
import { initialTheme } from "./theme.js";

/**
 * Creates the CodeMirror instance over #editor and wires autosave to it.
 *
 * @returns {void}
 */
export function initEditor() {
  // Held in a local as well as on state: the handlers below close over this
  // instance directly, which is also what lets the checker see it is never
  // null inside them.
  const cm = CodeMirror.fromTextArea(el("editor"), {
    mode: "stex",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    theme: initialTheme() === "dark" ? "material-darker" : "default",
  });
  state.cm = cm;
  cm.on("change", () => {
    scheduleSave();
    refreshUnsavedNote();
  });
  cm.on("blur", () => {
    if (state.chosenPath) saveDraft(state.chosenPath, cm.getValue());
  });
}

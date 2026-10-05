import { refreshUnsavedNote } from "./dirty.ts";
import { el } from "./dom.js";
import { saveDraft, scheduleSave } from "./drafts.ts";
import { saveText } from "./local-store.ts";
import { refreshStaleStatus } from "./pdf-view.js";
import { state } from "./state.ts";
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
    theme: initialTheme() === "dark" ? "github-dark" : "github-light",
  });
  state.cm = cm;
  cm.on("change", () => {
    scheduleSave();
    refreshUnsavedNote();
    refreshStaleStatus();
  });
  cm.on("blur", () => {
    if (state.chosenPath) {
      const text = cm.getValue();
      saveDraft(state.chosenPath, text);
      void saveText(state.chosenPath, text);
    }
  });
}

import { state } from "./state.js";
import { el } from "./dom.js";
import { scheduleSave, saveDraft } from "./drafts.js";
import { initialTheme } from "./theme.js";

export function initEditor() {
  state.cm = CodeMirror.fromTextArea(el("editor"), {
    mode: "stex",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    theme: initialTheme() === "dark" ? "material-darker" : "default",
  });
  state.cm.on("change", () => {
    scheduleSave();
  });
  state.cm.on("blur", () => {
    if (state.chosenPath) saveDraft(state.chosenPath, state.cm.getValue());
  });
}

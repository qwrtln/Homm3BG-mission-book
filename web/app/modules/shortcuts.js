import { matchesKey, SHORTCUTS, shortcutKeys } from "../../shared/keymap.js";
import { runBuild } from "./build.js";
import { el, initBuildTitle, isMac } from "./dom.js";
import { requireEditor } from "./state.js";

/** KeyboardEvent.key values of the modifier keys themselves. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

/**
 * The extraKeys value for one "editor"-scope SHORTCUTS row, other than
 * leave-editor (wired separately below, through the Esc binding).
 *
 * @param {string} id a SHORTCUTS row id
 * @returns {string | ((cm: CodeMirrorEditor) => void)}
 */
function editorCommand(id) {
  if (id === "toggle-comment") return (cm) => cm.toggleComment();
  if (id === "indent") {
    return (cm) => cm.execCommand(cm.somethingSelected() ? "indentMore" : "insertSoftTab");
  }
  if (id === "outdent") return (cm) => cm.execCommand("indentLess");
  // find -> "find", replace -> "replace", delete-line -> "deleteLine": the
  // search and comment addons (and core) already register these command names.
  const row = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!row?.command) throw new Error(`Editor shortcut "${id}" names no command.`);
  return row.command;
}

/**
 * The static part of the extraKeys map: every "editor"-scope row for one
 * platform, minus leave-editor's sequence entries.
 *
 * @param {boolean} mac
 * @returns {Record<string, string | ((cm: CodeMirrorEditor) => void)>}
 */
function buildEditorKeys(mac) {
  /** @type {Record<string, string | ((cm: CodeMirrorEditor) => void)>} */
  const map = {};
  for (const row of SHORTCUTS) {
    if (row.scope !== "editor" || row.id === "leave-editor") continue;
    const handler = editorCommand(row.id);
    for (const key of shortcutKeys(row.id, mac)) map[key] = handler;
  }
  return map;
}

/**
 * Wires the editor-scope keys into CodeMirror's extraKeys: comment, find,
 * replace, delete line, indent/outdent, and the Esc-then-Tab escape out of
 * the keyboard trap.
 *
 * Esc itself is not a SHORTCUTS entry (leave-editor's keys are the two-key
 * sequences that follow it): it runs singleSelection and arms a one-shot
 * flag directly here. While armed, Tab and Shift-Tab resolve to `false`
 * through extraKeys' `call` hook instead of their usual command — CodeMirror's
 * documented way to leave a key to the browser without claiming it, since the
 * core keymap also binds Tab and would otherwise re-claim a `CodeMirror.Pass`
 * before it ever reached the browser. Any other key, and blur, clear the flag.
 *
 * @returns {void}
 */
function initEditorKeys() {
  const mac = isMac();
  const cm = requireEditor();
  const staticKeys = buildEditorKeys(mac);
  const leaveKeys = new Set([...shortcutKeys("indent", mac), ...shortcutKeys("outdent", mac)]);
  let escArmed = false;
  /** @type {CodeMirrorCallKeyMap} */
  const map = {
    /** @param {string} key */
    call(key) {
      if (key === "Esc") {
        /** @param {CodeMirrorEditor} cmInstance */
        return (cmInstance) => {
          cmInstance.execCommand("singleSelection");
          escArmed = true;
        };
      }
      if (escArmed && leaveKeys.has(key)) return false;
      return staticKeys[key];
    },
  };
  cm.setOption("extraKeys", map);
  cm.on("keydown", (_cm, event) => {
    // A modifier pressed on its own is the start of Shift-Tab, not another key.
    if (MODIFIER_KEYS.has(event.key)) return;
    for (const key of leaveKeys) if (matchesKey(event, key)) return;
    escArmed = false;
  });
  cm.on("blur", () => {
    escArmed = false;
  });
}

/**
 * Wires every keyboard shortcut: the document-wide listener for app-scope
 * rows (today, only "build"; "help" is wired elsewhere) and the CodeMirror
 * extraKeys for editor-scope rows.
 *
 * @returns {void}
 */
export function initShortcuts() {
  const mac = isMac();
  initBuildTitle(mac);
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (!shortcutKeys("build", mac).some((key) => matchesKey(event, key))) return;
    // Hidden workspace: the welcome screen. Let the browser keep Ctrl+S.
    if (el("workspace").hidden) return;
    event.preventDefault();
    if (document.querySelector("dialog:modal")) return;
    runBuild();
  });
  initEditorKeys();
}

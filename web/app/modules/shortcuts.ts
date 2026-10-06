import { deleteLine, indentLess, indentMore, simplifySelection, toggleComment } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { countColumn, EditorSelection, type Extension, Prec } from "@codemirror/state";
import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
import { matchesKey, SHORTCUTS, shortcutKeys, toEditorKey } from "../../shared/keymap.ts";
import { store } from "../store.ts";
import { runBuild } from "./build.ts";
import { initBuildTitle, isMac } from "./dom.ts";

/** KeyboardEvent.key values of the modifier keys themselves. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

type Command = (view: EditorView) => boolean;

/**
 * Tab with nothing selected: spaces up to the next tab stop, never a tab
 * character, which the repository's whitespace lint rejects.
 */
const insertSoftTab: Command = (view) => {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      const column = countColumn(line.text, state.tabSize, range.from - line.from);
      const insert = " ".repeat(state.tabSize - (column % state.tabSize));
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    }),
    { scrollIntoView: true, userEvent: "input" },
  );
  return true;
};

/** Opens the find bar with the cursor in its replace field. */
const openReplace: Command = (view) => {
  openSearchPanel(view);
  view.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]")?.focus();
  return true;
};

/**
 * The command for one "editor"-scope SHORTCUTS row, other than leave-editor
 * (wired below, through the Escape binding).
 *
 * @param id a SHORTCUTS row id
 */
function editorCommand(id: string): Command {
  switch (id) {
    case "toggle-comment":
      return toggleComment;
    case "find":
      return openSearchPanel;
    case "replace":
      return openReplace;
    case "delete-line":
      return deleteLine;
    case "indent":
      return (view) =>
        view.state.selection.ranges.some((range) => !range.empty) ? indentMore(view) : insertSoftTab(view);
    case "outdent":
      return indentLess;
    default:
      throw new Error(`Editor shortcut "${id}" names no command.`);
  }
}

/**
 * The editor-scope keys, as CodeMirror extensions: comment, find, replace,
 * delete line, indent/outdent, and the Escape-then-Tab escape out of the
 * keyboard trap.
 *
 * Escape itself is not a SHORTCUTS entry (leave-editor's keys are the two-key
 * sequences that follow it): it collapses the selection and arms a one-shot
 * flag here. While armed, Tab and Shift-Tab decline, so the browser moves the
 * focus on instead of indenting. Any other key, and blur, clear the flag.
 *
 * @param mac whether to bind the macOS alternatives
 */
export function editorKeys(mac: boolean): Extension {
  const leaveKeys = new Set([...shortcutKeys("indent", mac), ...shortcutKeys("outdent", mac)]);
  let armed = false;

  const bindings: KeyBinding[] = [
    {
      key: "Escape",
      run: (view) => {
        simplifySelection(view);
        armed = true;
        return true;
      },
    },
  ];
  for (const row of SHORTCUTS) {
    if (row.scope !== "editor" || row.id === "leave-editor") continue;
    const command = editorCommand(row.id);
    const leaves = row.id === "indent" || row.id === "outdent";
    const run: Command = (view) => {
      if (leaves && armed) {
        armed = false;
        return false;
      }
      return command(view);
    };
    for (const key of shortcutKeys(row.id, mac)) bindings.push({ key: toEditorKey(key), run });
  }

  return [
    Prec.high(
      EditorView.domEventHandlers({
        keydown(event) {
          // A modifier pressed on its own is the start of Shift-Tab, not another key.
          if (MODIFIER_KEYS.has(event.key) || event.key === "Escape") return false;
          for (const key of leaveKeys) if (matchesKey(event, key)) return false;
          armed = false;
          return false;
        },
        blur() {
          armed = false;
          return false;
        },
      }),
    ),
    keymap.of(bindings),
  ];
}

/**
 * Wires the document-wide keyboard shortcuts: the app-scope rows (today, only
 * "build"; "help" is wired elsewhere). The editor-scope rows are the editor's
 * own, from editorKeys().
 */
export function initShortcuts(): void {
  const mac = isMac();
  initBuildTitle(mac);
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (!shortcutKeys("build", mac).some((key) => matchesKey(event, key))) return;
    // Hidden workspace: the welcome screen. Let the browser keep Ctrl+S.
    if (!store.getState().workspaceShown) return;
    event.preventDefault();
    if (document.querySelector("dialog:modal")) return;
    runBuild();
  });
}

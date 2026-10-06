import { history, historyKeymap, standardKeymap, undo } from "@codemirror/commands";
import { indentUnit, StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { search } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef } from "react";
import { refreshUnsavedNote } from "../../modules/dirty.ts";
import { isMac } from "../../modules/dom.ts";
import { saveDraft, scheduleSave } from "../../modules/drafts.ts";
import { type EditorProbe, setEditor } from "../../modules/editor-api.ts";
import { saveText } from "../../modules/local-store.ts";
import { editorKeys } from "../../modules/shortcuts.ts";
import { store, useAppStore } from "../../store.ts";
import { completions } from "./completions.ts";
import { errorLineMark, markedLines, markLine } from "./error-line.ts";
import { editorTheme } from "./theme.ts";

const INDENT = "  ";

/** Swaps the editor's look when the app's theme changes. */
const themeSlot = new Compartment();

/**
 * Autosaves and keeps the unsaved note and the store's `editorText` current,
 * as the text changes: the stale-PDF status derives from it (`showsStale` in modules/status.ts).
 */
const onChange = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  scheduleSave();
  refreshUnsavedNote();
  store.setState((state) => ({ editorText: update.state.doc.toString(), editCount: state.editCount + 1 }));
});

/** Leaving the editor writes the draft at once, instead of waiting for the autosave. */
const saveOnBlur = EditorView.domEventHandlers({
  blur(_event, view) {
    const { chosenPath } = store.getState();
    if (chosenPath) {
      const text = view.state.doc.toString();
      saveDraft(chosenPath, text);
      void saveText(chosenPath, text);
    }
    return false;
  },
});

/** @returns the editor's whole extension list, for the theme named */
function extensions(dark: boolean) {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(INDENT.length),
    indentUnit.of(INDENT),
    StreamLanguage.define(stex),
    search({ top: true }),
    completions(),
    editorKeys(isMac()),
    keymap.of([...standardKeymap, ...historyKeymap]),
    errorLineMark(),
    themeSlot.of(editorTheme(dark)),
    EditorView.contentAttributes.of({ spellcheck: "false", "aria-label": "Scenario source" }),
    onChange,
    saveOnBlur,
  ];
}

/** What the app and tier 2 may ask of a view; see modules/editor-api.ts. */
function probeOf(view: EditorView): EditorProbe {
  const positionOf = (line: number, ch: number): number => view.state.doc.line(line + 1).from + ch;
  const cursorOf = (offset: number): { line: number; ch: number } => {
    const line = view.state.doc.lineAt(offset);
    return { line: line.number - 1, ch: offset - line.from };
  };
  return {
    getText: () => view.state.doc.toString(),
    setText(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        scrollIntoView: true,
        // The old scenario's text must not come back on undo.
        annotations: Transaction.addToHistory.of(false),
      });
    },
    focus: () => view.focus(),
    revealLine(line) {
      const at = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines)).from;
      view.focus();
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: "nearest", yMargin: 80 }),
      });
    },
    replaceRange: (from, to, insert) => view.dispatch({ changes: { from, to, insert }, userEvent: "input.replace" }),
    markErrorLine: (line) => markLine(view, line),

    hasFocus: () => view.hasFocus,
    lineCount: () => view.state.doc.lines,
    getLine: (line) => view.state.doc.line(line + 1).text,
    getCursor: () => cursorOf(view.state.selection.main.head),
    setSelection(anchor, head = anchor) {
      view.dispatch({
        selection: EditorSelection.single(positionOf(anchor.line, anchor.ch), positionOf(head.line, head.ch)),
        scrollIntoView: true,
      });
    },
    getSelection: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
    markedLines: () => markedLines(view),
    undo: () => void undo(view),
  };
}

/**
 * The source editor: one CodeMirror 6 view over the scenario's LaTeX, made
 * when the component mounts and held in a ref, so a re-render never touches
 * it. The rest of the app reaches it through modules/editor-api.ts.
 */
export function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const dark = useAppStore((s) => s.theme) === "dark";

  useLayoutEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({ extensions: extensions(store.getState().theme === "dark") }),
    });
    view.current = created;
    setEditor(probeOf(created));
    return () => {
      setEditor(null);
      created.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: themeSlot.reconfigure(editorTheme(dark)) });
  }, [dark]);

  return <div ref={host} className="editor-host" />;
}

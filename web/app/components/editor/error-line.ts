import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { EditorError } from "../../modules/editor-api.ts";

/** The class of the line a failed build points at; theme.ts colors it. */
export const ERROR_LINE_CLASS = "build-error-line";

const setErrorLine = StateEffect.define<number | null>();

const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    // Mapped through the edits, so the mark stays on its line.
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLine)) continue;
      next =
        effect.value === null
          ? Decoration.none
          : Decoration.set([Decoration.line({ class: ERROR_LINE_CLASS }).range(effect.value)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** @returns the state field holding the failed build's line mark, and the lint gutter its diagnostic shows in */
export function errorLineMark(): Extension {
  return [errorLine, lintGutter()];
}

/**
 * Marks the failed build's line and sets one error diagnostic over its
 * columns, or clears both. The diagnostic, like the line mark, follows its
 * text through edits.
 *
 * @param error the spot, clamped to the text; null clears
 */
export function markLine(view: EditorView, error: EditorError | null): void {
  const { state } = view;
  if (error === null) {
    view.dispatch(setDiagnostics(state, []), { effects: setErrorLine.of(null) });
    return;
  }
  const line = state.doc.line(Math.min(Math.max(error.line, 1), state.doc.lines));
  const column = (at: number): number => line.from + Math.min(Math.max(at, 0), line.length);
  const from = column(error.from);
  const to = Math.max(from, column(error.to));
  view.dispatch(setDiagnostics(state, [{ from, to, severity: "error", message: error.message }]), {
    effects: setErrorLine.of(line.from),
  });
}

/** @returns the 1-based lines carrying the mark */
export function markedLines(view: EditorView): number[] {
  const lines: number[] = [];
  view.state.field(errorLine).between(0, view.state.doc.length, (from) => {
    lines.push(view.state.doc.lineAt(from).number);
  });
  return lines;
}

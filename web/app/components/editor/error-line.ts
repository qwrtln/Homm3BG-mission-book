import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

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

/** @returns the state field holding the failed build's line mark */
export function errorLineMark(): Extension {
  return errorLine;
}

/**
 * Marks a line as the failed build's, or clears the mark.
 *
 * @param line 1-based, as TeX counts; null clears
 */
export function markLine(view: EditorView, line: number | null): void {
  const at = line === null ? null : view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines)).from;
  view.dispatch({ effects: setErrorLine.of(at) });
}

/** @returns the 1-based lines carrying the mark */
export function markedLines(view: EditorView): number[] {
  const lines: number[] = [];
  view.state.field(errorLine).between(0, view.state.doc.length, (from) => {
    lines.push(view.state.doc.lineAt(from).number);
  });
  return lines;
}

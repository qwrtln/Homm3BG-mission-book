import { type Extension, type Range, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutterLineClass } from "@codemirror/view";

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

/** The gutter's own class on the marked line; theme.ts gives it a bar and a bold number. */
const ERROR_GUTTER_CLASS = "build-error-gutter";

const errorGutter = new (class extends GutterMarker {
  elementClass = ERROR_GUTTER_CLASS;
})();

/** @returns the state field holding the failed build's line mark, and the gutter cue on that line */
export function errorLineMark(): Extension {
  return [
    errorLine,
    gutterLineClass.compute([errorLine], (state) => {
      const marks: Range<GutterMarker>[] = [];
      state.field(errorLine).between(0, state.doc.length, (from) => {
        marks.push(errorGutter.range(from));
      });
      return RangeSet.of(marks);
    }),
  ];
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

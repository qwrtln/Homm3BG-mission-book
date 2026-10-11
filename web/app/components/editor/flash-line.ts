import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/** The class of the line a jump from the PDF just landed on; theme.ts colors it. */
export const FLASH_LINE_CLASS = "jump-flash-line";

/** How long a flash stays, in ms. Matches the fade in styles/app.css. */
const FLASH_MS = 1800;

const setFlash = StateEffect.define<number | null>();

const flash = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    // Mapped through the edits, so the flash stays on its line.
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setFlash)) continue;
      next =
        effect.value === null
          ? Decoration.none
          : Decoration.set([Decoration.line({ class: FLASH_LINE_CLASS }).range(effect.value)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** @returns the state field holding the flashed line */
export function flashLineMark(): Extension {
  return flash;
}

const timers = new WeakMap<EditorView, number>();

/**
 * Highlights a line for a moment. A new flash replaces the one showing, and
 * the highlight removes itself.
 *
 * @param line 1-based; clamped to the text
 */
export function flashLine(view: EditorView, line: number): void {
  const at = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines)).from;
  clearTimeout(timers.get(view));
  view.dispatch({ effects: setFlash.of(at) });
  timers.set(
    view,
    window.setTimeout(() => {
      // The editor may have been torn down meanwhile.
      if (view.dom.isConnected) view.dispatch({ effects: setFlash.of(null) });
    }, FLASH_MS),
  );
}

/** @returns the 1-based lines carrying the flash */
export function flashedLines(view: EditorView): number[] {
  const lines: number[] = [];
  view.state.field(flash).between(0, view.state.doc.length, (from) => {
    lines.push(view.state.doc.lineAt(from).number);
  });
  return lines;
}

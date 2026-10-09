/**
 * What the rest of the app may ask of the source editor. The editor itself is
 * a CodeMirror 6 view, created once by components/editor/Editor.tsx; nothing
 * outside that folder touches it. Positions are 1-based lines, as TeX counts,
 * and 0-based character offsets into the whole text.
 */
export interface EditorApi {
  getText(): string;
  /** Replaces the whole text. The cursor goes to the start, and undo cannot bring the old text back. */
  setText(text: string): void;
  focus(): void;
  /** Puts the cursor at the start of a line, focuses the editor and scrolls the line into view. */
  revealLine(line: number): void;
  /** Replaces the text between two offsets, as an edit the contributor can undo. */
  replaceRange(from: number, to: number, insert: string): void;
  /** Marks a line as the failed build's, or clears the mark with null. The mark follows its line through edits. */
  markErrorLine(line: number | null): void;
  /** Highlights a line for a moment, clamped to the text. A new flash replaces the one showing; the failed build's mark is untouched. */
  flashLine(line: number): void;
}

/** The editor as tier 2 reads it, on `window.__editor`. Lines and columns are 0-based here. */
export interface EditorProbe extends EditorApi {
  hasFocus(): boolean;
  lineCount(): number;
  getLine(line: number): string;
  getCursor(): { line: number; ch: number };
  /** Places the cursor, or selects from the anchor to the head. */
  setSelection(anchor: { line: number; ch: number }, head?: { line: number; ch: number }): void;
  getSelection(): string;
  /** The 1-based lines carrying the failed build's mark. */
  markedLines(): number[];
  /** The 1-based lines carrying the jump flash. */
  flashedLines(): number[];
  undo(): void;
}

let current: EditorProbe | null = null;

/** Registers the editor once it exists, or clears it on teardown. Also hangs it on `window.__editor` for tier 2. */
export function setEditor(editor: EditorProbe | null): void {
  current = editor;
  window.__editor = editor ?? undefined;
}

/** @returns the editor, or null before it is mounted */
export function getEditor(): EditorApi | null {
  return current;
}

/**
 * The editor, for the paths that cannot run before it is mounted. Throws
 * rather than returning null, so no caller has to assert a shape the type
 * system cannot see.
 */
export function requireEditor(): EditorApi {
  if (current === null) throw new Error("The editor is not ready yet.");
  return current;
}

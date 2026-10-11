// Tier 2 helpers for the source editor. The page hangs the editor on
// `window.__editor` (app/modules/editor-api.ts), so no test reaches into
// the editor library's own DOM or instance. Lines and columns are 0-based.

import type { Locator, Page } from "@playwright/test";

export interface Cursor {
  line: number;
  ch: number;
}

/** The editor's content element: what a test clicks or types into. */
export function editorBox(page: Page): Locator {
  return page.locator(".cm-content");
}

/** The suggestion list under the cursor; absent from the page while closed. */
export function completionList(page: Page): Locator {
  return page.locator(".cm-tooltip-autocomplete");
}

/** The find bar. */
export function searchPanel(page: Page): Locator {
  return page.locator(".cm-search");
}

/**
 * The editor's whole text. The editor renders only the lines in view, so the
 * visible text is not the document.
 */
export function editorText(page: Page): Promise<string> {
  return page.evaluate(() => window.__editor?.getText() ?? "");
}

/** Replaces the editor's whole text. The cursor goes to the start. */
export function setEditorText(page: Page, text: string): Promise<void> {
  return page.evaluate((text) => window.__editor?.setText(text), text);
}

export function focusEditor(page: Page): Promise<void> {
  return page.evaluate(() => window.__editor?.focus());
}

export function editorHasFocus(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__editor?.hasFocus() ?? false);
}

export function editorLineCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__editor?.lineCount() ?? 0);
}

export function editorLine(page: Page, line: number): Promise<string> {
  return page.evaluate((line) => window.__editor?.getLine(line) ?? "", line);
}

export function editorCursor(page: Page): Promise<Cursor> {
  return page.evaluate(() => window.__editor?.getCursor() ?? { line: 0, ch: 0 });
}

/**
 * Puts the cursor in place, or selects from one place to another.
 *
 * @param head defaults to the anchor
 */
export function setEditorSelection(page: Page, anchor: Cursor, head?: Cursor): Promise<void> {
  return page.evaluate(([anchor, head]) => window.__editor?.setSelection(anchor, head), [anchor, head] as const);
}

/** @returns the selected text */
export function editorSelection(page: Page): Promise<string> {
  return page.evaluate(() => window.__editor?.getSelection() ?? "");
}

/** Inserts text at an offset, as an edit the contributor can undo. */
export function insertInEditor(page: Page, at: number, text: string): Promise<void> {
  return page.evaluate(([at, text]) => window.__editor?.replaceRange(at, at, text), [at, text] as const);
}

/** Adds text to the end of a line, as an edit the contributor can undo. */
export function appendToEditorLine(page: Page, line: number, text: string): Promise<void> {
  return page.evaluate(
    ([line, text]) => {
      const editor = window.__editor;
      if (!editor) return;
      const end = editor
        .getText()
        .split("\n")
        .slice(0, line + 1)
        .join("\n").length;
      editor.replaceRange(end, end, text);
    },
    [line, text] as const,
  );
}

export function undoInEditor(page: Page): Promise<void> {
  return page.evaluate(() => window.__editor?.undo());
}

/** @returns the 1-based lines carrying the flash of a jump from the PDF */
export function flashedLines(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__editor?.flashedLines() ?? []);
}

/** @returns the 1-based lines carrying the failed build's mark */
export function markedLines(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__editor?.markedLines() ?? []);
}

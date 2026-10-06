// Tier 2 helpers for the source editor. The page hangs the editor on
// `window.__editor` (app/modules/editor-api.ts), so no test reaches into
// the editor library's own DOM or instance. Lines and columns are 0-based.

/** @typedef {import("@playwright/test").Page} Page */
/** @typedef {{ line: number, ch: number }} Cursor */

/**
 * The editor's content element: what a test clicks or types into.
 *
 * @param {Page} page
 * @returns {import("@playwright/test").Locator}
 */
export function editorBox(page) {
  return page.locator(".cm-content");
}

/**
 * The suggestion list under the cursor; absent from the page while closed.
 *
 * @param {Page} page
 * @returns {import("@playwright/test").Locator}
 */
export function completionList(page) {
  return page.locator(".cm-tooltip-autocomplete");
}

/**
 * The find bar.
 *
 * @param {Page} page
 * @returns {import("@playwright/test").Locator}
 */
export function searchPanel(page) {
  return page.locator(".cm-search");
}

/**
 * The editor's whole text. The editor renders only the lines in view, so the
 * visible text is not the document.
 *
 * @param {Page} page
 * @returns {Promise<string>}
 */
export function editorText(page) {
  return page.evaluate(() => window.__editor?.getText() ?? "");
}

/**
 * Replaces the editor's whole text. The cursor goes to the start.
 *
 * @param {Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
export function setEditorText(page, text) {
  return page.evaluate((text) => window.__editor?.setText(text), text);
}

/**
 * @param {Page} page
 * @returns {Promise<void>}
 */
export function focusEditor(page) {
  return page.evaluate(() => window.__editor?.focus());
}

/**
 * @param {Page} page
 * @returns {Promise<boolean>}
 */
export function editorHasFocus(page) {
  return page.evaluate(() => window.__editor?.hasFocus() ?? false);
}

/**
 * @param {Page} page
 * @returns {Promise<number>}
 */
export function editorLineCount(page) {
  return page.evaluate(() => window.__editor?.lineCount() ?? 0);
}

/**
 * @param {Page} page
 * @param {number} line
 * @returns {Promise<string>}
 */
export function editorLine(page, line) {
  return page.evaluate((line) => window.__editor?.getLine(line) ?? "", line);
}

/**
 * @param {Page} page
 * @returns {Promise<Cursor>}
 */
export function editorCursor(page) {
  return page.evaluate(() => window.__editor?.getCursor() ?? { line: 0, ch: 0 });
}

/**
 * Puts the cursor in place, or selects from one place to another.
 *
 * @param {Page} page
 * @param {Cursor} anchor
 * @param {Cursor} [head] defaults to the anchor
 * @returns {Promise<void>}
 */
export function setEditorSelection(page, anchor, head) {
  return page.evaluate(([anchor, head]) => window.__editor?.setSelection(anchor, head), [anchor, head]);
}

/**
 * @param {Page} page
 * @returns {Promise<string>} the selected text
 */
export function editorSelection(page) {
  return page.evaluate(() => window.__editor?.getSelection() ?? "");
}

/**
 * Inserts text at an offset, as an edit the contributor can undo.
 *
 * @param {Page} page
 * @param {number} at
 * @param {string} text
 * @returns {Promise<void>}
 */
export function insertInEditor(page, at, text) {
  return page.evaluate(([at, text]) => window.__editor?.replaceRange(at, at, text), /** @type {const} */ ([at, text]));
}

/**
 * Adds text to the end of a line, as an edit the contributor can undo.
 *
 * @param {Page} page
 * @param {number} line
 * @param {string} text
 * @returns {Promise<void>}
 */
export function appendToEditorLine(page, line, text) {
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
    /** @type {const} */ ([line, text]),
  );
}

/**
 * @param {Page} page
 * @returns {Promise<void>}
 */
export function undoInEditor(page) {
  return page.evaluate(() => window.__editor?.undo());
}

/**
 * @param {Page} page
 * @returns {Promise<number[]>} the 1-based lines carrying the failed build's mark
 */
export function markedLines(page) {
  return page.evaluate(() => window.__editor?.markedLines() ?? []);
}

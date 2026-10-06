// Tier 2. The editor-scope shortcuts bound through CodeMirror's extraKeys:
// toggle comment, find, replace, delete line, indent/outdent with spaces
// only, and the Esc-then-Tab escape out of the keyboard trap.

import { expect, READY_STATUS, test } from "./fixtures.mjs";

const SCENARIO_NAME = "editor keys probe";

/**
 * Starts a blank Clash scenario, landing in the workspace.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openWorkspace(page) {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * Replaces the editor's whole source and focuses it. The cursor lands where
 * CodeMirror's own setValue leaves it; callers that care set it explicitly.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function setEditorValue(page, text) {
  await page.evaluate((text) => {
    const cm = document.querySelector(".CodeMirror").CodeMirror;
    cm.setValue(text);
    cm.focus();
  }, text);
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>}
 */
async function editorValue(page) {
  return page.evaluate(() => document.querySelector(".CodeMirror").CodeMirror.getValue());
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} line
 * @returns {Promise<string>}
 */
async function editorLine(page, line) {
  return page.evaluate((line) => document.querySelector(".CodeMirror").CodeMirror.getLine(line), line);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} line
 * @param {number} ch
 * @returns {Promise<void>}
 */
async function setCursor(page, line, ch) {
  await page.evaluate(({ line, ch }) => document.querySelector(".CodeMirror").CodeMirror.setCursor({ line, ch }), {
    line,
    ch,
  });
}

/**
 * Selects a whole-line range, start of `from` to end of `to`.
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} from
 * @param {number} to
 * @returns {Promise<void>}
 */
async function selectLines(page, from, to) {
  await page.evaluate(
    ({ from, to }) => {
      const cm = document.querySelector(".CodeMirror").CodeMirror;
      cm.setSelection({ line: from, ch: 0 }, { line: to, ch: cm.getLine(to).length });
    },
    { from, to },
  );
}

test("Ctrl+/ toggles a % comment on the selected lines, round trip", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const original = "one\ntwo\nthree";
  await setEditorValue(page, original);
  await selectLines(page, 0, 2);

  await page.keyboard.press("Control+/");
  expect(await editorLine(page, 0)).toBe("% one");
  expect(await editorLine(page, 1)).toBe("% two");
  expect(await editorLine(page, 2)).toBe("% three");

  await page.keyboard.press("Control+/");
  expect(await editorValue(page)).toBe(original);
});

test("Ctrl+F opens the search dialog and finds a line below the viewport", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const targetLine = 150;
  const lines = Array.from({ length: 300 }, (_, i) => (i === targetLine ? "NEEDLE_TARGET" : `filler line ${i}`));
  await setEditorValue(page, lines.join("\n"));
  await setCursor(page, 0, 0);

  await page.keyboard.press("Control+F");
  const dialog = page.locator(".CodeMirror-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("NEEDLE_TARGET");
  await dialog.locator("input").press("Enter");

  const cursor = await page.evaluate(() => document.querySelector(".CodeMirror").CodeMirror.getCursor());
  expect(cursor.line).toBe(targetLine);
  const selected = await page.evaluate(() => document.querySelector(".CodeMirror").CodeMirror.getSelection());
  expect(selected).toBe("NEEDLE_TARGET");
});

test("Ctrl+H opens the replace dialog and replacing a term changes the source", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "foo bar");
  await setCursor(page, 0, 0);

  await page.keyboard.press("Control+H");
  const searchDialog = page.locator(".CodeMirror-dialog");
  await expect(searchDialog).toBeVisible();
  await searchDialog.locator("input").fill("foo");
  await searchDialog.locator("input").press("Enter");

  const withDialog = page.locator(".CodeMirror-dialog");
  await expect(withDialog).toBeVisible();
  await withDialog.locator("input").fill("qux");
  await withDialog.locator("input").press("Enter");

  await page.locator(".CodeMirror-dialog").getByRole("button", { name: "All" }).click();
  expect(await editorValue(page)).toBe("qux bar");
});

test("Ctrl+Shift+K removes the cursor's line", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "one\ntwo\nthree");
  await setCursor(page, 1, 0);

  await page.keyboard.press("Control+Shift+K");
  expect(await editorValue(page)).toBe("one\nthree");
});

test("Tab with no selection inserts two spaces, not a tab character", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "");
  await setCursor(page, 0, 0);

  await page.keyboard.press("Tab");
  expect(await editorLine(page, 0)).toBe("  ");
  expect(await editorValue(page)).not.toContain("\t");
});

test("Tab over a selection indents each line; Shift+Tab outdents it back", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "a\nb\nc");
  await selectLines(page, 0, 2);

  await page.keyboard.press("Tab");
  expect(await editorValue(page)).toBe("  a\n  b\n  c");

  await selectLines(page, 0, 2);
  await page.keyboard.press("Shift+Tab");
  expect(await editorValue(page)).toBe("a\nb\nc");
});

test("Esc then Tab leaves the editor and does not change the source", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const original = "unchanged";
  await setEditorValue(page, original);
  await setCursor(page, 0, original.length);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");

  await expect(page.locator(".CodeMirror textarea")).not.toBeFocused();
  expect(await editorValue(page)).toBe(original);
});

test("Esc then Shift+Tab leaves the editor and does not outdent", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  // Indented, so an outdent would show in the source.
  const original = "  indented";
  await setEditorValue(page, original);
  await setCursor(page, 0, original.length);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Tab");

  await expect(page.locator(".CodeMirror textarea")).not.toBeFocused();
  expect(await editorValue(page)).toBe(original);
});

test("Esc, then a letter, then Tab indents as usual", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "x");
  await setCursor(page, 0, 1);

  await page.keyboard.press("Escape");
  await page.keyboard.type("y");
  await page.keyboard.press("Tab");

  expect(await editorLine(page, 0)).toBe("xy  ");
  await expect(page.locator(".CodeMirror textarea")).toBeFocused();
});

test("with the completion list open, Tab still picks the completion", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "Gain ");
  await setCursor(page, 0, 5);

  const list = page.locator("#editor-autocomplete");
  const options = list.getByRole("option");
  await page.keyboard.type("\\svg{go");
  await expect(options.first()).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(list).toBeHidden();
  expect(await editorLine(page, 0)).toBe("Gain \\svg{gold}");
});

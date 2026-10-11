// Tier 2. The editor-scope shortcuts bound in the editor's keymap: toggle
// comment, find, replace, delete line, indent/outdent with spaces only, and
// the Esc-then-Tab escape out of the keyboard trap.

import type { Page } from "@playwright/test";
import {
  completionList,
  editorCursor,
  editorHasFocus,
  editorLine,
  editorSelection,
  editorText,
  focusEditor,
  searchPanel,
  setEditorSelection,
  setEditorText,
} from "../helpers/editor.ts";
import { expect, READY_STATUS, test } from "./fixtures.ts";

const SCENARIO_NAME = "editor keys probe";

/**
 * Starts a blank Clash scenario, landing in the workspace.
 *
 */
async function openWorkspace(page: Page): Promise<void> {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * Replaces the editor's whole source and focuses it. The cursor lands at the
 * start; callers that care set it explicitly.
 *
 */
async function setEditorValue(page: Page, text: string): Promise<void> {
  await setEditorText(page, text);
  await focusEditor(page);
}

async function setCursor(page: Page, line: number, ch: number): Promise<void> {
  await setEditorSelection(page, { line, ch });
}

/**
 * Selects a whole-line range, start of `from` to end of `to`.
 *
 * @param from first line
 * @param to last line
 */
async function selectLines(page: Page, from: number, to: number): Promise<void> {
  const end = (await editorLine(page, to)).length;
  await setEditorSelection(page, { line: from, ch: 0 }, { line: to, ch: end });
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
  expect(await editorText(page)).toBe(original);
});

test("Ctrl+F opens the search dialog and finds a line below the viewport", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const targetLine = 150;
  const lines = Array.from({ length: 300 }, (_, i) => (i === targetLine ? "NEEDLE_TARGET" : `filler line ${i}`));
  await setEditorValue(page, lines.join("\n"));
  await setCursor(page, 0, 0);

  await page.keyboard.press("Control+F");
  const panel = searchPanel(page);
  await expect(panel).toBeVisible();
  // Typed, not filled: the find bar reads its field on key-up.
  await panel.locator("input[name=search]").pressSequentially("NEEDLE_TARGET");
  await panel.locator("input[name=search]").press("Enter");

  expect((await editorCursor(page)).line).toBe(targetLine);
  expect(await editorSelection(page)).toBe("NEEDLE_TARGET");
});

test("Ctrl+H opens the replace dialog and replacing a term changes the source", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "foo bar");
  await setCursor(page, 0, 0);

  await page.keyboard.press("Control+H");
  const panel = searchPanel(page);
  await expect(panel).toBeVisible();
  // The cursor starts in the replace field.
  await expect(panel.locator("input[name=replace]")).toBeFocused();
  await panel.locator("input[name=search]").fill("foo");
  await panel.locator("input[name=replace]").fill("qux");

  await panel.getByRole("button", { name: "replace all" }).click();
  expect(await editorText(page)).toBe("qux bar");
});

test("Ctrl+Shift+K removes the cursor's line", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "one\ntwo\nthree");
  await setCursor(page, 1, 0);

  await page.keyboard.press("Control+Shift+K");
  expect(await editorText(page)).toBe("one\nthree");
});

test("Tab with no selection inserts two spaces, not a tab character", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "");
  await setCursor(page, 0, 0);

  await page.keyboard.press("Tab");
  expect(await editorLine(page, 0)).toBe("  ");
  expect(await editorText(page)).not.toContain("\t");
});

test("Tab over a selection indents each line; Shift+Tab outdents it back", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "a\nb\nc");
  await selectLines(page, 0, 2);

  await page.keyboard.press("Tab");
  expect(await editorText(page)).toBe("  a\n  b\n  c");

  await selectLines(page, 0, 2);
  await page.keyboard.press("Shift+Tab");
  expect(await editorText(page)).toBe("a\nb\nc");
});

test("Esc then Tab leaves the editor and does not change the source", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const original = "unchanged";
  await setEditorValue(page, original);
  await setCursor(page, 0, original.length);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");

  await expect.poll(() => editorHasFocus(page)).toBe(false);
  expect(await editorText(page)).toBe(original);
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

  await expect.poll(() => editorHasFocus(page)).toBe(false);
  expect(await editorText(page)).toBe(original);
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
  await expect.poll(() => editorHasFocus(page)).toBe(true);
});

test("with the completion list open, Tab still picks the completion", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await setEditorValue(page, "Gain ");
  await setCursor(page, 0, 5);

  const list = completionList(page);
  const options = list.getByRole("option");
  await page.keyboard.type("\\svg{go");
  await expect(options.first()).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(list).toBeHidden();
  expect(await editorLine(page, 0)).toBe("Gain \\svg{gold}");
});

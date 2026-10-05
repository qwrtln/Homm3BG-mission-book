// Tier 2. The Help dialog: the menu item and F1 both open it, listing every
// SHORTCUTS row from web/shared/keymap.ts with its Linux key labels, and
// closing it never closes a dialog underneath it.

import { keyLabel, SHORTCUTS } from "../../shared/keymap.ts";
import { chooseFromMenu, expect, READY_STATUS, test } from "./fixtures.mjs";

const SCENARIO_NAME = "help probe";

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
 * @param {import("@playwright/test").Page} page
 * @returns {import("@playwright/test").Locator} the Help dialog
 */
function helpDialog(page) {
  return page.getByRole("dialog", { name: "Help" });
}

test("Help opens from the menu and closing returns focus to the menu toggle", async ({ app }) => {
  const { page, errors } = app;
  await chooseFromMenu(page, "help-open");
  const dialog = helpDialog(page);
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#header-menu-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("F1 opens Help from the welcome screen", async ({ app }) => {
  const { page, errors } = app;
  await page.keyboard.press("F1");
  await expect(helpDialog(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("F1 opens Help from inside CodeMirror", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  await page.locator(".CodeMirror").click();

  await page.keyboard.press("F1");
  await expect(helpDialog(page)).toBeVisible();
});

test("F1 opens Help over an open About dialog, and closing Help leaves About open", async ({ app }) => {
  const { page } = app;
  await chooseFromMenu(page, "about-open");
  const about = page.getByRole("dialog", { name: "About the scenario builder" });
  await expect(about).toBeVisible();

  await page.keyboard.press("F1");
  const help = helpDialog(page);
  await expect(help).toBeVisible();

  await help.getByRole("button", { name: "Close" }).click();
  await expect(help).toBeHidden();
  await expect(about).toBeVisible();
});

test("the shortcuts table matches SHORTCUTS, in order, with Linux labels", async ({ app }) => {
  const { page } = app;
  await chooseFromMenu(page, "help-open");
  const dialog = helpDialog(page);
  await expect(dialog).toBeVisible();

  const rows = dialog.locator("tbody#help-shortcuts tr");
  await expect(rows).toHaveCount(SHORTCUTS.length);

  const ids = await rows.evaluateAll((trs) => trs.map((tr) => tr.dataset.shortcut));
  expect(ids).toEqual(SHORTCUTS.map((row) => row.id));

  for (const row of SHORTCUTS) {
    const tr = dialog.locator(`tr[data-shortcut="${row.id}"]`);
    const expectedLabels = row.keys.other.map((key) => keyLabel(key, false));
    const labels = await tr.locator("kbd").evaluateAll((kbds) => kbds.map((kbd) => kbd.textContent));
    expect(labels).toEqual(expectedLabels);
  }
});

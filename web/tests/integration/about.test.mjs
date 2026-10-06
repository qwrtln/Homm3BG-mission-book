// Tier 2. The overflow menu's About item: it opens a dialog naming the app's
// license and linking its source code, which AGPL-3.0 section 13 requires,
// and each license row loads its text from the file shipped with the code.

import { expect, test } from "./fixtures.mjs";

/** Each license row, by name, and a line its license text must contain. */
const LICENSES = {
  "Scenario builder": "GNU AFFERO GENERAL PUBLIC LICENSE",
  "@codemirror/autocomplete": "Permission is hereby granted",
  "@codemirror/commands": "Permission is hereby granted",
  "@codemirror/language": "Permission is hereby granted",
  "@codemirror/legacy-modes": "Permission is hereby granted",
  "@codemirror/search": "Permission is hereby granted",
  "@codemirror/state": "Permission is hereby granted",
  "@codemirror/view": "Permission is hereby granted",
  "@lezer/common": "Permission is hereby granted",
  "@lezer/highlight": "Permission is hereby granted",
  "@marijn/find-cluster-break": "Permission is hereby granted",
  crelt: "Permission is hereby granted",
  "style-mod": "Permission is hereby granted",
  "w3c-keyname": "Permission is hereby granted",
  "pdfjs-dist": "Apache License",
  "client-zip": "Permission is hereby granted",
  react: "Permission is hereby granted",
  "react-dom": "Permission is hereby granted",
  scheduler: "Permission is hereby granted",
  zustand: "Permission is hereby granted",
  "TeXlyre BusyTeX": "GNU AFFERO GENERAL PUBLIC LICENSE",
  "BusyTeX and TeX Live": "LaTeX engine: third-party notices",
};

/**
 * Opens the About dialog from the overflow menu.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<import("@playwright/test").Locator>} the dialog
 */
async function openAbout(page) {
  await page.locator("#header-menu-toggle").click();
  await page.getByRole("menuitem", { name: "About" }).click();
  const dialog = page.getByRole("dialog", { name: "About the scenario builder" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("About opens a dialog that links the app's source code", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openAbout(page);
  await expect(dialog.getByRole("link", { name: "source code on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/qwrtln/Homm3BG-mission-book/tree/main/web",
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#header-menu-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("each license row loads its text when opened", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openAbout(page);
  const rows = dialog.locator("details.license");
  await expect(rows).toHaveCount(Object.keys(LICENSES).length);

  for (const [name, line] of Object.entries(LICENSES)) {
    // Whole-name match: "react" must not also match the "react-dom" row.
    const exact = new RegExp(`^${name}$`);
    const row = rows.filter({ has: page.locator(".license-name", { hasText: exact }) });
    await row.locator("summary").click();
    await expect(row.locator(".license-text")).toContainText(line);
  }
  expect(errors).toEqual([]);
});

test("About comes before the separator, so it shows while signed out", async ({ app }) => {
  const { page } = app;
  await page.locator("#header-menu-toggle").click();
  await expect(page.locator("#github-signout")).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "About" })).toBeVisible();

  // Keyboard: Dark mode first, Help next, About next.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "About" })).toBeFocused();
});

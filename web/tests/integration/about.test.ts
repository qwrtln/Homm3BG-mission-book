// Tier 2. The overflow menu's About item: it opens a dialog naming the app's
// license and linking its source code, which AGPL-3.0 section 13 requires,
// and each license row loads its text from the file shipped with the code.

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

/** Each license row, by name, and a line its license text must contain. */
const LICENSES = {
  "Scenario builder": "GNU AFFERO GENERAL PUBLIC LICENSE",
  "@codemirror/autocomplete": "Permission is hereby granted",
  "@codemirror/commands": "Permission is hereby granted",
  "@codemirror/language": "Permission is hereby granted",
  "@codemirror/legacy-modes": "Permission is hereby granted",
  "@codemirror/lint": "Permission is hereby granted",
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
 * @param page
 * @returns the dialog
 */
async function openAbout(page: Page): Promise<Locator> {
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

test("a click on the backdrop closes the dialog, a click inside it does not", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openAbout(page);
  const box = await dialog.boundingBox();
  if (!box) throw new Error("the About dialog has no box");

  // The dialog's own padding: the click targets the <dialog> element, as a backdrop click does.
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
  await expect(dialog).toBeVisible();

  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
  await expect(page.locator("#header-menu-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("the bundled libraries come after the LaTeX engine", async ({ app }) => {
  const { page } = app;
  const dialog = await openAbout(page);
  await expect(dialog.locator(".license-group h4")).toHaveText(["This app", "LaTeX engine", "Bundled libraries"]);
});

test("the bundled libraries are listed before any license text loads", async ({ app }) => {
  const { page, errors } = app;
  const fetched: string[] = [];
  // Hold the texts back: the list must not wait for them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/licenses.json", async (route) => {
    fetched.push(route.request().url());
    await held;
    await route.continue();
  });

  const dialog = await openAbout(page);
  const bundled = dialog.locator("#license-bundled");
  await expect(bundled.locator(".license-name", { hasText: /^zustand$/ })).toBeVisible();
  await expect(bundled.locator("details.license")).toHaveCount(Object.keys(LICENSES).length - 3);
  expect(fetched).toEqual([]);

  const row = bundled
    .locator("details.license")
    .filter({ has: page.locator(".license-name", { hasText: /^zustand$/ }) });
  await row.locator("summary").click();
  await expect.poll(() => fetched.length).toBe(1);
  release();
  await expect(row.locator(".license-text")).toContainText("Permission is hereby granted");
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

// Tier 2. The divider between the source and PDF panes: dragging it, the
// keyboard, double-click to reset, the split surviving a reload, and the
// divider hiding once the panes stack.

import { expect, test } from "./fixtures.mjs";

const DRAFT_PATH = "draft-scenarios/clash/panes_probe.tex";

/**
 * Opens the workspace on a local autosave, through its address, so a reload
 * lands back in the workspace rather than on the welcome screen.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openWorkspace(page) {
  await page.evaluate((path) => {
    localStorage.setItem(`wasm-scenario-builder:draft:${path}`, "% panes probe\n");
  }, DRAFT_PATH);
  await page.goto("/web/app/#/drafts/clash/panes_probe");
  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 * @returns {Promise<number>}
 */
async function width(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} is not rendered`);
  return box.width;
}

test("dragging the divider resizes the panes, and the split survives a reload", async ({ app }) => {
  const { page, errors } = app;
  await openWorkspace(page);
  const sourceBefore = await width(page, "#editor-pane");
  const pdfBefore = await width(page, "#pdf-pane");

  const box = await page.locator("#pane-divider").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y, { steps: 5 });
  await page.mouse.up();

  const sourceAfter = await width(page, "#editor-pane");
  expect(sourceAfter).toBeCloseTo(sourceBefore + 150, -1);
  expect(await width(page, "#pdf-pane")).toBeCloseTo(pdfBefore - 150, -1);

  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  expect(await width(page, "#editor-pane")).toBeCloseTo(sourceAfter, 0);
  expect(errors).toEqual([]);
});

test("ArrowLeft on the focused divider shrinks the source pane", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const divider = page.locator("#pane-divider");
  await expect(divider).toHaveAttribute("role", "separator");
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  const before = await width(page, "#editor-pane");

  await divider.focus();
  await page.keyboard.press("ArrowLeft");

  await expect(divider).toHaveAttribute("aria-valuenow", "48");
  expect(await width(page, "#editor-pane")).toBeLessThan(before);
});

test("Home stops at the source pane's minimum width, and double-click resets to half", async ({ app }) => {
  const { page } = app;
  await openWorkspace(page);
  const divider = page.locator("#pane-divider");
  const even = await width(page, "#editor-pane");

  await divider.focus();
  await page.keyboard.press("Home");
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(await width(page, "#editor-pane")).toBeCloseTo(20 * rem, 0);

  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  expect(await width(page, "#editor-pane")).toBeCloseTo(even, 0);
});

test("below 850px the panes stack and the divider hides", async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 800, height: 900 });
  await openWorkspace(page);
  await expect(page.locator("#pane-divider")).toBeHidden();
});

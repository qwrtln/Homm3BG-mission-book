// Tier 2. The footer bar under both panes: the status on the left, the shown
// PDF's page count and zoom on the right. The published PDF ends on a
// feedback page an in-browser build does not make, so the pane drops it.

import { expect, openScenarioList, test } from "./fixtures.mjs";

const SCENARIO_NAME = "tier two probe";

/**
 * A PDF of blank pages pdf.js can draw with no fonts: the stand-in published PDF.
 *
 * @param {number} pages how many pages it has
 * @returns {string}
 */
function blankPdf(pages) {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pageObjects = Array.from(
    { length: pages },
    (_, i) => `${i + 3} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj`,
  );
  return [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj`,
    ...pageObjects,
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n");
}

/**
 * Answers the published-PDF CDN with a blank PDF of `pages` pages, or with a
 * 404 when `pages` is 0. Either way the real network is never reached.
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} pages
 * @returns {Promise<void>}
 */
async function stubPublishedPdf(page, pages) {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    (route) =>
      pages > 0
        ? route.fulfill({ status: 200, contentType: "application/pdf", body: blankPdf(pages) })
        : route.fulfill({ status: 404, body: "" }),
  );
}

/**
 * Picks the first offered scenario, names it, and opens the editor.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openFirstScenario(page) {
  const results = await openScenarioList(page);
  await results.first().click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText("Ready.");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 * @returns {Promise<{x: number, y: number, width: number, height: number}>}
 */
async function box(page, selector) {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not rendered`);
  return found;
}

const PAGES = "#pdf-body canvas.pdf-page";

test("the published PDF shows without its feedback page, and a build shows every page", async ({ app }) => {
  const { page, errors } = app;
  await stubPublishedPdf(page, 4);
  await openFirstScenario(page);

  await expect(page.locator(PAGES)).toHaveCount(3);
  await expect(page.locator("#pdf-page-count")).toHaveText("3 pages");

  // The stub engine's PDF has three pages, and none is dropped.
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);
  await expect(page.locator(PAGES)).toHaveCount(3);
  await expect(page.locator("#pdf-page-count")).toHaveText("3 pages");

  expect(errors).toEqual([]);
});

test("a one-page published PDF keeps its page", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, 1);
  await openFirstScenario(page);

  await expect(page.locator(PAGES)).toHaveCount(1);
  await expect(page.locator("#pdf-page-count")).toHaveText("1 page");
});

test("with no PDF shown, the footer holds no page count or zoom", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, 0);
  await openFirstScenario(page);

  await expect(page.locator("#pdf-empty")).toBeVisible();
  await expect(page.locator("#status-bar")).toBeVisible();
  await expect(page.locator("#pdf-controls")).toBeHidden();
});

test("the zoom level reads Fit at the default zoom, and clicking it returns there", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, 3);
  await openFirstScenario(page);
  await expect(page.locator(PAGES)).toHaveCount(2);

  const level = page.locator("#pdf-zoom-level");
  await expect(level).toHaveText("Fit");
  const fitWidth = (await box(page, `${PAGES} >> nth=0`)).width;

  await page.locator("#pdf-zoom-in").click();
  await expect(level).toHaveText("125%");
  await level.click();
  await expect(level).toHaveText("Fit");
  await expect.poll(async () => (await box(page, `${PAGES} >> nth=0`)).width).toBeCloseTo(fitWidth, 0);
});

test("the footer spans both panes, and both panes end on its top edge", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, 3);
  await openFirstScenario(page);
  await expect(page.locator(PAGES)).toHaveCount(2);

  const footer = await box(page, "#status-bar");
  const source = await box(page, "#editor-pane");
  const pdf = await box(page, "#pdf-pane");
  expect(source.y + source.height).toBeCloseTo(footer.y, 0);
  expect(pdf.y + pdf.height).toBeCloseTo(footer.y, 0);
  expect(footer.x).toBeLessThanOrEqual(source.x);
  expect(footer.x + footer.width).toBeGreaterThanOrEqual(pdf.x + pdf.width);

  // The zoom sits in the footer's right end.
  const zoomIn = await box(page, "#pdf-zoom-in");
  expect(zoomIn.y).toBeGreaterThanOrEqual(footer.y);
  expect(zoomIn.x + zoomIn.width).toBeGreaterThan(footer.x + footer.width / 2);
});

test("stacked under 850px, the footer stays below both panes", async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 800, height: 900 });
  await stubPublishedPdf(page, 3);
  await openFirstScenario(page);
  await expect(page.locator(PAGES)).toHaveCount(2);

  const footer = await box(page, "#status-bar");
  const main = await box(page, "#workspace-main");
  const pdf = await box(page, "#pdf-pane");
  expect(pdf.y).toBeGreaterThan((await box(page, "#editor-pane")).y);
  expect(main.y + main.height).toBeCloseTo(footer.y, 0);
  expect(footer.y + footer.height).toBeLessThanOrEqual(900);
  await expect(page.locator("#pdf-zoom-in")).toBeInViewport();
});

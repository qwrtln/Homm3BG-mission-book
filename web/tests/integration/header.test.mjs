// Tier 2. Which header buttons keep their labels as the window narrows. Build,
// Upload images and Sign in keep theirs down to 861px; Download PDF goes
// icon-only first, below 1024px. From 860px down every label collapses, and
// each stays the button's accessible name.

import { expect, test } from "./fixtures.mjs";

// A name near the longest the welcome form accepts (maxlength="60").
const LONG_NAME = "The Unbearably Long Siege of the Crimson Citadel at Dawn";

/** Header buttons whose label can collapse, and the name each keeps. */
const LABELLED = {
  "upload-open": "Upload images",
  build: "Build PDF",
  download: "Download PDF",
  "github-signin": "Sign in to save",
};

/**
 * Opens a new scenario under the longest name the form allows, so the title
 * competes with the buttons for the header's width.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openLongScenario(page) {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(LONG_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#github-signin")).toHaveAccessibleName("Sign in to save");
}

/**
 * Whether a button's label is drawn, or collapsed to the 1px visually hidden
 * box that keeps it as the accessible name.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function labelShown(page, id) {
  const box = await page.locator(`#${id} .label`).boundingBox();
  return box !== null && box.width > 1;
}

/**
 * The header on one row: every visible button shares one vertical span, so
 * nothing wrapped to a second row and no label broke onto a second line.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function expectOneRow(page) {
  const boxes = await page
    .locator("header button:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })),
    );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(Math.abs(box.top - boxes[0].top)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.bottom - boxes[0].bottom)).toBeLessThanOrEqual(1);
  }
}

for (const width of [861, 900]) {
  test(`at ${width}px only Download is icon-only, on one row`, async ({ app }) => {
    const { page } = app;
    await page.setViewportSize({ width, height: 800 });
    await openLongScenario(page);

    for (const id of ["upload-open", "build", "github-signin"]) {
      expect(await labelShown(page, id), `#${id} label`).toBe(true);
    }
    expect(await labelShown(page, "download"), "#download label").toBe(false);
    await expect(page.locator("#download")).toHaveAccessibleName("Download PDF");

    await expectOneRow(page);
    // The title gives way: it ellipsises rather than pushing the buttons.
    const title = page.locator("#scenario-title");
    expect(await title.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  });
}

test("at 1024px every label shows", async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 1024, height: 800 });
  await openLongScenario(page);
  for (const id of Object.keys(LABELLED)) {
    expect(await labelShown(page, id), `#${id} label`).toBe(true);
  }
});

test("at 800px every label collapses, and each stays the accessible name", async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 800, height: 800 });
  await openLongScenario(page);
  for (const [id, name] of Object.entries(LABELLED)) {
    expect(await labelShown(page, id), `#${id} label`).toBe(false);
    await expect(page.locator(`#${id}`)).toHaveAccessibleName(name);
  }
  await expectOneRow(page);
});

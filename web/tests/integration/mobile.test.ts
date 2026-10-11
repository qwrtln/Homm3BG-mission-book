// Tier 2. Guards the viewport meta tag by checking its effect, not its text.
// The suite's other narrow-screen tests (e.g. header.test.ts) use
// page.setViewportSize, which only resizes the Chromium window and cannot see
// whether the tag is present: a desktop browser always lays out at the size
// it is given. A real phone without the tag ignores its physical width and
// lays out at a ~980px virtual viewport, shrinking all text. Device emulation
// is the only way to see that: it is spread at file top level, not inside a
// test.describe, because devices["Pixel 7"] carries defaultBrowserType, and
// Playwright refuses that option once it would force a new worker mid-file.
//
// It also checks every main screen a contributor passes through at that
// width for horizontal page overflow, plus one navigation round trip
// (workspace -> welcome -> workspace) found by manual testing to leave the
// page much wider than the viewport. Overflow inside a pane that scrolls on
// purpose (the editor, the PDF canvas) does not count; only the page's own
// scrollWidth against its innerWidth does.

import { devices, type Page } from "@playwright/test";

import { seedLocalRecord } from "../helpers/local-store.ts";
import { chooseFromMenu, expect, READY_STATUS, test } from "./fixtures.ts";

test.use({ ...devices["Pixel 7"] });

test("lays out at the emulated device width, not the desktop default", async ({ app }) => {
  const { page } = app;
  const width = await page.evaluate(() => window.innerWidth);
  expect(width).toBe(412);
});

/**
 * Asserts the page itself never scrolls sideways, with a 1px tolerance.
 * Overflow inside an element that scrolls on purpose (the editor, the PDF
 * canvas) does not count: this only compares the document's own scrollWidth
 * against the viewport.
 */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `document.documentElement.scrollWidth (${scrollWidth}) vs innerWidth (${innerWidth})`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

/**
 * Opens a new blank Clash scenario under a long name, the way a contributor
 * on a phone does: from the welcome screen's "Start blank" row.
 */
async function openLongScenario(
  page: Page,
  name = "The Unbearably Long Siege of the Crimson Citadel at Dawn",
): Promise<void> {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(name);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

test("the welcome screen has no horizontal page scroll", async ({ app }) => {
  const { page } = app;
  await expect(page.locator("#welcome")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the resume list has no horizontal page scroll, and a local draft shows the phone", async ({ app }) => {
  const { page } = app;
  await seedLocalRecord(page, "draft-scenarios/coops/the_unbearably_long_siege_of_the_crimson_citadel_at_dawn.tex", {
    text: "% edited on a phone\n",
  });
  await page.reload();

  await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
  await expect(page.locator("#resume-list .resume-where .device-mobile")).toHaveCount(1);
  await expect(page.locator("#resume-list .resume-where .device-desktop")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("the wizard has no horizontal page scroll on pane 1 or the map-tiles pane", async ({ app }) => {
  const { page } = app;
  await page.locator("#start-wizard").click();
  await expect(page.locator("#wizard-pane-basics")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.locator("#wizard-name").fill("Mobile Wizard Probe");
  await page.locator("#wizard-category").getByLabel("Clash").check();
  await page.locator("#wizard-next").click(); // basics -> lore
  await expect(page.locator("#wizard-pane-lore")).toBeVisible();
  await page.locator("#wizard-next").click(); // lore -> length (skipped)
  await expect(page.locator("#wizard-pane-length")).toBeVisible();
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await page.locator("#wizard-next").click(); // length -> resources
  for (const pane of ["resources", "units", "buildings", "pool"]) {
    await expect(page.locator(`#wizard-pane-${pane}`)).toBeVisible();
    if (pane === "units") await page.locator("#wizard-units").fill("");
    await page.locator("#wizard-next").click();
  }
  await expect(page.locator("#wizard-pane-map")).toBeVisible();
  await expect(page.locator("#wizard-pane-map .wizard-count").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the workspace has no horizontal page scroll, and Build PDF stays reachable", async ({ app }) => {
  const { page } = app;
  await openLongScenario(page);
  await expectNoHorizontalScroll(page);
  await expect(page.locator("#build")).toBeVisible();
  await expect(page.locator("#build")).toBeInViewport();
});

test("the About dialog has no horizontal page scroll", async ({ app }) => {
  const { page } = app;
  await openLongScenario(page);
  await chooseFromMenu(page, "about-open");
  await expect(page.locator("#about-dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the Upload images dialog has no horizontal page scroll", async ({ app }) => {
  const { page } = app;
  await openLongScenario(page);
  await page.locator("#upload-open").click();
  await expect(page.locator("#upload-dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the sign-in and token dialogs have no horizontal page scroll", async ({ app }) => {
  const { page } = app;
  await page.locator("#github-signin").click();
  await expect(page.locator("#signin-dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.locator("#signin-token").click();
  await expect(page.locator("#token-dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("going workspace -> welcome -> workspace leaves no horizontal page scroll", async ({ app }) => {
  const { page } = app;
  await openLongScenario(page);
  await expectNoHorizontalScroll(page);
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);

  await page.locator("#back-to-welcome").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#back-to-editing")).toBeVisible();

  await page.locator("#back-to-editing").click();
  await expect(page.locator("#workspace")).toBeVisible();

  await expectNoHorizontalScroll(page);
});

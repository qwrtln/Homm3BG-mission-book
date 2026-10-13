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
//
// At this width the workspace header drops the scenario name and the category
// select, and Upload images moves from the header into the overflow menu.
// Signed in, Open PR moves there too, and the unsaved changes show as a dot
// on Save rather than as a note beside the name.

import { devices, type Page } from "@playwright/test";
import { editorBox } from "../helpers/editor.ts";
import { seedLocalRecord } from "../helpers/local-store.ts";
import { chooseFromMenu, expect, type GithubRoute, OPEN_ROW, READY_STATUS, test } from "./fixtures.ts";

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
  await chooseFromMenu(page, "upload-open-menu");
  await expect(page.locator("#upload-dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the workspace header hides the scenario name and category, and Upload images moves into the menu", async ({
  app,
}) => {
  const { page } = app;
  await openLongScenario(page);

  await expect(page.locator("#scenario-title")).toBeHidden();
  await expect(page.locator("#scenario-category")).toBeHidden();
  await expect(page.locator("#upload-open")).toBeHidden();
  await expect(page.locator("#back-to-welcome")).toBeVisible();

  await page.locator("#header-menu-toggle").click();
  const item = page.locator("#upload-open-menu");
  await expect(item).toBeVisible();
  await expect(item).toHaveAccessibleName("Upload images");
  await item.click();
  await expect(page.locator("#upload-dialog")).toBeVisible();
});

test("the menu offers no Upload images before a scenario is open", async ({ app }) => {
  const { page } = app;
  await page.locator("#header-menu-toggle").click();
  await expect(page.locator("#header-menu")).toBeVisible();
  await expect(page.locator("#upload-open-menu")).toHaveCount(0);
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
  await expect(page.locator(OPEN_ROW)).toBeVisible();

  await page.locator(OPEN_ROW).click();
  await expect(page.locator("#workspace")).toBeVisible();

  await expectNoHorizontalScroll(page);
});

/** A contributor with a fork, and a save to it that succeeds. */
const SIGNED_IN_ROUTES: GithubRoute[] = [
  { method: "GET", path: "/user", body: { login: "octotester" } },
  {
    method: "GET",
    path: "/repos/qwrtln/Homm3BG-mission-book",
    body: {
      name: "Homm3BG-mission-book",
      owner: { login: "qwrtln" },
      default_branch: "main",
      permissions: { push: false },
    },
  },
  {
    method: "GET",
    path: "/repos/octotester/Homm3BG-mission-book",
    body: { name: "Homm3BG-mission-book", owner: { login: "octotester" }, default_branch: "main" },
  },
  { method: "GET", path: /\/branches(\?|$)/, body: [] },
  { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
  { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
  { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
  { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
  { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
  { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
  { method: "POST", path: /\/git\/refs$/, body: { ref: "refs/heads/x" } },
  { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: "refs/heads/x" } },
  { method: "GET", path: /\/pulls\?/, body: [] },
];

test.describe("signed in", () => {
  // A bare array given to test.use() reads as a [value, options] tuple, so the list is wrapped.
  // Playwright's typings model the options as { scope }; `option` is what it reads at runtime (see github.test.ts).
  test.use({ githubRoutes: [SIGNED_IN_ROUTES, { option: true } as unknown as { scope: "test" }] });

  test("saved then edited: the dot sits on Save, Open PR is in the menu, and nothing overlaps Build", async ({
    app,
  }) => {
    const { page } = app;
    await page.addInitScript(() => localStorage.setItem("github_token", "gh-tier2-token"));
    await page.reload();
    await openLongScenario(page);

    await page.locator("#github-save").click();
    await expect(page.locator("#status-text")).toContainText("Saved to ");
    await expect(page.locator("#unsaved-note")).toHaveCount(0);
    await expect(page.locator("#github-open-pr")).toBeHidden();

    await editorBox(page).click();
    await page.keyboard.type("x");
    const dot = page.locator("#github-save #unsaved-note");
    await expect(dot).toBeVisible();
    await expect(page.locator("#github-save")).toHaveAccessibleName("Save");
    await expect(page.locator("#github-save")).toHaveAccessibleDescription("Unsaved changes");

    const left = await page.locator("#header-scenario").boundingBox();
    const build = await page.locator("#build").boundingBox();
    expect(left && build && left.x + left.width).toBeLessThanOrEqual(build?.x ?? 0);
    await expectNoHorizontalScroll(page);

    await page.locator("#header-menu-toggle").click();
    await expect(page.locator("#github-open-pr-menu")).toBeVisible();
    await expect(page.locator("#github-open-pr-menu")).toHaveAccessibleName("Open PR");
  });
});

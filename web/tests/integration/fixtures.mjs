// Shared tier 2 fixtures. Every integration test goes through these, so the
// stubbing contract lives in one place rather than being restated per file.
//
// Isolation model: Playwright gives each test its own BrowserContext and page
// while sharing one browser process per worker. That is the only safe reset
// for this app — it initializes once on load and `modules/state.js` holds
// module-level state that nothing short of a navigation clears — and it is
// also the cheap one, since the browser launch is paid once per worker rather
// than once per test.

import { test as base, expect } from "@playwright/test";

import { installEngineStub, installGithubStub } from "../stubs/install-stubs.mjs";

/**
 * @typedef {import("../stubs/install-stubs.mjs").GithubRoute} GithubRoute
 */

export const test = base.extend({
  // Routes for api.github.com, overridden per file or per test with
  // test.use({ githubRoutes: [...] }). The default stubs nothing: a cold load
  // must not call the API, and an unmatched call fails loudly with a 599.
  githubRoutes: [[], { option: true }],

  /**
   * Every console error and uncaught page error seen since the page opened.
   * Read it at the end of a test; it is the same array throughout.
   */
  pageErrors: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await use(errors);
  },

  /**
   * The app, stubbed and loaded. Stubs are installed before the navigation:
   * navigate first and the real engine wrapper is already in flight, and a
   * ~341 MB engine download starts.
   */
  app: async ({ page, githubRoutes, pageErrors }, use) => {
    await installEngineStub(page);
    await installGithubStub(page, githubRoutes);
    await page.goto("/web/app/");
    await use({ page, errors: pageErrors });
  },
});

export { expect };

/**
 * Waits for the scenario list to arrive and the dropdown to draw it.
 *
 * The dropdown redraws on focus and on input, but the entries arrive from an
 * async fetch of the book's own group files, so re-firing input turns that
 * race into a poll instead of a flake.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{timeout?: number}} [options]
 * @returns {Promise<import("@playwright/test").Locator>} the result rows
 */
export async function openScenarioList(page, options = {}) {
  const search = page.locator("#search");
  const results = page.locator("#search-results .combobox-item");
  await expect
    .poll(
      async () => {
        await search.focus();
        await search.dispatchEvent("input");
        return results.count();
      },
      {
        timeout: options.timeout ?? 30000,
        message: "the search dropdown offered no scenarios",
      },
    )
    .toBeGreaterThan(0);
  return results;
}

/**
 * Every call the stub engine recorded, in order.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{method: string, args: unknown[]}[]>}
 */
export async function engineCalls(page) {
  return page.evaluate(() => globalThis.__stubEngineCalls || []);
}

/**
 * Picks an item from the header's overflow menu, the way a contributor does:
 * open the menu, then click the item. The items are hidden until it opens.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} id the item's element id, e.g. "theme-toggle"
 * @returns {Promise<void>}
 */
export async function chooseFromMenu(page, id) {
  await page.locator("#header-menu-toggle").click();
  await expect(page.locator("#header-menu")).toBeVisible();
  await page.locator(`#${id}`).click();
}

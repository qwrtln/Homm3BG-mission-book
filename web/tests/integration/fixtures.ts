// Shared tier 2 fixtures. Every integration test goes through these, so the
// stubbing contract lives in one place rather than being restated per file.
//
// Isolation model: Playwright gives each test its own BrowserContext and page
// while sharing one browser process per worker. That is the only safe reset
// for this app — it initializes once on load and `modules/state.ts` holds
// module-level state that nothing short of a navigation clears — and it is
// also the cheap one, since the browser launch is paid once per worker rather
// than once per test.

import { test as base, expect, type Locator, type Page } from "@playwright/test";

import {
  type GithubRoute,
  installEngineStub,
  installGithubStub,
  installPublishedPdfStub,
} from "../stubs/install-stubs.ts";

export type { GithubRoute };

interface Fixtures {
  githubRoutes: GithubRoute[];
  pageErrors: string[];
  app: { page: Page; errors: string[] };
}

export const test = base.extend<Fixtures>({
  // Routes for api.github.com, overridden per file or per test with
  // test.use({ githubRoutes: [...] }). The default stubs nothing: a cold load
  // must not call the API, and an unmatched call fails loudly with a 599.
  githubRoutes: [[], { option: true }],

  /**
   * Every console error and uncaught page error seen since the page opened.
   * Read it at the end of a test; it is the same array throughout.
   */
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
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
    await installPublishedPdfStub(page);
    await page.goto("/web/app/");
    await use({ page, errors: pageErrors });
  },
});

export { expect };

/** The status bar once a scenario opens with nothing to rebuild, on the tests' non-macOS platform. */
export const READY_STATUS = "Ready. Press Build PDF or Ctrl+Enter to start.";

/** The PDF pane's text with nothing built yet, on the tests' non-macOS platform. */
export const EMPTY_PDF_TEXT = "No PDF yet. Press Build PDF or Ctrl+Enter.";

/** The status bar once a picked scenario opens: Ready, or the published PDF's staleness note. */
export const OPENED_STATUS =
  /^(Ready\. Press Build PDF or Ctrl\+Enter to start\.|Published PDF of .+\. Press Build PDF or Ctrl\+Enter to see your changes\.)$/;

/**
 * Waits for the scenario list to arrive and the dropdown to draw it.
 *
 * The dropdown redraws on focus and on input, but the entries arrive from an
 * async fetch of the book's own group files, so re-firing input turns that
 * race into a poll instead of a flake.
 *
 * @returns the result rows
 */
export async function openScenarioList(page: Page, options: { timeout?: number } = {}): Promise<Locator> {
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
 */
export async function engineCalls(page: Page): Promise<{ method: string; args: unknown[] }[]> {
  return page.evaluate(() => globalThis.__stubEngineCalls || []);
}

/**
 * Picks an item from the header's overflow menu, the way a contributor does:
 * open the menu, then click the item. The items are hidden until it opens.
 *
 * @param id the item's element id, e.g. "theme-toggle"
 */
export async function chooseFromMenu(page: Page, id: string): Promise<void> {
  await page.locator("#header-menu-toggle").click();
  await expect(page.locator("#header-menu")).toBeVisible();
  await page.locator(`#${id}`).click();
}

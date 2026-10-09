// Tier 2 helper: simulates a browser crash and a later relaunch.
//
// Crash model: committed data only. The helper snapshots the storage of the
// current page's context (cookies, localStorage and IndexedDB), then closes
// that page without running its unload handlers. Whatever the app had not yet
// written to storage when the snapshot was taken is lost, as in a real crash.
// A write still in flight, or text inside the debounce window, is not carried
// over. The caller waits for the backup it expects before calling this.
//
// The new context does not inherit the project's `use` options, so the Desktop
// Chrome device and the baseURL are passed by hand. It gets the same stubs and
// error capture as the `app` fixture (tests/integration/fixtures.ts).

import { type Browser, type BrowserContext, devices, type Page, type TestInfo } from "@playwright/test";

import {
  type GithubRoute,
  installEngineStub,
  installGithubStub,
  installPublishedPdfStub,
} from "../stubs/install-stubs.ts";

export interface FreshContext {
  /** Context B's page. Not navigated: the caller loads whatever address it wants. */
  page: Page;
  /** Every console error and uncaught page error seen on B's page. */
  errors: string[];
  /** Context B. The caller closes it. */
  context: BrowserContext;
}

/**
 * Crashes the current page and returns a page in a new context that starts
 * with the storage the crashed one had committed.
 *
 * @param browser
 * @param page the page to crash
 * @param githubRoutes the GitHub stub routes, as for the `app` fixture
 * @param testInfo
 * @param initScripts registered on B before any navigation
 */
export async function crashAndRelaunch(
  browser: Browser,
  page: Page,
  githubRoutes: GithubRoute[],
  testInfo: TestInfo,
  initScripts: (string | (() => void))[] = [],
): Promise<FreshContext> {
  const storageState = await page.context().storageState({ indexedDB: true });
  await page.close({ runBeforeUnload: false });

  const baseURL = testInfo.project.use.baseURL;
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL, storageState });
  const next = await context.newPage();

  const errors: string[] = [];
  next.on("pageerror", (error) => errors.push(String(error)));
  next.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  for (const script of initScripts) {
    await next.addInitScript(script);
  }
  await installEngineStub(next);
  await installGithubStub(next, githubRoutes);
  await installPublishedPdfStub(next);
  return { page: next, errors, context };
}

/**
 * An init script that makes every `indexedDB.open` throw, as a browser with
 * IndexedDB blocked from page start does. Pass it to `page.addInitScript` or
 * through `crashAndRelaunch`'s `initScripts`.
 */
export function breakIndexedDb(): void {
  indexedDB.open = () => {
    throw new DOMException("IndexedDB is blocked for this test", "SecurityError");
  };
}

// Tier 2. The real web/app/index.html, loaded in headless Chromium via
// Playwright. Real DOM, real modules, real event wiring. The LaTeX engine is
// stubbed at its vendored module path before the page is navigated, so no
// WASM is fetched and no texlive-*.data is downloaded. See
// web/tests/README.md.

import { expect, test } from "@playwright/test";

import { installEngineStub, installGithubStub } from "../stubs/install-stubs.mjs";

test("the app boots, lists the book's scenarios, and selects one", async ({ page }) => {
  const started = Date.now();

  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Install the stubs before navigating: the stubs must be in place before
  // the app's modules are fetched, or the real engine wrapper is already on
  // its way and a ~341 MB engine download starts.
  await installEngineStub(page);
  // No route is stubbed. The app must not call the GitHub API on a cold load,
  // and an unmatched call fails loudly with a 599 rather than reaching it.
  await installGithubStub(page, []);

  await page.goto("/web/app/");

  const search = page.locator("#search");
  const results = page.locator("#search-results .combobox-item");

  // The dropdown redraws on focus and on input, but the entry list arrives
  // from an async fetch of the book's group files, so re-firing input turns
  // that race into a poll instead of a flake.
  await expect
    .poll(
      async () => {
        await search.focus();
        await search.dispatchEvent("input");
        return results.count();
      },
      { timeout: 30000, message: "the search dropdown offered no scenarios" },
    )
    .toBeGreaterThan(0);

  const first = results.first();
  const firstTitle = (await first.textContent()).trim();
  const firstPath = await first.getAttribute("data-path");
  expect(firstPath).toMatch(/\.tex$/);
  expect(firstTitle.length).toBeGreaterThan(0);

  // Playwright's click() dispatches a real mouse sequence including
  // mousedown, which is what search.js listens for so the choice lands
  // before the input's blur hides the list.
  await first.click();

  // The pick replaces what was typed to find it: the search box is the only
  // place the chosen title is shown.
  await expect(page.locator("#search")).toHaveValue(firstTitle);

  // app.js calls ensureEngine() eagerly on load. The stub records the call,
  // so this proves the app asked for the engine AND that it got the stub.
  const engineCalls = await page.evaluate(() => globalThis.__stubEngineCalls || []);
  expect(
    engineCalls.some((call) => call.method === "BusyTexRunner.initialize"),
    `the stub engine was never initialized; recorded calls: ${JSON.stringify(engineCalls)}`,
  ).toBe(true);

  expect(errors, "the page reported errors on a cold load").toEqual([]);

  console.log(`tier 2 wall clock: ${((Date.now() - started) / 1000).toFixed(1)}s`);
});

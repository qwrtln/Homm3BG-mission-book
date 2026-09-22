// Tier 2. The workspace the picker hands off to: the build path against the
// stub engine, the Build/Download state machine, the uploads popover, and the
// theme toggle. Everything here goes through web/tests/integration/fixtures.mjs,
// which installs the engine and GitHub stubs before navigating.

import { engineCalls, expect, openScenarioList, test } from "./fixtures.mjs";

// Long enough to pass picker.js's MIN_NAME_LENGTH, and not a real scenario
// name: commitEntry uses it as the file's own identity, never the entry's.
const SCENARIO_NAME = "tier two probe";

// Chromium logs a console error for a request Playwright's interception
// blocked. Only the block below can produce this exact text — neither the app
// nor the static server can — so it is the one line dropped before a test
// asserts the page stayed clean.
const BLOCKED_BY_TEST = "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector";

/**
 * Blocks the published-PDF prefetch.
 *
 * picker.js prefetches https://raw.githubusercontent.com/... for every real
 * entry, and that host is outside installGithubStub's api.github.com match.
 * Left alone, a test would reach the real network and depend on whether that
 * scenario's branch happens to carry a PDF — which is what decides whether
 * the PDF pane starts empty. A blocked fetch is the "no published PDF" case
 * the app already handles: prefetchScenario catches it and returns null,
 * commitEntry calls clearPdf(), and the pane keeps its empty state.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function blockPublishedPdf(page) {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    (route) => route.abort("blockedbyclient"),
  );
}

/**
 * The page errors the app itself is responsible for.
 *
 * @param {string[]} errors every console error and page error seen so far
 * @returns {string[]}
 */
function appErrors(errors) {
  return errors.filter((message) => message !== BLOCKED_BY_TEST);
}

/**
 * Walks the welcome screen into the workspace: pick the first offered
 * scenario, name it, press "Let's go!".
 *
 * Never asserts *which* scenario — it reads the row the app rendered and
 * carries that title forward, so writing a new scenario cannot break this.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>} the title of the entry that was picked
 */
async function enterWorkspace(page) {
  await blockPublishedPdf(page);

  const results = await openScenarioList(page);
  const first = results.first();
  const title = (await first.textContent()).trim();
  // click() dispatches a real mousedown, which is what search.js listens for.
  await first.click();
  await expect(page.locator("#search")).toHaveValue(title);

  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await expect(page.locator("#go")).toBeEnabled();
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#header-actions")).toBeVisible();
  // commitEntry writes this last, after the prefetch it awaits has settled,
  // so it is the one point at which the workspace is fully settled.
  await expect(page.locator("#status-text")).toHaveText("Ready.");
  return title;
}

/**
 * Starts recording #build's disabled flag and #build-overlay's hidden flag,
 * every time either changes.
 *
 * A build against the stub engine finishes in milliseconds, so polling for
 * the mid-build state is a race. Recording the transitions and asserting over
 * the record afterwards is not.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function recordBuildStates(page) {
  await page.evaluate(() => {
    const build = document.getElementById("build");
    const overlay = document.getElementById("build-overlay");
    const seen = [];
    globalThis.__buildStates = seen;
    const snapshot = () => seen.push({ disabled: build.disabled, overlayShown: !overlay.hidden });
    snapshot();
    new MutationObserver(snapshot).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden"],
    });
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{disabled: boolean, overlayShown: boolean}[]>}
 */
async function buildStates(page) {
  return page.evaluate(() => globalThis.__buildStates || []);
}

test("a build drives the stub engine and fills the PDF pane", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  const build = page.locator("#build");
  const download = page.locator("#download");
  await expect(build).toBeEnabled();
  await expect(download).toBeDisabled();
  await expect(page.locator("#pdf-empty")).toHaveText("No PDF yet. Press Build PDF.");

  await recordBuildStates(page);
  await build.click();

  // pageCount() finds no "Output written on" line in the stub's log, so the
  // count is 0; the status line is still the app's own success wording.
  await expect(page.locator("#status-text")).toHaveText(/^Built \d+ page\(s\) in \d+(\.\d+)?s\.$/);

  const calls = await engineCalls(page);
  const compile = calls.find((call) => call.method === "LuaLatex.compile");
  expect(
    compile,
    `the app never asked the engine to compile; recorded calls: ${JSON.stringify(calls.map((c) => c.method))}`,
  ).toBeTruthy();
  // What build.js passes: the plan's entry point, plus every staged file.
  expect(typeof compile.args[0].input).toBe("string");
  expect(compile.args[0].additionalFiles.length).toBeGreaterThan(0);

  // The pane replaced its placeholder with the embed showPdf() writes.
  await expect(page.locator("#pdf-empty")).toHaveCount(0);
  await expect(page.locator('#pdf-body embed[type="application/pdf"]')).toHaveCount(1);
  await expect(page.locator("#error-panel")).toBeHidden();

  expect(appErrors(errors), "the page reported errors while building").toEqual([]);
});

test("Build is disabled and the overlay is up while a build runs", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  await recordBuildStates(page);
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);

  const states = await buildStates(page);
  expect(
    states.some((s) => s.disabled && s.overlayShown),
    `#build was never disabled with the build overlay up; recorded: ${JSON.stringify(states)}`,
  ).toBe(true);
  // And it came back: setBuilding(false) runs in runBuild's finally.
  expect(states[states.length - 1]).toEqual({ disabled: false, overlayShown: false });
  await expect(page.locator("#build-overlay")).toBeHidden();

  expect(appErrors(errors), "the page reported errors while building").toEqual([]);
});

test("Build and Download follow the pick and the build", async ({ app }) => {
  const { page, errors } = app;

  // Before a pick the whole action group is hidden, and both buttons carry
  // index.html's own disabled attribute.
  await expect(page.locator("#header-actions")).toBeHidden();
  await expect(page.locator("#build")).toBeDisabled();
  await expect(page.locator("#download")).toBeDisabled();

  await enterWorkspace(page);

  // A pick enables Build only. Download waits for bytes to download.
  await expect(page.locator("#build")).toBeEnabled();
  await expect(page.locator("#download")).toBeDisabled();

  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);

  await expect(page.locator("#build")).toBeEnabled();
  await expect(page.locator("#download")).toBeEnabled();

  expect(appErrors(errors), "the page reported errors across the build").toEqual([]);
});

test("the uploads popover opens, closes, and stages a chosen file", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  const popover = page.locator("#upload-popover");
  const toggle = page.locator("#upload-toggle");
  await expect(popover).toBeHidden();

  await toggle.click();
  await expect(popover).toBeVisible();
  await toggle.click();
  await expect(popover).toBeHidden();

  await toggle.click();
  await expect(popover).toBeVisible();

  // An in-memory file: nothing is added to the repository, and the bytes
  // never leave the browser — uploads.js stages them in the virtual
  // filesystem the build compiles from.
  const headerName = "probe-header.png";
  const headerRename = page.locator("#upload-header-name");
  await expect(headerRename).toBeHidden();
  await page.locator("#upload-header").setInputFiles({
    name: headerName,
    mimeType: "image/png",
    buffer: Buffer.from("not really a png, and never decoded"),
  });

  // The rename box appears carrying the chosen name, and the status says
  // where the build will see the file.
  await expect(headerRename).toBeVisible();
  await expect(headerRename).toHaveValue(headerName);
  await expect(page.locator("#upload-header-status")).toHaveText(`Staged: assets/images/${headerName}`);

  // Retyping the target name re-stages it under the new path.
  await headerRename.fill("renamed.png");
  await expect(page.locator("#upload-header-status")).toHaveText("Staged: assets/images/renamed.png");

  // A name with spaces or TeX-hostile characters is normalized, both for a
  // fresh pick and for a retyped rename.
  await headerRename.fill("my cover (1) pic.png");
  await expect(page.locator("#upload-header-status")).toHaveText("Staged: assets/images/my_cover_1_pic.png");
  await page.locator("#upload-header").setInputFiles({
    name: "spaced name.png",
    mimeType: "image/png",
    buffer: Buffer.from("still not a png"),
  });
  await expect(headerRename).toHaveValue("spaced name.png");
  await expect(page.locator("#upload-header-status")).toHaveText("Staged: assets/images/spaced_name.png");
  await headerRename.fill("renamed.png");
  await expect(page.locator("#upload-header-status")).toHaveText("Staged: assets/images/renamed.png");

  // Maps get one rename row per file, under assets/maps/.
  const mapName = "probe-map.png";
  await page.locator("#upload-maps").setInputFiles({
    name: mapName,
    mimeType: "image/png",
    buffer: Buffer.from("also not really a png"),
  });
  const mapRows = page.locator("#upload-maps-names .upload-rename-row");
  await expect(mapRows).toHaveCount(1);
  await expect(page.locator("#upload-maps-names .upload-rename")).toHaveValue(mapName);
  await expect(page.locator("#upload-maps-status")).toHaveText(`Staged: assets/maps/${mapName}`);

  // A click outside closes it; the staged files survive that.
  await page.locator("h1").click();
  await expect(popover).toBeHidden();
  await toggle.click();
  await expect(page.locator("#upload-header-status")).toHaveText("Staged: assets/images/renamed.png");

  expect(appErrors(errors), "the page reported errors while uploading").toEqual([]);
});

test("the theme toggle flips the theme and the choice survives a reload", async ({ app }) => {
  const { page, errors } = app;

  // theme.js's own key. Read the starting theme rather than assuming one:
  // initialTheme() falls back to the system preference when nothing is saved.
  const THEME_KEY = "wasm-scenario-builder:theme";
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  expect(["dark", "light"]).toContain(before);
  const after = before === "dark" ? "light" : "dark";

  await page.locator("#theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", after);
  // The toggle offers the *other* theme, so its glyph is the opposite one.
  await expect(page.locator("#theme-toggle")).toHaveText(after === "dark" ? "☀️" : "🌙");
  // CodeMirror is themed along with the document.
  await expect(page.locator(".CodeMirror")).toHaveClass(after === "dark" ? /cm-s-github-dark/ : /cm-s-github-light/);

  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe(after);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after);
  await expect(page.locator("#theme-toggle")).toHaveText(after === "dark" ? "☀️" : "🌙");

  expect(appErrors(errors), "the page reported errors around the theme toggle").toEqual([]);
});

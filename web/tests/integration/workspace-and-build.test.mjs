// Tier 2. The workspace the picker hands off to: the build path against the
// stub engine, the Build/Download state machine, the header bar and its
// overflow menu, the uploads dialog, and the theme toggle. Everything here goes through web/tests/integration/fixtures.mjs,
// which installs the engine and GitHub stubs before navigating.

import { chooseFromMenu, engineCalls, expect, openScenarioList, test } from "./fixtures.mjs";

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
 * Starts recording #build's disabled flag, label and stop styling, and
 * #build-overlay's hidden flag, every time any of them changes.
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
    const snapshot = () =>
      seen.push({
        disabled: build.disabled,
        label: build.textContent,
        stop: build.classList.contains("stop"),
        overlayShown: !overlay.hidden,
      });
    snapshot();
    new MutationObserver(snapshot).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "disabled", "hidden"],
    });
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{disabled: boolean, label: string, stop: boolean, overlayShown: boolean}[]>}
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

test("Build turns into an enabled Stop with the overlay up while a build runs", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  await recordBuildStates(page);
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);

  const states = await buildStates(page);
  expect(
    states.some((s) => !s.disabled && s.label === "Stop" && s.stop && s.overlayShown),
    `#build never became an enabled Stop with the build overlay up; recorded: ${JSON.stringify(states)}`,
  ).toBe(true);
  // And it came back: setBuilding(false) runs in runBuild's finally.
  expect(states[states.length - 1]).toEqual({ disabled: false, label: "Build PDF", stop: false, overlayShown: false });
  await expect(page.locator("#build-overlay")).toBeHidden();

  expect(appErrors(errors), "the page reported errors while building").toEqual([]);
});

/**
 * Makes every stub compile hang until a stop ends it. See
 * texlyre-busytex-stub.js.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function holdCompiles(page) {
  await page.evaluate(() => {
    globalThis.__stubCompileHold = new Promise(() => {});
  });
}

/**
 * Lets stub compiles answer at once again.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function releaseCompiles(page) {
  await page.evaluate(() => {
    globalThis.__stubCompileHold = null;
  });
}

/**
 * The recorded engine calls with the given method name.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} method
 * @returns {Promise<unknown[]>}
 */
async function callsTo(page, method) {
  return (await engineCalls(page)).filter((call) => call.method === method);
}

/**
 * Which octicon #build shows before its label, and its width.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{glyph: string, width: number}>} glyph is "play", "stop" or ""
 */
async function buildLook(page) {
  return page.locator("#build").evaluate((button) => {
    const shown = (/** @type {string} */ selector) => {
      const icon = button.querySelector(selector);
      return icon !== null && getComputedStyle(icon).display !== "none";
    };
    return {
      glyph: shown(".build-icon") ? "play" : shown(".stop-icon") ? "stop" : "",
      width: button.getBoundingClientRect().width,
    };
  });
}

/**
 * A colour token, resolved the way the browser resolves it, so the theme
 * does not matter.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} token a custom property, e.g. "--btn-danger-bg"
 * @returns {Promise<string>} the computed colour, e.g. "rgb(246, 248, 250)"
 */
async function tokenColour(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test("Stop ends a hanging compile and kills the engine", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);
  const build = page.locator("#build");
  // Widen the label past any fixed width a stylesheet might guess, as CI's
  // fonts once did: the width must be measured, not assumed.
  await page.addStyleTag({ content: "#build { letter-spacing: 0.37px; }" });
  const idle = await buildLook(page);
  expect(idle.glyph).toBe("play");

  await holdCompiles(page);
  await build.click();
  await expect.poll(async () => (await callsTo(page, "LuaLatex.compile")).length).toBe(1);

  // Mid-compile: the button is a red, clickable Stop.
  await expect(build).toHaveText("Stop");
  await expect(build).toHaveClass(/\bstop\b/);
  await expect(build).toBeEnabled();
  // Primer's danger button, whatever the theme: neutral at rest, red text,
  // solid red under the pointer. The click left the pointer on it, so move off first.
  await page.mouse.move(0, 0);
  await expect(build).toHaveCSS("background-color", await tokenColour(page, "--btn-danger-bg"));
  await expect(build).toHaveCSS("color", await tokenColour(page, "--btn-danger-fg"));
  await build.hover();
  await expect(build).toHaveCSS("background-color", await tokenColour(page, "--btn-danger-hover-bg"));
  await expect(page.locator("#build-overlay")).toBeVisible();
  const busy = await buildLook(page);
  expect(busy.glyph).toBe("stop");
  // The label swap must not move the buttons beside it under the pointer.
  expect(busy.width).toBe(idle.width);
  // The pinned width is wider than "Stop" needs: the icon and label stay centred in it.
  const margins = await build.evaluate((button) => {
    const outer = button.getBoundingClientRect();
    const shown = [...button.children].filter((child) => getComputedStyle(child).display !== "none");
    const boxes = shown.map((child) => child.getBoundingClientRect());
    return {
      left: Math.min(...boxes.map((box) => box.left)) - outer.left,
      right: outer.right - Math.max(...boxes.map((box) => box.right)),
    };
  });
  expect(Math.abs(margins.left - margins.right), `Stop sits off centre: ${JSON.stringify(margins)}`).toBeLessThan(2);

  await build.click();

  await expect(page.locator("#status-text")).toHaveText("Build stopped.");
  await expect(build).toHaveText("Build PDF");
  await expect(build).not.toHaveClass(/\bstop\b/);
  await expect(build).toBeEnabled();
  await expect(page.locator("#build-overlay")).toBeHidden();
  await expect(page.locator("#error-panel")).toBeHidden();
  // A stop is not a failure: the pane keeps what it showed before the build.
  await expect(page.locator("#pdf-empty")).toHaveText("No PDF yet. Press Build PDF.");
  await expect(page.locator("#download")).toBeDisabled();

  // The worker is the only way to end a compile, so it was killed, and a
  // fresh engine started warming for the next Build.
  expect(await callsTo(page, "BusyTexRunner.terminate")).toHaveLength(1);
  await expect.poll(async () => (await callsTo(page, "BusyTexRunner.initialize")).length).toBe(2);

  expect(appErrors(errors), "the page reported errors around the stop").toEqual([]);
});

test("a build after a stop compiles on the fresh engine", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);
  const build = page.locator("#build");

  await holdCompiles(page);
  await build.click();
  await expect.poll(async () => (await callsTo(page, "LuaLatex.compile")).length).toBe(1);
  await build.click();
  await expect(page.locator("#status-text")).toHaveText("Build stopped.");

  await releaseCompiles(page);
  await build.click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);
  await expect(page.locator('#pdf-body embed[type="application/pdf"]')).toHaveCount(1);
  await expect(page.locator("#download")).toBeEnabled();

  // The second compile ran on the runner built after the stop, not the dead one.
  const constructed = await callsTo(page, "LuaLatex.constructor");
  expect(constructed).toHaveLength(2);
  expect(await callsTo(page, "BusyTexRunner.constructor")).toHaveLength(2);
  expect(await callsTo(page, "BusyTexRunner.terminate")).toHaveLength(1);

  expect(appErrors(errors), "the page reported errors across stop and rebuild").toEqual([]);
});

test("a finished build leaves the engine running", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);

  expect(await callsTo(page, "BusyTexRunner.terminate")).toHaveLength(0);
  expect(await callsTo(page, "BusyTexRunner.constructor")).toHaveLength(1);

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

/**
 * Repository paths the uploads dialog has staged for the build, read from the
 * app's own state module: the dialog no longer prints them.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string[]>}
 */
async function stagedPaths(page) {
  return page.evaluate(async () => {
    const { state } = await import("/web/app/modules/state.js");
    return [...state.uploadedFiles.keys()].sort();
  });
}

/**
 * A staged file's contents as text, read from the app's own state module.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function stagedText(page, path) {
  return page.evaluate(async (path) => {
    const { state } = await import("/web/app/modules/state.js");
    const bytes = state.uploadedFiles.get(path);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }, path);
}

// A map editor save string, in the shape of the files in assets/map-files/.
const MAP_CODE = "eJy10z1LhDEMAOD/0vkNpGmbNrc1bQMuLo7i4MeBB+IL54mD+N89pcMhjnd0CAkZHpL09tPt1w==";

/**
 * An in-memory file: nothing is added to the repository, and the bytes never
 * leave the browser — uploads.js stages them in the virtual filesystem the
 * build compiles from.
 *
 * @param {string} name
 * @param {string} [mimeType]
 * @returns {{name: string, mimeType: string, buffer: Buffer}}
 */
function fakeFile(name, mimeType = "image/png") {
  return { name, mimeType, buffer: Buffer.from("not really an image, and never decoded") };
}

// SCENARIO_NAME's file-safe form, which the dialog names uploads after.
const SLUG = "tier_two_probe";

test("the uploads dialog opens from the header, closes, and names the header after the scenario", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);

  const dialog = page.locator("#upload-dialog");
  const open = page.locator("#upload-open");
  await expect(dialog).toBeHidden();

  await open.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await open.click();
  await expect(dialog).toBeVisible();

  // The status never shows where in the repository a file goes.
  await expect(page.locator("#upload-header-status")).not.toContainText("assets/");
  await expect(page.locator("#upload-maps-status")).not.toContainText("assets/");

  // The header card appears carrying the scenario's name and the file's own
  // extension, whatever the file was called, with a thumbnail of the image
  // and a toast confirming the upload.
  const headerCard = page.locator("#upload-header-card");
  const headerRename = page.locator("#upload-header-name");
  await expect(headerCard).toBeHidden();
  await expect(page.locator("#upload-header-add")).toHaveText("+ Add header image");
  await page.locator("#upload-header").setInputFiles(fakeFile("probe-header.png"));
  await expect(headerCard).toBeVisible();
  await expect(headerCard).toContainText("probe-header.png");
  await expect(headerRename).toHaveValue(`${SLUG}.png`);
  await expect(page.locator("#upload-header-preview")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toHaveText(`Header image uploaded as ${SLUG}.png.`);
  await expect(page.locator("#upload-header-add")).toHaveText("Replace header image");
  expect(await stagedPaths(page)).toEqual([`assets/images/${SLUG}.png`]);

  // Retyping the target name re-stages it; a name with spaces or TeX-hostile
  // characters is normalized, and the box shows the result once left.
  await headerRename.fill("my cover (1) pic");
  await headerRename.blur();
  await expect(headerRename).toHaveValue("my_cover_1_pic.png");
  expect(await stagedPaths(page)).toEqual(["assets/images/my_cover_1_pic.png"]);

  // A JPG keeps its extension; anything LaTeX cannot include is refused and
  // the staged header stays.
  await page.locator("#upload-header").setInputFiles(fakeFile("Photo.JPG", "image/jpeg"));
  await expect(headerRename).toHaveValue(`${SLUG}.jpg`);
  expect(await stagedPaths(page)).toEqual([`assets/images/${SLUG}.jpg`]);
  await page.locator("#upload-header").setInputFiles(fakeFile("art.webp", "image/webp"));
  await expect(page.locator("#upload-header-status")).toHaveClass(/bad/);
  expect(await stagedPaths(page)).toEqual([`assets/images/${SLUG}.jpg`]);

  // Done closes it and hands focus back to the button that opened it; the
  // staged files survive that.
  await page.locator("#upload-done").click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(headerRename).toHaveValue(`${SLUG}.jpg`);
  expect(await stagedPaths(page)).toEqual([`assets/images/${SLUG}.jpg`]);

  // The card's remove button unstages the header and puts the add button back.
  await page.getByRole("button", { name: "Remove header image" }).click();
  await expect(headerCard).toBeHidden();
  await expect(page.locator("#upload-header-add")).toHaveText("+ Add header image");
  expect(await stagedPaths(page)).toEqual([]);

  expect(appErrors(errors), "the page reported errors while uploading").toEqual([]);
});

test("map layouts are named after the scenario and the player counts ticked for each", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);
  await page.locator("#upload-open").click();

  const status = page.locator("#upload-maps-status");
  const maps = page.locator("#upload-maps");

  // Only PNG is accepted; one bad file stages none of the selection.
  await maps.setInputFiles([fakeFile("a.png"), fakeFile("b.jpg", "image/jpeg")]);
  await expect(status).toHaveClass(/bad/);
  expect(await stagedPaths(page)).toEqual([]);

  // One layout: the scenario's plain name.
  await maps.setInputFiles([fakeFile("export.png")]);
  const rows = page.locator("#upload-maps-names .upload-map");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".upload-rename")).toHaveValue(`${SLUG}.png`);
  await expect(rows.first().locator(".upload-preview")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("#toast")).toHaveText("Map image export.png uploaded.");
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}.png`]);

  // Two layouts share a name until their player counts are ticked.
  await rows
    .first()
    .getByRole("button", { name: /remove/i })
    .click();
  await expect(rows).toHaveCount(0);
  await maps.setInputFiles([fakeFile("small.png"), fakeFile("big.png")]);
  await expect(rows).toHaveCount(2);
  await expect(page.locator("#toast")).toHaveText("2 map images uploaded.");
  await expect(status).toHaveClass(/bad/);
  const small = rows.nth(0);
  const big = rows.nth(1);
  await small.getByRole("checkbox", { name: "2", exact: true }).check();
  await small.getByRole("checkbox", { name: "3", exact: true }).check();
  await big.getByRole("checkbox", { name: "4", exact: true }).check();
  await expect(small.locator(".upload-rename")).toHaveValue(`${SLUG}_2-3p.png`);
  await expect(big.locator(".upload-rename")).toHaveValue(`${SLUG}_4p.png`);
  await expect(status).not.toHaveClass(/bad/);
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}_2-3p.png`, `assets/maps/${SLUG}_4p.png`]);

  // The map editor's save string is optional, and travels as a one-line
  // .map file under its layout's name.
  await big.locator(".upload-mapfile-input").fill(MAP_CODE);
  expect(await stagedPaths(page)).toEqual([
    `assets/map-files/${SLUG}_4p.map`,
    `assets/maps/${SLUG}_2-3p.png`,
    `assets/maps/${SLUG}_4p.png`,
  ]);
  expect(await stagedText(page, `assets/map-files/${SLUG}_4p.map`)).toBe(`${MAP_CODE}\n`);

  // A typed name sticks, even when the counts change afterwards, and the
  // map-editor file follows it.
  await big.locator(".upload-rename").fill(`${SLUG}_short`);
  await big.getByRole("checkbox", { name: "5", exact: true }).check();
  await expect(big.locator(".upload-rename")).toHaveValue(`${SLUG}_short.png`);
  expect(await stagedPaths(page)).toEqual([
    `assets/map-files/${SLUG}_short.map`,
    `assets/maps/${SLUG}_2-3p.png`,
    `assets/maps/${SLUG}_short.png`,
  ]);

  expect(appErrors(errors), "the page reported errors while uploading").toEqual([]);
});

test("map images add up across picks, skip the map-editor file, and can be removed", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);
  await page.locator("#upload-open").click();

  const maps = page.locator("#upload-maps");
  const rows = page.locator("#upload-maps-names .upload-map");

  // A second pick adds to the first, with no map-editor file on either.
  await maps.setInputFiles([fakeFile("two.png")]);
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("checkbox", { name: "2", exact: true }).check();
  await maps.setInputFiles([fakeFile("three.png")]);
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole("checkbox", { name: "3", exact: true }).check();
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}_2p.png`, `assets/maps/${SLUG}_3p.png`]);

  // The save string is pasted into a text box, joined back into one line,
  // and unstaged by emptying the box. Anything that is not base64 is flagged
  // and staged as no map file at all.
  const second = rows.nth(1);
  const mapCode = second.getByRole("textbox", { name: "Map editor string for layout 2" });
  await mapCode.fill(`  ${MAP_CODE.slice(0, 20)}\n${MAP_CODE.slice(20)}  `);
  await mapCode.blur();
  await expect(mapCode).toHaveValue(MAP_CODE);
  expect(await stagedText(page, `assets/map-files/${SLUG}_3p.map`)).toBe(`${MAP_CODE}\n`);
  await mapCode.fill("<not a save string>");
  await expect(mapCode).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#upload-maps-status")).toHaveClass(/bad/);
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}_2p.png`, `assets/maps/${SLUG}_3p.png`]);
  await mapCode.fill("");
  await expect(mapCode).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#upload-maps-status")).not.toHaveClass(/bad/);
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}_2p.png`, `assets/maps/${SLUG}_3p.png`]);

  // The add button says there is already a layout.
  await expect(page.locator("#upload-maps-add")).toHaveText("+ Add another map image");

  // Removing a layout unstages it and keeps the other as it was.
  await rows
    .first()
    .getByRole("button", { name: /remove/i })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".upload-rename")).toHaveValue(`${SLUG}_3p.png`);
  expect(await stagedPaths(page)).toEqual([`assets/maps/${SLUG}_3p.png`]);

  expect(appErrors(errors), "the page reported errors while uploading").toEqual([]);
});

/**
 * Puts text in the editor and the cursor after the first "|" in it.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} marked
 * @returns {Promise<void>}
 */
async function setEditor(page, marked) {
  await page.evaluate((marked) => {
    const cm = /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror;
    const at = marked.indexOf("|");
    cm.setValue(marked.replace("|", ""));
    cm.focus();
    cm.setCursor(cm.posFromIndex(at));
  }, marked);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} line
 * @returns {Promise<string>}
 */
async function editorLine(page, line) {
  return page.evaluate(
    (line) => /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getLine(line),
    line,
  );
}

test("the editor suggests uploaded image paths, by keyboard and by mouse", async ({ app }) => {
  const { page, errors } = app;
  await enterWorkspace(page);
  await page.locator("#upload-open").click();
  await page.locator("#upload-header").setInputFiles(fakeFile("cover.png"));
  await page.locator("#upload-maps").setInputFiles([fakeFile("small.png"), fakeFile("big.png")]);
  const rows = page.locator("#upload-maps-names .upload-map");
  await rows.nth(0).getByRole("checkbox", { name: "2", exact: true }).check();
  await rows.nth(1).getByRole("checkbox", { name: "4", exact: true }).check();
  await page.locator("#upload-done").click();

  const list = page.locator("#image-autocomplete");
  const options = list.getByRole("option");
  const header = "\\addscenariosection{1}{Clash Scenario}{Probe}";
  const graphics = "\\includegraphics[width=\\linewidth]";

  // Ctrl-Space in the header's image argument offers the header image only;
  // Enter writes it in.
  await setEditor(page, `${header}{|}\n${graphics}{}\n`);
  await expect(list).toBeHidden();
  await page.keyboard.press("Control+Space");
  await expect(options).toHaveText([`\\images/${SLUG}.png`]);
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  expect(await editorLine(page, 0)).toBe(`${header}{\\images/${SLUG}.png}`);

  // Typing inside \includegraphics opens the list by itself, narrowed to what
  // was typed. Arrows move the highlight and wrap; Escape closes it.
  await setEditor(page, `${graphics}{|}`);
  await page.keyboard.type("\\maps/");
  await expect(options).toHaveText([`\\maps/${SLUG}_2p.png`, `\\maps/${SLUG}_4p.png`]);
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  expect(await editorLine(page, 0)).toBe(`${graphics}{\\maps/}`);

  // Typing on narrows the list; the Tab key picks as Enter does.
  await page.keyboard.type("tier_two_probe_4");
  await expect(options).toHaveText([`\\maps/${SLUG}_4p.png`]);
  await page.keyboard.press("Tab");
  expect(await editorLine(page, 0)).toBe(`${graphics}{\\maps/${SLUG}_4p.png}`);

  // A click picks too, replacing the whole path the cursor was in, and
  // leaves the editor focused.
  await setEditor(page, `${graphics}{\\maps/|old.png}`);
  await page.keyboard.press("Control+Space");
  await expect(options).toHaveCount(2);
  await options.nth(0).hover();
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await options.nth(1).click();
  await expect(list).toBeHidden();
  expect(await editorLine(page, 0)).toBe(`${graphics}{\\maps/${SLUG}_4p.png}`);
  await expect(page.locator(".CodeMirror textarea")).toBeFocused();

  // Deleting inside an argument opens the list too, after a short pause,
  // with no character typed: the path left over is what it narrows by.
  await setEditor(page, `${header}{\\images/old|.png}`);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await expect(options).toHaveText([`\\images/${SLUG}.png`]);
  await page.keyboard.press("Enter");
  expect(await editorLine(page, 0)).toBe(`${header}{\\images/${SLUG}.png}`);

  // Outside an image argument, Ctrl-Space offers nothing.
  await setEditor(page, "Plain text|");
  await page.keyboard.press("Control+Space");
  await expect(list).toBeHidden();

  expect(appErrors(errors), "the page reported errors while completing").toEqual([]);
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

  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", String(before === "dark"));
  await chooseFromMenu(page, "theme-toggle");
  await expect(html).toHaveAttribute("data-theme", after);
  // "Dark mode" is a checkbox item: checked exactly when the theme is dark.
  await expect(toggle).toHaveAttribute("aria-checked", String(after === "dark"));
  // CodeMirror is themed along with the document.
  await expect(page.locator(".CodeMirror")).toHaveClass(after === "dark" ? /cm-s-github-dark/ : /cm-s-github-light/);

  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe(after);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after);
  await expect(toggle).toHaveAttribute("aria-checked", String(after === "dark"));

  expect(appErrors(errors), "the page reported errors around the theme toggle").toEqual([]);
});

test.describe("signed in", () => {
  const REPO_PATH = "/repos/qwrtln/Homm3BG-mission-book";
  test.use({
    githubRoutes: [
      [
        { method: "GET", path: "/user", body: { login: "octotester" } },
        {
          method: "GET",
          path: REPO_PATH,
          body: {
            name: "Homm3BG-mission-book",
            owner: { login: "qwrtln" },
            default_branch: "main",
            permissions: { push: true },
          },
        },
        { method: "GET", path: `${REPO_PATH}/branches`, body: [] },
      ],
      { option: true },
    ],
  });

  test("the overflow menu works from the keyboard", async ({ app }) => {
    const { page, errors } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.reload();
    await enterWorkspace(page);

    const toggle = page.locator("#header-menu-toggle");
    const menu = page.locator("#header-menu");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Signed in: Dark mode, then Sign out. Arrows move and wrap.
    await expect(page.locator("#theme-toggle")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#github-signout")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#theme-toggle")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#github-signout")).toBeFocused();

    // Escape closes and returns focus to the button.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    // A click outside closes it too.
    await toggle.click();
    await expect(menu).toBeVisible();
    await page.locator("#status-bar").click();
    await expect(menu).toBeHidden();

    expect(appErrors(errors), "the page reported errors in the menu").toEqual([]);
  });
});

test("the header names the open scenario, and follows a different one", async ({ app }) => {
  const { page, errors } = app;
  await expect(page.locator("#header-titles")).toBeVisible();
  await expect(page.locator("#header-scenario")).toBeHidden();

  await enterWorkspace(page);
  await expect(page.locator("#scenario-title")).toHaveText(SCENARIO_NAME);
  // The app title is for the welcome screen only.
  await expect(page.locator("#header-titles")).toBeHidden();

  await page.locator("#back-to-welcome").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#header-titles")).toBeVisible();

  await page.locator("#scratch-coop").click();
  await page.locator("#scenario-name").fill("Another Probe");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#scenario-title")).toHaveText("Another Probe");

  expect(appErrors(errors), "the page reported errors while switching scenarios").toEqual([]);
});

test.describe("at 1024×700", () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test("the workspace header is one row", async ({ app }) => {
    const { page, errors } = app;
    await enterWorkspace(page);

    // Every shown control's vertical centre is on one line, give or take the
    // pixel that differing heights round to.
    const centres = await page.evaluate(() =>
      [...document.querySelectorAll("header button, header a, #scenario-title")]
        .filter((node) => node instanceof HTMLElement && node.offsetParent !== null && !node.closest("[role=menu]"))
        .map((node) => {
          const box = node.getBoundingClientRect();
          return box.top + box.height / 2;
        }),
    );
    expect(centres.length).toBeGreaterThan(3);
    const spread = Math.max(...centres) - Math.min(...centres);
    expect(spread, `header controls sit at centres ${JSON.stringify(centres)}`).toBeLessThan(4);
    const header = await page.locator("header").boundingBox();
    expect(header?.height).toBeLessThan(60);

    expect(appErrors(errors), "the page reported errors at 1024px").toEqual([]);
  });
});

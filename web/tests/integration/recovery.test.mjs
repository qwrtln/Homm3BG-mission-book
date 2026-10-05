// Tier 2. Phase 2 of crash recovery: the IndexedDB copy that backs both the
// editor text and the staged uploads, so a whole-browser crash (not just a
// tab crash) loses neither. See web/app/modules/local-store.js.

import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.js";
import { expect, READY_STATUS, test } from "./fixtures.mjs";

const LOGIN = "octotester";
const TOKEN_KEY = "github_token";
const TOKEN = "gh-tier2-token";
const REPO_PATH = `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

const MEMBER_ROUTES = [
  { method: "GET", path: "/user", body: { login: LOGIN } },
  {
    method: "GET",
    path: REPO_PATH,
    body: {
      name: UPSTREAM_REPO,
      owner: { login: UPSTREAM_OWNER },
      default_branch: "main",
      permissions: { push: true },
    },
  },
];

/**
 * Playwright reads a bare array given to test.use() as a [value, options]
 * tuple, so a route list must be wrapped or the stub receives one route
 * object instead of the list.
 *
 * @param {import("./fixtures.mjs").GithubRoute[]} list
 * @returns {[import("./fixtures.mjs").GithubRoute[], {option: true}]}
 */
function routes(list) {
  return [list, { option: true }];
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function signInAs(page) {
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  await page.reload();
}

/**
 * Opens a blank Clash scenario from the welcome screen's "Start blank"
 * option, under the given name.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @returns {Promise<void>}
 */
async function openBlankClash(page, name) {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(name);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>} state.chosenPath, which must not be null here
 */
async function chosenPath(page) {
  return page.evaluate(() => {
    const state = /** @type {AppState} */ (globalThis.__state);
    if (state.chosenPath === null) throw new Error("no scenario is open");
    return state.chosenPath;
  });
}

/**
 * The local-store record for a path, read through the app's __localStore hook, with
 * each upload's bytes reduced to a length (Uint8Array does not survive
 * Playwright's serialization as itself).
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<{text: string | null, uploads: {path: string, length: number}[] | null}>}
 */
async function readLocalRecord(page, path) {
  return page.evaluate(async (p) => {
    const { loadRecord } = /** @type {NonNullable<Window["__localStore"]>} */ (globalThis.__localStore);
    const record = await loadRecord(p);
    return {
      text: record.text,
      uploads: record.uploads ? record.uploads.map((u) => ({ path: u.path, length: u.bytes.byteLength })) : null,
    };
  }, path);
}

/**
 * Seeds a local-store record directly, bypassing the UI — for seeding a
 * stored upload set before a reload, the way routes.test.mjs seeds
 * localStorage drafts.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {{text?: string, uploads?: {path: string, length: number}[]}} fields
 * @returns {Promise<void>}
 */
async function seedLocalRecord(page, path, fields) {
  await page.evaluate(
    async ([p, f]) => {
      const { saveText, saveUploads } = /** @type {NonNullable<Window["__localStore"]>} */ (globalThis.__localStore);
      if (f.text !== undefined) await saveText(p, f.text);
      if (f.uploads !== undefined) {
        await saveUploads(
          p,
          f.uploads.map((u) => ({ path: u.path, bytes: new Uint8Array(u.length) })),
        );
      }
    },
    [path, fields],
  );
}

/**
 * Repository paths the uploads dialog has staged, read from the app's __state
 * hook.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string[]>}
 */
async function stagedPaths(page) {
  return page.evaluate(() => {
    const state = /** @type {AppState} */ (globalThis.__state);
    return [...state.uploadedFiles.keys()].sort();
  });
}

/**
 * @param {string} name
 * @returns {{name: string, mimeType: string, buffer: Buffer}}
 */
function fakeImage(name) {
  return { name, mimeType: "image/png", buffer: Buffer.from("not really an image") };
}

test("typing updates the IndexedDB text record within about a second", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page, "Recovery Probe");
  const path = await chosenPath(page);

  await page.locator(".CodeMirror").click();
  await page.keyboard.type("% typed for crash recovery\n");
  const typed = await page.evaluate(() =>
    /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
  );

  await expect.poll(async () => (await readLocalRecord(page, path)).text, { timeout: 1500 }).toBe(typed);
});

test("a staged upload is in the IndexedDB record immediately after staging", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page, "Upload Recovery Probe");
  const path = await chosenPath(page);

  await expect(readLocalRecord(page, path)).resolves.toMatchObject({ uploads: null });

  await page.locator("#upload-open").click();
  await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
  await expect(page.locator("#upload-header-card")).toBeVisible();

  await expect.poll(async () => (await readLocalRecord(page, path)).uploads?.length ?? 0).toBe(1);
  const [staged] = (await readLocalRecord(page, path)).uploads ?? [];
  expect(staged.path).toMatch(/^assets\/images\//);
});

test("a header image staged on a local-only draft is staged again after a reload", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page, "Reload Recovery Probe");
  const path = await chosenPath(page);

  await page.locator("#upload-open").click();
  await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
  await expect(page.locator("#upload-header-card")).toBeVisible();
  await expect.poll(async () => (await readLocalRecord(page, path)).uploads?.length ?? 0).toBe(1);
  const [before] = await stagedPaths(page);

  await page.reload();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect.poll(() => stagedPaths(page)).toEqual([before]);
});

test.describe("category move carries the stored record to the new path", () => {
  test("text and uploads both move, and nothing is left under the old path", async ({ app }) => {
    const { page } = app;
    await openBlankClash(page, "Category Move Probe");
    const old = await chosenPath(page);

    await page.locator("#upload-open").click();
    await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
    await expect(page.locator("#upload-header-card")).toBeVisible();
    await page.locator("#upload-done").click();
    await page.locator(".CodeMirror").click();
    await page.keyboard.type("% moving\n");
    const text = await page.evaluate(() =>
      /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
    );
    await expect.poll(async () => (await readLocalRecord(page, old)).text).toBe(text);

    await page.locator("#scenario-category").selectOption("coops");
    const next = old.replace("/clash/", "/coops/");
    // The standard heading kind follows the category, so the moved text
    // is not byte-for-byte the pre-move text.
    const moved = await page.evaluate(() =>
      /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
    );

    await expect.poll(async () => (await readLocalRecord(page, next)).text).toBe(moved);
    await expect.poll(async () => (await readLocalRecord(page, next)).uploads?.length ?? 0).toBe(1);
    await expect.poll(async () => readLocalRecord(page, old)).toEqual({ text: null, uploads: null });
  });
});

test.describe("a stored upload set offered against a branch's own assets", () => {
  const BRANCH_PATH = "draft-scenarios/clash/half_written.tex";
  const BRANCH_TEXT = "% from branch\n";
  const ASSET_PATH = "assets/images/half_written.png";

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES,
      { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
      {
        method: "GET",
        path: /\/compare\//,
        body: {
          files: [
            { filename: BRANCH_PATH, sha: "tex-sha", status: "added" },
            { filename: ASSET_PATH, sha: "asset-sha", status: "added" },
          ],
        },
      },
      {
        method: "GET",
        path: /\/contents\/draft-scenarios\/clash\/half_written\.tex/,
        body: { content: btoa(BRANCH_TEXT) },
      },
      { method: "GET", path: /\/git\/blobs\//, body: { content: btoa("not really a png") } },
    ]),
  });

  test("the dialog shows when the stored set differs; Cancel restores it", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, BRANCH_PATH, { text: BRANCH_TEXT, uploads: [{ path: ASSET_PATH, length: 11 }] });
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto("/web/app/?iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth#/drafts/clash/half_written");
    await page.reload();

    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("Discard unsaved edits in this browser?");
    await page.locator("#confirm-cancel").click();

    await expect(page.locator("#workspace")).toBeVisible();
    await expect.poll(() => stagedPaths(page)).toEqual([ASSET_PATH]);
  });

  test("removing every upload still differs from a branch that has one", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, BRANCH_PATH, { text: BRANCH_TEXT, uploads: [] });
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto("/web/app/?iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth#/drafts/clash/half_written");
    await page.reload();

    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("Discard unsaved edits in this browser?");
  });
});

test.describe("a successful GitHub save", () => {
  const NAME = "Save Recovery Probe";

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES,
      { method: "GET", path: `${REPO_PATH}/branches`, body: [] },
      { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
      { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
      { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
      { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
      { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
      { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
      { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: "refs/heads/does-not-matter" } },
    ]),
  });

  test("clears the stored upload set but keeps the stored text", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page, NAME);
    const path = await chosenPath(page);

    await page.locator("#upload-open").click();
    await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
    await expect(page.locator("#upload-header-card")).toBeVisible();
    await page.locator("#upload-done").click();
    await expect.poll(async () => (await readLocalRecord(page, path)).uploads?.length ?? 0).toBe(1);

    const text = await page.evaluate(() =>
      /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
    );
    await page.locator("#github-save").click();
    await expect(page.locator("#status-text")).toContainText("Saved to");

    await expect.poll(async () => (await readLocalRecord(page, path)).uploads).toBe(null);
    expect((await readLocalRecord(page, path)).text).toBe(text);
  });
});

test.describe("signing out", () => {
  test.use({ githubRoutes: routes([...MEMBER_ROUTES, { method: "GET", path: `${REPO_PATH}/branches`, body: [] }]) });

  test("deletes the whole stored record, text and uploads together", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page, "Signout Recovery Probe");
    const path = await chosenPath(page);

    await page.locator("#upload-open").click();
    await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
    await expect(page.locator("#upload-header-card")).toBeVisible();
    await page.locator("#upload-done").click();
    await page.locator(".CodeMirror").click();
    await page.keyboard.type("x");
    await expect.poll(async () => (await readLocalRecord(page, path)).uploads?.length ?? 0).toBe(1);

    await page.locator("#header-menu-toggle").click();
    await expect(page.locator("#header-menu")).toBeVisible();
    await page.locator("#github-signout").click();

    await expect(page.locator("#welcome")).toBeVisible();
    await expect.poll(() => readLocalRecord(page, path)).toEqual({ text: null, uploads: null });
  });
});

// Tier 2. The gate in front of "Open PR": a new scenario must be saved and
// built from its saved text, and a contributor who is not a project member
// ticks the pre-submit checklist first. The engine is stubbed and GitHub is
// faked, as in github.test.mjs and member-modes.test.mjs; the sign-in is a
// token seeded into localStorage.

import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.js";
import { CHECKLIST_ITEMS, pullRequestBody } from "../../shared/submit-checklist.js";
import { engineCalls, expect, openScenarioList, test } from "./fixtures.mjs";

const TOKEN_KEY = "github_token";
const TOKEN = "gh-tier2-token";
const LOGIN = "octotester";
const UPSTREAM_PATH = `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
const PR_URL = `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pull/7`;

const UNSAVED = "Save your changes";
const UNBUILT = "Build the PDF from your saved text";
const BUILDING = "Wait for the build to finish";

/**
 * Who is signed in. A contributor saves to a fork they already have; a
 * member saves to the upstream repository.
 *
 * @param {{push: boolean}} options
 * @returns {import("./fixtures.mjs").GithubRoute[]}
 */
function identityRoutes({ push }) {
  return [
    { method: "GET", path: "/user", body: { login: LOGIN } },
    {
      method: "GET",
      path: UPSTREAM_PATH,
      body: { name: UPSTREAM_REPO, owner: { login: UPSTREAM_OWNER }, default_branch: "main", permissions: { push } },
    },
    {
      method: "GET",
      path: `/repos/${LOGIN}/${UPSTREAM_REPO}`,
      body: { name: UPSTREAM_REPO, owner: { login: LOGIN }, default_branch: "main" },
    },
    { method: "GET", path: /\/branches(\?|$)/, body: [] },
  ];
}

/** A save to any branch of either repository, and a pull request opened for it. */
const SAVE_AND_PR_ROUTES = [
  { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
  { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
  { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
  { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
  { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
  { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
  { method: "POST", path: /\/git\/refs$/, body: { ref: "refs/heads/x" } },
  { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: "refs/heads/x" } },
  { method: "GET", path: /\/pulls\?/, body: [] },
  { method: "POST", path: /\/pulls$/, status: 201, body: { html_url: PR_URL, number: 7 } },
];

/**
 * Playwright reads a bare array given to test.use() as a [value, options]
 * tuple, so a route list has to be wrapped. See github.test.mjs.
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
  await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
}

/**
 * Records every api.github.com request the page makes from now on.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {{method: string, url: string, body: string | null}[]} filled as they happen
 */
function recordGithubRequests(page) {
  /** @type {{method: string, url: string, body: string | null}[]} */
  const seen = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "api.github.com") return;
    seen.push({ method: request.method(), url: request.url(), body: request.postData() });
  });
  return seen;
}

/**
 * The pull requests the page asked GitHub to create.
 *
 * @param {{method: string, url: string, body: string | null}[]} seen
 * @returns {{title: string, body: string}[]}
 */
function createdPulls(seen) {
  return seen.filter((r) => r.method === "POST" && r.url.endsWith("/pulls")).map((r) => JSON.parse(r.body ?? "{}"));
}

/**
 * Opens a blank Clash scenario: a template pick, so no published PDF is shown.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openBlankClash(page) {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill("Checklist Probe");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText("Ready.");
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function save(page) {
  await page.locator("#github-save").click();
  await expect(page.locator("#status-text")).toContainText("Saved to ");
  await expect(page.locator("#github-open-pr")).toBeVisible();
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function build(page) {
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function edit(page) {
  await page.locator(".CodeMirror").click();
  await page.keyboard.type("x");
  await expect(page.locator("#unsaved-note")).toBeVisible();
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {import("@playwright/test").Locator}
 */
function boxes(page) {
  return page.locator("#submit-checklist input[type=checkbox]");
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function tickAll(page) {
  for (const box of await boxes(page).all()) await box.check();
}

/**
 * Clicks Open PR and waits for the dialog.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<import("@playwright/test").Locator>} the dialog
 */
async function openDialog(page) {
  await page.locator("#github-open-pr").click();
  const dialog = page.locator("#submit-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#submit-title")).toHaveText("Before you open a pull request");
  return dialog;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string[]} expected the unmet conditions, in order
 * @returns {Promise<void>}
 */
async function expectBlockers(page, expected) {
  const list = page.locator("#submit-blockers");
  if (expected.length === 0) await expect(list).toBeHidden();
  else await expect(list).toBeVisible();
  await expect(list.locator("li")).toHaveText(expected);
}

test.describe("a contributor opening a new scenario's pull request", () => {
  test.use({ githubRoutes: routes([...identityRoutes({ push: false }), ...SAVE_AND_PR_ROUTES]) });

  test("saved but never built: the build condition is listed and the checklist cannot be ticked", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);

    await openDialog(page);
    await expectBlockers(page, [UNBUILT]);
    await expect(boxes(page)).toHaveCount(CHECKLIST_ITEMS.length);
    for (const box of await boxes(page).all()) await expect(box).toBeDisabled();
    await expect(page.locator("#submit-confirm")).toBeDisabled();
  });

  test("built then edited: save, then build, then only the ticks remain", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);
    await edit(page);

    await openDialog(page);
    await expectBlockers(page, [UNSAVED]);
    // Built but not saved is not enough: the checklist stays locked.
    for (const box of await boxes(page).all()) await expect(box).toBeDisabled();
    await page.locator("#submit-cancel").click();

    await save(page);
    await openDialog(page);
    await expectBlockers(page, [UNBUILT]);
    await page.locator("#submit-cancel").click();

    await build(page);
    await openDialog(page);
    await expectBlockers(page, []);
    await expect(page.locator("#submit-confirm")).toBeDisabled();
    await tickAll(page);
    await expect(page.locator("#submit-confirm")).toBeEnabled();
  });

  test("an upload changed and saved after the build: the build condition is listed", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);

    await page.locator("#upload-open").click();
    await page.locator("#upload-header").setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from("not really an image, and never decoded"),
    });
    await expect(page.locator("#upload-header-card")).toBeVisible();
    await page.locator("#upload-done").click();
    await save(page);

    await openDialog(page);
    await expectBlockers(page, [UNBUILT]);
  });

  test("a build running when the dialog opens is re-checked when it ends", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await page.evaluate(() => {
      globalThis.__stubCompileHold = new Promise((resolve) => {
        globalThis.__releaseCompileHold = resolve;
      });
    });
    await page.locator("#build").click();
    await expect
      .poll(async () => (await engineCalls(page)).some((call) => call.method === "LuaLatex.compile"))
      .toBe(true);

    await openDialog(page);
    await expectBlockers(page, [UNBUILT, BUILDING]);
    await expect(boxes(page).first()).toBeDisabled();
    await expect(page.locator("#submit-confirm")).toBeDisabled();

    await page.evaluate(() => {
      globalThis.__stubCompileHold = null;
      globalThis.__releaseCompileHold();
    });
    await expectBlockers(page, []);
    await tickAll(page);
    await expect(page.locator("#submit-confirm")).toBeEnabled();
  });

  test("a save running when the dialog opens is re-checked when it ends", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);
    await edit(page);
    // Registered after the GitHub stub, so it runs first: hold the second
    // save's ref update, then hand the request on to the stub.
    /** @type {() => void} */
    let release = () => {};
    const held = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    await page.route(/\/git\/refs\/heads\//, async (route) => {
      if (route.request().method() === "PATCH") await held;
      await route.fallback();
    });
    await page.locator("#github-save").click();
    await expect(page.locator("#status-text")).toContainText("Saving");

    await openDialog(page);
    await expectBlockers(page, [UNSAVED]);
    release();
    await expectBlockers(page, [UNBUILT]);
  });

  test("all met and all ticked by keyboard: the pull request carries the checklist", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);
    const seen = recordGithubRequests(page);

    await openDialog(page);
    await expectBlockers(page, []);
    await expect(page.locator("#submit-cancel")).toBeFocused();
    // Tab reaches every box, and Space ticks it.
    await boxes(page).first().focus();
    for (let i = 0; i < CHECKLIST_ITEMS.length; i += 1) {
      await expect(boxes(page).nth(i)).toBeFocused();
      await page.keyboard.press("Space");
      await expect(boxes(page).nth(i)).toBeChecked();
      await page.keyboard.press("Tab");
    }
    await expect(page.locator("#submit-dialog em").first()).toHaveText("Quick Combat");
    await page.locator("#submit-confirm").click();

    await expect(page.locator("#submit-dialog")).toBeHidden();
    await expect(page.locator("#github-pr-link")).toBeVisible();
    const pulls = createdPulls(seen);
    expect(pulls).toHaveLength(1);
    expect(pulls[0].body).toBe(pullRequestBody(CHECKLIST_ITEMS));
  });

  test("Cancel, then reopen: every box is unticked again", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);
    const seen = recordGithubRequests(page);

    await openDialog(page);
    await tickAll(page);
    await page.locator("#submit-cancel").click();
    await expect(page.locator("#submit-dialog")).toBeHidden();

    await openDialog(page);
    for (const box of await boxes(page).all()) await expect(box).not.toBeChecked();
    await expect(page.locator("#submit-confirm")).toBeDisabled();

    // Escape cancels too, and hands focus back to Open PR.
    await page.keyboard.press("Escape");
    await expect(page.locator("#submit-dialog")).toBeHidden();
    await expect(page.locator("#github-open-pr")).toBeFocused();
    expect(createdPulls(seen)).toEqual([]);
    await expect(page.locator("#status-text")).not.toContainText("PR");
  });
});

test.describe("a member opening a new scenario's pull request", () => {
  test.use({ githubRoutes: routes([...identityRoutes({ push: true }), ...SAVE_AND_PR_ROUTES]) });

  test("saved and built: no dialog, and the body is the fixed line", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);
    await build(page);
    const seen = recordGithubRequests(page);

    await page.locator("#github-open-pr").click();

    await expect(page.locator("#github-pr-link")).toBeVisible();
    await expect(page.locator("#submit-dialog")).toBeHidden();
    const pulls = createdPulls(seen);
    expect(pulls).toHaveLength(1);
    expect(pulls[0].body).toBe(pullRequestBody([]));
  });

  test("unbuilt: the dialog lists the build condition, with no checkboxes", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await openBlankClash(page);
    await save(page);

    await openDialog(page);
    await expectBlockers(page, [UNBUILT]);
    await expect(page.locator("#submit-checklist")).toBeHidden();
    await expect(page.locator("#submit-confirm")).toBeDisabled();
  });
});

test.describe("a member editing a scenario in place", () => {
  test.use({
    githubRoutes: routes([
      ...identityRoutes({ push: true }),
      // No earlier edit branch: the save creates one.
      { method: "GET", path: /\/git\/ref\/heads\/.*updates/, status: 404, body: { message: "Not Found" } },
      ...SAVE_AND_PR_ROUTES,
    ]),
  });

  test("dirty and unbuilt: no dialog, and the pull request opens", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await page.locator("#mode-edit").click();
    const results = await openScenarioList(page);
    await results.first().dispatchEvent("mousedown");
    await page.locator("#go").click();
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#status-text")).toHaveText("Ready.");
    await save(page);
    await edit(page);
    const seen = recordGithubRequests(page);

    await page.locator("#github-open-pr").click();

    await expect(page.locator("#github-pr-link")).toBeVisible();
    await expect(page.locator("#submit-dialog")).toBeHidden();
    expect(createdPulls(seen)).toHaveLength(1);
  });
});

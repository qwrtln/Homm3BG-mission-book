// Tier 2. Moving between the welcome screen and the editor: the Back button,
// the unsaved-changes note and prompt, the loading screen for an address, and
// the welcome screen's data surviving a round trip.

import { test, expect } from "./fixtures.mjs";

const LOGIN = "octotester";
const REPO_PATH = "/repos/qwrtln/Homm3BG-mission-book";

/** @param {import("@playwright/test").Page} page */
async function startClash(page, name = "Nav Probe") {
  await page.locator('[data-category="clash"]').click();
  await page.locator("#scenario-name").fill(name);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
}

/** @param {import("@playwright/test").Page} page @param {string} text */
async function typeInEditor(page, text) {
  await page.evaluate((t) => {
    /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.replaceRange(t, { line: 0, ch: 0 });
  }, text);
}

test("Back is only on the editor screen, and returns to welcome", async ({ app }) => {
  const { page } = app;
  await expect(page.locator("#back-to-welcome")).toBeHidden();
  await startClash(page);
  await expect(page.locator("#back-to-welcome")).toBeVisible();

  await page.locator("#back-to-welcome").click();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  await expect(page.locator("#back-to-welcome")).toBeHidden();
  expect(new URL(page.url()).hash).toBe("");
});

test("an untouched scenario leaves without asking, and shows no unsaved note", async ({ app }) => {
  const { page } = app;
  await startClash(page);
  await expect(page.locator("#unsaved-note")).toBeHidden();

  await page.locator("#back-to-welcome").click();

  await expect(page.locator("#confirm-dialog")).toBeHidden();
  await expect(page.locator("#welcome")).toBeVisible();
});

// The "● Unsaved changes" note is only shown signed in: signed out, there is
// no pull request to lose the changes to, only the browser's own autosave
// (already covered by leaveWorkspace's confirm dialog below), so the note
// would just be noise. See dirty.js's refreshUnsavedNote.
test.describe("signed in", () => {
  test.use({
    githubRoutes: [[
      { method: "GET", path: "/user", body: { login: LOGIN } },
      { method: "GET", path: REPO_PATH, body: { name: "Homm3BG-mission-book", owner: { login: "qwrtln" }, default_branch: "main", permissions: { push: true } } },
      { method: "GET", path: `${REPO_PATH}/branches`, body: [] },
    ], { option: true }],
  });

  test("editing shows the unsaved note; Back asks, Cancel stays, Leave goes", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.reload();
    await startClash(page);
    await typeInEditor(page, "% edit\n");
    await expect(page.locator("#unsaved-note")).toBeVisible();

    await page.locator("#back-to-welcome").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("Leave with unsaved changes?");
    await page.locator("#confirm-cancel").click();
    await expect(page.locator("#workspace")).toBeVisible();

    await page.locator("#back-to-welcome").click();
    await page.locator("#confirm-ok").click();
    await expect(page.locator("#welcome")).toBeVisible();
  });

  test("undoing the edit clears the unsaved note", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.reload();
    await startClash(page);
    await typeInEditor(page, "% edit\n");
    await expect(page.locator("#unsaved-note")).toBeVisible();
    await page.evaluate(() => /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.undo());
    await expect(page.locator("#unsaved-note")).toBeHidden();
  });

  test("a restored autosave counts as unsaved", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => {
      localStorage.setItem("github_token", "t");
      localStorage.setItem("wasm-scenario-builder:draft:draft-scenarios/clash/nav_probe.tex", "% local only\n");
    });
    await page.reload();
    await startClash(page);
    await expect(page.locator("#unsaved-note")).toBeVisible();
  });
});

test("the same scenario can be opened again after going back", async ({ app }) => {
  const { page } = app;
  await startClash(page);
  await typeInEditor(page, "% keep me\n");
  await page.locator("#back-to-welcome").click();
  await page.locator("#confirm-ok").click();

  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  const value = await page.evaluate(() => /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue());
  expect(value).toContain("% keep me");
});

/** @type {(value?: unknown) => void} */
let releaseUser = () => {};
const userHeld = new Promise((resolve) => { releaseUser = resolve; });

test.describe("an address opened while GitHub is slow", () => {
  test.use({
    githubRoutes: [[
      { method: "GET", path: "/user", body: { login: LOGIN }, hold: userHeld },
      { method: "GET", path: REPO_PATH, body: { name: "Homm3BG-mission-book", owner: { login: "qwrtln" }, default_branch: "main", permissions: { push: true } } },
      { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
      { method: "GET", path: /\/compare\//, body: { files: [{ filename: "draft-scenarios/clash/half_written.tex", sha: "s", status: "added" }] } },
      { method: "GET", path: /\/contents\/draft-scenarios\/clash\/half_written\.tex/, body: { content: btoa("% from branch\n") } },
    ], { option: true }],
  });

  test("shows a loading screen, never the welcome screen, then the editor", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto("/web/app/#/drafts/clash/half_written");
    const reload = page.reload();

    await expect(page.locator("#route-loading")).toBeVisible();
    await expect(page.locator("#welcome")).toBeHidden();

    releaseUser();
    await reload;
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#route-loading")).toBeHidden();
    await expect(page.locator("#welcome")).toBeHidden();
  });
});

test("an address that matches nothing ends on welcome, with no loading screen left", async ({ app }) => {
  const { page } = app;
  await page.goto("/web/app/#/drafts/clash/nope");
  await page.reload();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#route-loading")).toBeHidden();
});

test("the plain address shows welcome at once, with no loading screen", async ({ app }) => {
  const { page } = app;
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#route-loading")).toBeHidden();
});

test.describe("going back to a welcome screen that already has data", () => {
  test.use({
    githubRoutes: [[
      { method: "GET", path: "/user", body: { login: LOGIN } },
      { method: "GET", path: REPO_PATH, body: { name: "Homm3BG-mission-book", owner: { login: "qwrtln" }, default_branch: "main", permissions: { push: true } } },
      { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
      { method: "GET", path: /\/compare\//, body: { files: [{ filename: "draft-scenarios/clash/half_written.tex", sha: "s", status: "added" }] } },
    ], { option: true }],
  });

  test("shows the resume list instantly, without a loading state, and refreshes quietly", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.reload();
    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);

    await startClash(page);
    const refreshed = page.waitForRequest((r) => new URL(r.url()).pathname === "/user");
    await page.locator("#back-to-welcome").click();

    // At once: the list is already there, and the searching line never comes back.
    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-loading")).toBeHidden();
    await refreshed; // ...and the data was still fetched again in the background
    await expect(page.locator("#resume-loading")).toBeHidden();
    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
  });
});

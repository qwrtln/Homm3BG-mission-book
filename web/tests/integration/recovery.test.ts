// Tier 2. Phase 2 of crash recovery: the IndexedDB copy that backs both the
// editor text and the staged uploads, so a whole-browser crash (not just a
// tab crash) loses neither. See web/app/modules/local-store.ts.

import type { Page } from "@playwright/test";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.ts";
import { editorBox, editorText } from "../helpers/editor.ts";
import { seedLocalRecord } from "../helpers/local-store.ts";
import { expect, type GithubRoute, READY_STATUS, test } from "./fixtures.ts";

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
 * @param list
 */
function routes(list: GithubRoute[]): [GithubRoute[], { scope: "test" }] {
  // Playwright's typings model the options as { scope }; `option` is what it reads at runtime.
  return [list, { option: true } as unknown as { scope: "test" }];
}

async function signInAs(page: Page): Promise<void> {
  await page.addInitScript(([key, token]: [string, string]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN] as [
    string,
    string,
  ]);
  await page.reload();
}

/**
 * Opens a blank Clash scenario from the welcome screen's "Start blank"
 * option, under the given name.
 *
 * @param page
 * @param name
 */
async function openBlankClash(page: Page, name: string): Promise<void> {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(name);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * @param page
 * @returns state.chosenPath, which must not be null here
 */
async function chosenPath(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = globalThis.__state!;
    if (state.chosenPath === null) throw new Error("no scenario is open");
    return state.chosenPath;
  });
}

/**
 * The local-store record for a path, read through the app's __localStore hook, with
 * each upload's bytes reduced to a length (Uint8Array does not survive
 * Playwright's serialization as itself).
 *
 * @param page
 * @param path
 */
async function readLocalRecord(
  page: Page,
  path: string,
): Promise<{ text: string | null; uploads: { path: string; length: number }[] | null }> {
  return page.evaluate(async (p) => {
    const { loadRecord } = globalThis.__localStore!;
    const record = await loadRecord(p);
    return {
      text: record.text,
      uploads: record.uploads ? record.uploads.map((u) => ({ path: u.path, length: u.bytes.byteLength })) : null,
    };
  }, path);
}

/**
 * Repository paths the uploads dialog has staged, read from the app's __state
 * hook.
 *
 * @param page
 */
async function stagedPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const state = globalThis.__state!;
    return [...state.uploadedFiles.keys()].sort();
  });
}

function fakeImage(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "image/png", buffer: Buffer.from("not really an image") };
}

test("typing updates the IndexedDB text record within about a second", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page, "Recovery Probe");
  const path = await chosenPath(page);

  await editorBox(page).click();
  await page.keyboard.type("% typed for crash recovery\n");
  const typed = await editorText(page);

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
    await editorBox(page).click();
    await page.keyboard.type("% moving\n");
    const text = await editorText(page);
    await expect.poll(async () => (await readLocalRecord(page, old)).text).toBe(text);

    await page.locator("#scenario-category").selectOption("coops");
    const next = old.replace("/clash/", "/coops/");
    // The standard heading kind follows the category, so the moved text
    // is not byte-for-byte the pre-move text.
    const moved = await editorText(page);

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

  test("the dialog shows when the stored set differs; this browser's version restores it", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, BRANCH_PATH, { text: BRANCH_TEXT, uploads: [{ path: ASSET_PATH, length: 11 }] });
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto("/web/app/?iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth#/drafts/clash/half_written");
    await page.reload();

    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("This scenario changed on GitHub and in this browser");
    await page.locator("#confirm-alt").click();

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
    await expect(page.locator("#confirm-title")).toHaveText("This scenario changed on GitHub and in this browser");
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

    const text = await editorText(page);
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
    await editorBox(page).click();
    await page.keyboard.type("x");
    await expect.poll(async () => (await readLocalRecord(page, path)).uploads?.length ?? 0).toBe(1);

    await page.locator("#header-menu-toggle").click();
    await expect(page.locator("#header-menu")).toBeVisible();
    await page.locator("#github-signout").click();

    await expect(page.locator("#welcome")).toBeVisible();
    await expect.poll(() => readLocalRecord(page, path)).toEqual({ text: null, uploads: null });
  });
});

test.describe("opening a branch weighs the local copy by its baseline", () => {
  const BRANCH_PATH = "draft-scenarios/clash/half_written.tex";
  const ADDRESS = "/web/app/?iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth#/drafts/clash/half_written";
  const BRANCH_TEXT = "% from branch\n";
  const BRANCH_SHA = "2b7bd37cd0574a3067d8725a80f1184364bd434d"; // git blob SHA of BRANCH_TEXT
  const OLD_TEXT = "% an older branch\n";
  const OLD_SHA = "8f5cfb128895d948c99ce889446b9d5c2a1e2d47"; // git blob SHA of OLD_TEXT
  const LOCAL_TEXT = "% local edit\n";

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES,
      { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
      {
        method: "GET",
        path: /\/compare\//,
        body: { files: [{ filename: BRANCH_PATH, sha: BRANCH_SHA, status: "added" }] },
      },
      {
        method: "GET",
        path: /\/contents\/draft-scenarios\/clash\/half_written\.tex/,
        body: { content: btoa(BRANCH_TEXT) },
      },
    ]),
  });

  async function openWithRecord(
    page: Page,
    fields: { text?: string; baseSha?: string; uploads?: { path: string; length: number }[] },
  ): Promise<void> {
    await seedLocalRecord(page, BRANCH_PATH, fields);
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto(ADDRESS);
    await page.reload();
  }

  async function readBaseSha(page: Page): Promise<string | null> {
    return page.evaluate(async (p) => (await globalThis.__localStore!.loadRecord(p)).baseSha, BRANCH_PATH);
  }

  test("a local edit on the current branch opens with no question", async ({ app }) => {
    const { page } = app;
    await openWithRecord(page, { text: LOCAL_TEXT, baseSha: BRANCH_SHA });

    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#confirm-dialog")).toBeHidden();
    expect(await editorText(page)).toBe(LOCAL_TEXT);
    await expect(page.locator("#draft-note")).toBeVisible();
    expect(await readBaseSha(page)).toBe(BRANCH_SHA);
  });

  test("an untouched stale copy is replaced by the branch with no question", async ({ app }) => {
    const { page } = app;
    await openWithRecord(page, { text: OLD_TEXT, baseSha: OLD_SHA });

    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#confirm-dialog")).toBeHidden();
    expect(await editorText(page)).toBe(BRANCH_TEXT);
    await expect.poll(() => readBaseSha(page)).toBe(BRANCH_SHA);
    await expect.poll(async () => (await readLocalRecord(page, BRANCH_PATH)).text).toBe(BRANCH_TEXT);
  });

  test.describe("a local edit and a moved branch", () => {
    test("the dialog has three buttons", async ({ app }) => {
      const { page } = app;
      await openWithRecord(page, { text: LOCAL_TEXT, baseSha: OLD_SHA });

      await expect(page.locator("#confirm-title")).toHaveText("This scenario changed on GitHub and in this browser");
      await expect(page.locator("#confirm-message")).toContainText("changed on GitHub");
      await expect(page.locator("#confirm-ok")).toHaveText("Open GitHub version");
      await expect(page.locator("#confirm-alt")).toHaveText("Open this browser's version");
      await expect(page.locator("#confirm-cancel")).toHaveText("Cancel");
      await expect(page.locator("#workspace")).toBeHidden();
    });

    test("Open GitHub version opens the branch and drops the local edit", async ({ app }) => {
      const { page } = app;
      await openWithRecord(page, { text: LOCAL_TEXT, baseSha: OLD_SHA });
      await page.locator("#confirm-ok").click();

      await expect(page.locator("#workspace")).toBeVisible();
      expect(await editorText(page)).toBe(BRANCH_TEXT);
      await expect.poll(() => readBaseSha(page)).toBe(BRANCH_SHA);
      await expect.poll(async () => (await readLocalRecord(page, BRANCH_PATH)).text).toBe(BRANCH_TEXT);
    });

    test("Open this browser's version opens the local edit, rebased on the branch", async ({ app }) => {
      const { page } = app;
      await openWithRecord(page, { text: LOCAL_TEXT, baseSha: OLD_SHA });
      await page.locator("#confirm-alt").click();

      await expect(page.locator("#workspace")).toBeVisible();
      expect(await editorText(page)).toBe(LOCAL_TEXT);
      await expect(page.locator("#draft-note")).toBeVisible();
      expect(await readBaseSha(page)).toBe(BRANCH_SHA);
    });

    test("Cancel opens nothing, keeps the local copy and clears the address", async ({ app }) => {
      const { page } = app;
      await openWithRecord(page, { text: LOCAL_TEXT, baseSha: OLD_SHA });
      await page.locator("#confirm-cancel").click();

      await expect(page.locator("#welcome")).toBeVisible();
      await expect(page.locator("#workspace")).toBeHidden();
      await expect.poll(() => new URL(page.url()).hash).toBe("");
      expect((await readLocalRecord(page, BRANCH_PATH)).text).toBe(LOCAL_TEXT);
      expect(await readBaseSha(page)).toBe(OLD_SHA);
    });
  });

  test("a legacy record that differs asks, without claiming GitHub changed", async ({ app }) => {
    const { page } = app;
    await openWithRecord(page, { text: LOCAL_TEXT });

    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-alt")).toHaveText("Open this browser's version");
    await expect(page.locator("#confirm-message")).not.toContainText("was changed on GitHub");
  });
});

test.describe("an updates address with no GitHub answer", () => {
  test("signed out, a local copy opens in edit mode", async ({ app }) => {
    const { page } = app;
    const path = "clash/arcane_artillery.tex";
    await seedLocalRecord(page, path, { text: "% local edit of a Mission Book scenario\n" });
    await page.goto("/web/app/#/updates/clash/arcane_artillery");
    await page.reload();

    await expect(page.locator("#workspace")).toBeVisible();
    expect(await editorText(page)).toBe("% local edit of a Mission Book scenario\n");
    expect(await page.evaluate(() => window.__state!.edit)).toEqual({ startOver: false });
    expect(new URL(page.url()).hash).toBe("#/updates/clash/arcane_artillery");
  });
});

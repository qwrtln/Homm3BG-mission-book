// Tier 2. The welcome screen's "Resume your work" list as it merges the
// copies kept in this browser with the signed-in user's GitHub branches, and
// each row's state label. Records are seeded through the shared helper, the
// way a previous session left them. See web/app/github/resume.ts.

import type { Page } from "@playwright/test";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.ts";
import { editorText } from "../helpers/editor.ts";
import { blobSha, seedLocalRecord } from "../helpers/local-store.ts";
import { expect, type GithubRoute, test } from "./fixtures.ts";

const LOGIN = "octotester";
const TOKEN_KEY = "github_token";
const TOKEN = "gh-tier2-token";
const REPO_PATH = `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
const DRAFT_KEY_PREFIX = "wasm-scenario-builder:draft:";

const TEX_PATH = "draft-scenarios/clash/half_written.tex";
const BRANCH = `scenario-editor/${LOGIN}/half-written`;
const OTHER_PATH = "draft-scenarios/clash/local_only.tex";
const BOOK_PATH = "clash/arcane_artillery.tex";

const BRANCH_TEXT = "% on the branch\n";
const LOCAL_TEXT = "% edited in this browser\n";

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

/**
 * The calls a member's sign-in makes, with one branch of theirs.
 *
 * @param compare how the compare of that branch answers
 * @param user the answer to `/user`, to hold it back
 */
function memberRoutes(compare: Partial<GithubRoute>, user: Partial<GithubRoute> = {}): GithubRoute[] {
  return [
    { method: "GET", path: "/user", body: { login: LOGIN }, ...user },
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
    { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: BRANCH }] },
    {
      method: "GET",
      path: /\/compare\//,
      body: { files: [{ filename: TEX_PATH, sha: blobSha(BRANCH_TEXT), status: "added" }] },
      ...compare,
    },
    { method: "DELETE", path: /\/git\/refs\/heads\//, status: 204, body: null },
  ];
}

async function signInAs(page: Page): Promise<void> {
  await page.addInitScript(([key, token]: [string, string]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN] as [
    string,
    string,
  ]);
  await page.reload();
}

/**
 * Records every api.github.com request the page makes from now on.
 *
 * @param page
 * @returns filled as they happen
 */
function recordGithubRequests(page: Page): { method: string; url: string }[] {
  const seen: { method: string; url: string }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "api.github.com") return;
    seen.push({ method: request.method(), url: request.url() });
  });
  return seen;
}

/**
 * Whether the browser still holds anything for a scenario path.
 *
 * @param page
 * @param path
 */
async function storedFor(page: Page, path: string): Promise<{ record: string | null; draft: string | null }> {
  return page.evaluate(
    async ([p, prefix]: [string, string]) => {
      const store = globalThis.__localStore;
      if (!store) throw new Error("the page has no __localStore hook");
      return { record: (await store.loadRecord(p)).text, draft: localStorage.getItem(prefix + p) };
    },
    [path, DRAFT_KEY_PREFIX] as [string, string],
  );
}

/**
 * The stored record's last-edit time for a scenario path.
 *
 * @param page
 * @param path
 */
async function updatedAt(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const store = globalThis.__localStore;
    if (!store) throw new Error("the page has no __localStore hook");
    return (await store.loadRecord(p)).updatedAt;
  }, path);
}

test.describe("signed out", () => {
  test("an edited record is listed as a local draft, with no GitHub call", async ({ app }) => {
    const { page, errors } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    const requests = recordGithubRequests(page);
    await page.reload();

    await expect(page.locator("#resume-drafts")).toBeVisible();
    const rows = page.locator("#resume-list .combobox-item");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Local Only");
    await expect(rows.first()).toContainText("Local draft");
    expect(requests, "a signed-out welcome screen called the GitHub API").toEqual([]);
    expect(errors, "the page reported errors while listing local drafts").toEqual([]);
  });

  test("an untouched record is not listed", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: BRANCH_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await page.reload();

    await expect(page.locator("#resume-drafts")).toBeHidden();
  });

  test("a legacy record, with no baseline, is listed", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: BRANCH_TEXT });
    await page.reload();

    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-list .combobox-item")).toContainText("Local draft");
  });

  test("a local row opens the local text, with the network off", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await page.reload();
    await page.context().setOffline(true);

    await page.locator("#resume-list .combobox-item").click();

    await expect(page.locator("#workspace")).toBeVisible();
    expect(await editorText(page)).toBe(LOCAL_TEXT);
  });

  test("opening a row and going back keeps its last-edit time; typing moves it", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    const seeded = await updatedAt(page, OTHER_PATH);
    expect(seeded, "seeding wrote no last-edit time").not.toBeNull();
    await page.reload();

    await page.locator("#resume-list .combobox-item").click();
    await expect(page.locator("#workspace")).toBeVisible();
    expect(await editorText(page)).toBe(LOCAL_TEXT);
    await page.locator("#back-to-welcome").click();
    await page.locator("#confirm-ok").click(); // never saved to GitHub, so leaving asks
    await expect(page.locator("#workspace")).toBeHidden();
    await expect(page.locator("#back-to-editing")).toBeVisible();
    expect(await updatedAt(page, OTHER_PATH), "an open with no edit moved the last-edit time").toBe(seeded);

    await page.locator("#back-to-editing").click();
    await page.locator(".cm-content").click();
    await page.keyboard.type("x");
    await page.locator("#back-to-welcome").click();
    await page.locator("#confirm-ok").click();
    await expect.poll(() => updatedAt(page, OTHER_PATH)).not.toBe(seeded);
  });

  test("a row names its game mode, and only a Mission Book edit says so", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await seedLocalRecord(page, BOOK_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await page.reload();

    const draft = page.locator("#resume-list .combobox-item", { hasText: "Local Only" });
    const edit = page.locator("#resume-list .combobox-item", { hasText: "Arcane Artillery" });
    await expect(draft.locator(".resume-mode")).toHaveText("Clash");
    await expect(edit.locator(".resume-mode")).toHaveText("Clash");
    await expect(edit).toContainText("Mission Book edit");
    await expect(draft).not.toContainText("Mission Book edit");
    // A desktop pointer draws the desktop, not the phone.
    await expect(page.locator("#resume-list .resume-where .device-desktop")).toHaveCount(2);
    await expect(page.locator("#resume-list .resume-where .device-mobile")).toHaveCount(0);
  });

  test("deleting the scenario left open behind the welcome screen closes it for good", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await page.reload();
    await page.locator("#resume-list .combobox-item").click();
    await expect(page.locator("#workspace")).toBeVisible();
    await page.locator("#back-to-welcome").click();
    await page.locator("#confirm-ok").click(); // never saved to GitHub, so leaving asks
    await expect(page.locator("#back-to-editing")).toBeVisible();

    await page.locator("#resume-list .resume-delete").click();
    await page.locator("#confirm-ok").click();

    await expect(page.locator("#resume-drafts")).toBeHidden();
    await expect(page.locator("#back-to-editing")).toBeHidden();
    // Past the 400 ms autosave: nothing writes the deleted text back.
    await page.waitForTimeout(600);
    expect(await storedFor(page, OTHER_PATH)).toEqual({ record: null, draft: null });
  });

  test("Delete removes the row and both stored copies", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await page.evaluate(([key, text]: [string, string]) => localStorage.setItem(key, text), [
      DRAFT_KEY_PREFIX + OTHER_PATH,
      LOCAL_TEXT,
    ] as [string, string]);
    await page.reload();

    await page.locator("#resume-list .resume-delete").click();
    await expect(page.locator("#confirm-message")).toContainText("will be deleted from this browser.");
    await page.locator("#confirm-ok").click();

    await expect(page.locator("#resume-drafts")).toBeHidden();
    expect(await storedFor(page, OTHER_PATH)).toEqual({ record: null, draft: null });
  });
});

test.describe("signed in, with a branch", () => {
  test.use({ githubRoutes: routes(memberRoutes({})) });

  test("a matching local copy adds no state label", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, TEX_PATH, { text: BRANCH_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await signInAs(page);

    const rows = page.locator("#resume-list .combobox-item");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("title", `Branch ${BRANCH}`);
    await expect(rows.first()).toContainText("On GitHub");
    await expect(page.locator("#resume-list .resume-state")).toHaveCount(0);
  });

  test("an edit on the branch's own base reads as unsaved changes", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, TEX_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await signInAs(page);

    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-list .resume-state")).toHaveText("Unsaved changes in this browser");
  });

  test("a branch that moved on reads as changed on GitHub and here", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, TEX_PATH, { text: LOCAL_TEXT, baseSha: blobSha("% an older base\n") });
    await signInAs(page);

    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-list .resume-state")).toHaveText("Changed on GitHub and here");
  });

  test("Delete removes the branch and the local record", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, TEX_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await signInAs(page);
    const requests = recordGithubRequests(page);

    await page.locator("#resume-list .resume-delete").click();
    await expect(page.locator("#confirm-message")).toContainText("will be deleted from GitHub and from this browser.");
    await page.locator("#confirm-ok").click();

    await expect(page.locator("#resume-drafts")).toBeHidden();
    const deletes = requests.filter((r) => r.method === "DELETE").map((r) => r.url);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain(`/git/refs/heads/${encodeURIComponent(BRANCH)}`);
    expect((await storedFor(page, TEX_PATH)).record).toBeNull();
  });
});

test.describe("signed in, a branch compare fails", () => {
  test.use({ githubRoutes: routes(memberRoutes({ status: 500, body: { message: "boom" } })) });

  test("a local-only record is not claimed to be missing from GitHub", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await signInAs(page);

    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-list .resume-where")).toHaveText("Local draft");
    // A failed compare may hide this path's branch, so the row is "unknown", not "local-only".
    expect(await page.evaluate(() => window.__state?.resume.entries.map((e) => e.state))).toEqual(["local-unknown"]);
  });
});

test.describe("signed in, the account lookup is slow", () => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  test.use({ githubRoutes: routes(memberRoutes({}, { hold: held })) });

  test("local rows show before the lookup answers, and GitHub merges in after", async ({ app }) => {
    const { page } = app;
    await seedLocalRecord(page, OTHER_PATH, { text: LOCAL_TEXT, baseSha: blobSha(BRANCH_TEXT) });
    await signInAs(page);

    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
    await expect(page.locator("#resume-list .combobox-item")).toContainText("Local Only");
    await expect(page.locator("#resume-loading")).toBeVisible();

    release();
    await expect(page.locator("#resume-loading")).toBeHidden();
    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(2);
    await expect(page.locator("#resume-list .resume-where")).toHaveText(["Local draft", "On GitHub"]);
  });
});

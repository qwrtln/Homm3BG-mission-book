// Tier 2. The GitHub-facing surface of the app: the signed-out header, the
// signed-in header, the resume-drafts list, and a save. The OAuth round trip
// itself is never performed — github-auth.js redirects to github.com and
// trades the code through a Cloudflare relay, neither of which a browser test
// may reach. What is reachable is everything downstream of the token, because
// the token is only ever read back out of localStorage under "github_token".
// Seeding that key through page.addInitScript is therefore the whole of the
// sign-in this file needs. See web/tests/README.md for the stubbing contract.

import { slugify, UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.js";
import { chooseFromMenu, expect, openScenarioList, test } from "./fixtures.mjs";

// The localStorage key github-auth.js persists the token in. It is a private
// constant there, so it is repeated here rather than imported; if it changes,
// every signed-in test below falls back to the signed-out surface and fails.
const TOKEN_KEY = "github_token";
const TOKEN = "gh-tier2-token";
const LOGIN = "octotester";
const DEFAULT_BRANCH = "main";

/** The three calls discoverGithubContext makes for a push-capable user. */
const MEMBER_ROUTES = [
  { method: "GET", path: "/user", body: { login: LOGIN } },
  {
    method: "GET",
    path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`,
    body: {
      name: UPSTREAM_REPO,
      owner: { login: UPSTREAM_OWNER },
      default_branch: DEFAULT_BRANCH,
      permissions: { push: true },
    },
  },
  { method: "GET", path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/branches`, body: [] },
];

/**
 * Playwright reads a bare array given to test.use() as a [value, options]
 * tuple and keeps only its first element, so a route list must be wrapped or
 * the stub receives one route object instead of the list. (Reported: the
 * `githubRoutes` option in fixtures.mjs invites the bare form.)
 *
 * @param {import("./fixtures.mjs").GithubRoute[]} list
 * @returns {[import("./fixtures.mjs").GithubRoute[], {option: true}]}
 */
function routes(list) {
  return [list, { option: true }];
}

/**
 * Signs in the way the app itself does: a token in localStorage, read on the
 * next load. addInitScript lands before the app's modules run, and the reload
 * is what makes that true — the `app` fixture has already navigated by the
 * time a test body runs, so seeding without reloading would change nothing.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function signInAs(page) {
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  await page.reload();
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

test("signed out, the header offers sign-in and the app calls no GitHub API", async ({ app }) => {
  const { page, errors } = app;

  // The recorder has to be listening before the load it judges, and the
  // fixture's navigation is already done, so this reloads under the listener.
  // A reload is a cold load for this app: it initializes once, on load.
  const requests = recordGithubRequests(page);
  await page.reload();

  await expect(page.locator("#github-signin")).toBeVisible();
  await expect(page.locator("#github-status")).toBeHidden();
  await expect(page.locator("#resume-drafts")).toBeHidden();

  // A settle point with teeth: by the time the book's scenario list has been
  // fetched and drawn, anything the GitHub modules meant to do on load has
  // had its chance.
  await openScenarioList(page);

  expect(requests, "a signed-out cold load called the GitHub API").toEqual([]);
  expect(errors, "the page reported errors on a signed-out cold load").toEqual([]);
});

test.describe("signed in", () => {
  test.use({ githubRoutes: routes(MEMBER_ROUTES) });

  test("the header swaps to the signed-in strip, with save ready and no PR yet", async ({ app }) => {
    const { page, errors } = app;
    await signInAs(page);

    // Shown, though empty on the welcome screen: Save waits for an open scenario.
    await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
    await expect(page.locator("#github-signin")).toBeHidden();

    // Nothing is open on the welcome screen, so there is nothing to save yet.
    const save = page.locator("#github-save");
    await expect(save).toBeHidden();
    await page.locator('[data-category="clash"]').click();
    await page.locator("#scenario-name").fill("Save Probe");
    await page.locator("#go").click();
    await expect(save).toBeVisible();
    await expect(save).toBeEnabled();
    await expect(save).toHaveText("Save");
    // Nothing has been pushed, so there is nothing to open a PR against.
    await expect(page.locator("#github-open-pr")).toBeHidden();
    await expect(page.locator("#github-pr-link")).toBeHidden();
    // This user has no scenario-editor/<login>/* branches: no resume list.
    await expect(page.locator("#resume-drafts")).toBeHidden();

    expect(errors, "the page reported errors while signing in").toEqual([]);
  });

  test("signing out puts the signed-out header back", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");

    await chooseFromMenu(page, "github-signout");

    await expect(page.locator("#github-signin")).toBeVisible();
    await expect(page.locator("#github-status")).toBeHidden();
    // Signed out, the menu has nothing to sign out of.
    await page.locator("#header-menu-toggle").click();
    await expect(page.locator("#theme-toggle")).toBeVisible();
    await expect(page.locator("#github-signout")).toBeHidden();
  });
});

test.describe("the resume-drafts list", () => {
  const BRANCH = `scenario-editor/${LOGIN}/half-written`;
  const TEX_PATH = "draft-scenarios/clash/half_written.tex";

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES.filter((route) => !route.path.endsWith("/branches")),
      // One branch of this user's own, plus one that is not theirs: only the
      // prefixed one may be offered.
      {
        method: "GET",
        path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/branches`,
        body: [{ name: BRANCH }, { name: "scenario-editor/someone-else/theirs" }, { name: DEFAULT_BRANCH }],
      },
      {
        method: "GET",
        path: /\/compare\//,
        body: {
          files: [{ filename: TEX_PATH, sha: "tex-sha", status: "added" }],
          // Oldest first, as GitHub lists them: only the last one counts.
          commits: [
            { commit: { committer: { date: "2020-01-01T00:00:00Z" } } },
            { commit: { committer: { date: new Date(Date.now() - 3 * 3600 * 1000).toISOString() } } },
          ],
        },
      },
    ]),
  });

  test("offers this user's own unfinished branches, and only those", async ({ app }) => {
    const { page, errors } = app;
    await signInAs(page);

    await expect(page.locator("#resume-drafts")).toBeVisible();
    const entries = page.locator("#resume-list .combobox-item");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText("Clash: Half Written");
    await expect(entries.first()).toContainText(BRANCH);
    await expect(entries.first()).toContainText("last edit 3 hours ago");

    expect(errors, "the page reported errors while listing drafts").toEqual([]);
  });
});

test.describe("deleting a work in progress", () => {
  const BRANCH = `scenario-editor/${LOGIN}/half-written`;
  const TEX_PATH = "draft-scenarios/clash/half_written.tex";
  const REF = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`;

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES.filter((route) => !route.path.endsWith("/branches")),
      { method: "GET", path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/branches`, body: [{ name: BRANCH }] },
      {
        method: "GET",
        path: /\/compare\//,
        body: { files: [{ filename: TEX_PATH, sha: "tex-sha", status: "added" }] },
      },
      { method: "DELETE", path: /\/git\/refs\/heads\//, status: 204, body: null },
    ]),
  });

  test("each row has a bin button", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await expect(page.locator("#resume-list .resume-delete")).toHaveCount(1);
    await expect(page.locator("#resume-list .resume-delete")).toHaveAccessibleName(/Delete/);
  });

  test("cancelling the confirmation deletes nothing", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    const requests = recordGithubRequests(page);

    await page.locator("#resume-list .resume-delete").click();
    const dialog = page.locator("#confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Half Written");
    await expect(dialog).toContainText("This cannot be undone.");
    await page.locator("#confirm-cancel").click();

    await expect(dialog).toBeHidden();
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
    await expect(page.locator("#resume-list .combobox-item")).toHaveCount(1);
  });

  test("Escape also cancels", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    const requests = recordGithubRequests(page);

    await page.locator("#resume-list .resume-delete").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.locator("#confirm-dialog")).toBeHidden();
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
  });

  test("confirming deletes the branch and removes the row", async ({ app }) => {
    const { page, errors } = app;
    await signInAs(page);
    const requests = recordGithubRequests(page);

    await page.locator("#resume-list .resume-delete").click();
    await page.locator("#confirm-ok").click();

    await expect(page.locator("#resume-drafts")).toBeHidden();
    expect(requests.filter((r) => r.method === "DELETE").map((r) => r.url)).toEqual([REF]);
    expect(errors, "the page reported errors while deleting").toEqual([]);
  });
});

test.describe("saving a scenario", () => {
  const NAME = "Tier Two Probe";
  const BRANCH = `scenario-editor/${LOGIN}/${slugify(NAME)}`;

  const SAVE_ROUTES = [
    ...MEMBER_ROUTES,
    // The category's main.tex is absent on both the branch and the default
    // branch, so no \input line is added and the commit carries the .tex alone.
    { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
    { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
    { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
    { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
    { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
    { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
    { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: `refs/heads/${BRANCH}` } },
  ];

  test.use({ githubRoutes: routes(SAVE_ROUTES) });

  /**
   * Opens the editor on a blank Clash scenario named NAME, without touching
   * the book's own content — a template pick fetches templates/default.tex
   * and nothing else.
   *
   * @param {import("@playwright/test").Page} page
   * @returns {Promise<void>}
   */
  async function openBlankClash(page) {
    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill(NAME);
    await page.locator("#go").click();
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#status-text")).toHaveText("Ready.");
  }

  test("pushes one commit to this user's own branch, and offers the PR after", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
    await openBlankClash(page);

    const requests = recordGithubRequests(page);

    // Clicked from inside the page so the handler's synchronous prologue —
    // which disables the button — has run by the time click() returns. A
    // Playwright click would race the network the save then waits on.
    const disabledOnClick = await page.evaluate(() => {
      const button = /** @type {HTMLButtonElement} */ (document.getElementById("github-save"));
      button.click();
      return button.disabled;
    });
    expect(disabledOnClick, "the save button stayed clickable while a save was in flight").toBe(true);

    const save = page.locator("#github-save");
    await expect(save).toHaveText("Save");
    await expect(save).toBeEnabled();
    await expect(page.locator("#github-open-pr")).toBeVisible();
    await expect(page.locator("#status-text")).toContainText(`${UPSTREAM_OWNER}/${UPSTREAM_REPO}@${BRANCH}`);

    // The UI says it saved; these say what it actually sent.
    const blobs = requests.filter((r) => r.method === "POST" && r.url.endsWith("/git/blobs"));
    expect(blobs, "the save pushed no blob").toHaveLength(1);
    const trees = requests.filter((r) => r.method === "POST" && r.url.endsWith("/git/trees"));
    expect(trees, "the save created no tree").toHaveLength(1);
    // The path is the app's own, derived from the typed name; assert its
    // shape, never a name out of the book.
    expect(JSON.parse(trees[0].body).tree.map((entry) => entry.path)).toEqual([
      expect.stringMatching(/^draft-scenarios\/clash\/[a-z0-9_-]+\.tex$/),
    ]);
    const commits = requests.filter((r) => r.method === "POST" && r.url.endsWith("/git/commits"));
    expect(commits, "the save created no commit").toHaveLength(1);
    expect(JSON.parse(commits[0].body).parents).toEqual(["base-sha"]);
    const updates = requests.filter((r) => r.method === "PATCH");
    expect(
      updates.map((r) => r.url),
      "the branch tip was not moved exactly once",
    ).toEqual([
      `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`,
    ]);
    expect(JSON.parse(updates[0].body).sha).toBe("new-commit-sha");

    // Where the next save and "Open PR" will aim.
    expect(await page.evaluate(() => window.__lastSaveTarget())).toEqual({
      owner: UPSTREAM_OWNER,
      repo: UPSTREAM_REPO,
      branch: BRANCH,
      commitSha: "new-commit-sha",
      isMember: true,
    });
    // No page-errors assertion here: the routes deliberately 404 the group
    // file, and Chromium logs every 404 as a console error.
  });

  test.describe("when GitHub refuses", () => {
    test.use({
      githubRoutes: routes([
        ...MEMBER_ROUTES,
        { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
        { method: "GET", path: /\/git\/ref\/heads\//, status: 500, body: { message: "Server Error" } },
      ]),
    });

    test("says so and hands the button back", async ({ app }) => {
      const { page } = app;
      await signInAs(page);
      await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
      await openBlankClash(page);

      await page.locator("#github-save").click();

      await expect(page.locator("#status-text")).toContainText("500");
      // The failure path must re-enable the button, or a save can never be
      // retried without a reload.
      await expect(page.locator("#github-save")).toBeEnabled();
      await expect(page.locator("#github-save")).toHaveText("Save");
      await expect(page.locator("#github-open-pr")).toBeHidden();
    });
  });
});

test.describe("saving a resumed draft", () => {
  // Deliberately not slugify("Half Written"): the title a resume derives from
  // the file name must not decide which branch the next save lands on.
  const BRANCH = `scenario-editor/${LOGIN}/original-name`;
  const TEX_PATH = "draft-scenarios/clash/half_written.tex";

  test.use({
    githubRoutes: routes([
      ...MEMBER_ROUTES.filter((route) => !route.path.endsWith("/branches")),
      { method: "GET", path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/branches`, body: [{ name: BRANCH }] },
      {
        method: "GET",
        path: /\/compare\//,
        body: { files: [{ filename: TEX_PATH, sha: "tex-sha", status: "added" }] },
      },
      // The draft's own file exists on the branch; the group file does not.
      {
        method: "GET",
        path: /\/contents\/draft-scenarios\/clash\/half_written\.tex/,
        body: { content: btoa("% draft\n") },
      },
      { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
      { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
      { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
      { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
      { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
      { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
      { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: `refs/heads/${BRANCH}` } },
    ]),
  });

  test("goes back to the branch it was resumed from, not a new one", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await page.locator("#resume-list .combobox-item").first().click();
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#status-text")).toHaveText("Ready.");

    // A resumed draft with no edits has nothing to push; make one so this
    // save actually goes out.
    await page.locator(".CodeMirror").click();
    await page.keyboard.type("x");

    const requests = recordGithubRequests(page);
    await page.locator("#github-save").click();
    await expect(page.locator("#status-text")).toContainText(`@${BRANCH}`);

    const updates = requests.filter((r) => r.method === "PATCH");
    expect(
      updates.map((r) => r.url),
      "the save moved a branch other than the resumed one",
    ).toEqual([
      `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`,
    ]);
    expect(
      requests.filter((r) => r.method === "POST" && /\/git\/refs$/.test(r.url)),
      "the save created a second branch",
    ).toHaveLength(0);
  });
});

test.describe("signing out mid-edit", () => {
  test.use({ githubRoutes: routes(MEMBER_ROUTES) });

  test("returns to welcome and purges the autosaved draft", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill("Purge Probe");
    await page.locator("#go").click();
    await expect(page.locator("#workspace")).toBeVisible();
    // Typing schedules an autosave; wait for it to land.
    await page.locator(".CodeMirror").click();
    await page.keyboard.type("x");
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":draft:")).length))
      .toBe(1);

    await chooseFromMenu(page, "github-signout");

    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#workspace")).toBeHidden();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":draft:")))).toEqual([]);
  });
});

test("a template pick puts the typed name into \\addscenariosection", async ({ app }) => {
  const { page } = app;
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill("Kyrre Link");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  const text = await page.evaluate(() => document.querySelector(".CodeMirror").CodeMirror.getValue());
  expect(text).toMatch(/\\addscenariosection\{1\}\{[^}]*\}\{Kyrre Link\}/);
});

test.describe("looking for work to resume", () => {
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });

  test.use({
    githubRoutes: routes([{ ...MEMBER_ROUTES[0], hold: held }, ...MEMBER_ROUTES.slice(1)]),
  });

  test("shows a spinner while GitHub answers, then clears it", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    await expect(page.locator("#resume-loading")).toBeVisible();
    await expect(page.locator("#resume-loading .spinner")).toBeVisible();

    release();
    // This user has no branches: the whole block goes away.
    await expect(page.locator("#resume-loading")).toBeHidden();
    await expect(page.locator("#resume-drafts")).toBeHidden();
  });
});

test.describe("opening the app already signed in", () => {
  test.use({ githubRoutes: routes(MEMBER_ROUTES) });

  // An address kept from an earlier sign-in (browser history, a bookmark)
  // still carries GitHub's one-time ?code=. Trading it again fails; the token
  // already stored is still good and must be used, not dropped.
  test("a stale ?code= in the address does not hide this user's work", async ({ app }) => {
    const { page } = app;
    await page.route("https://mission-book-oauth-relay.pages.dev/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
        }),
      }),
    );
    await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
    await page.goto("/web/app/?code=stale-code");

    await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
    await expect(page.locator("#mode-choice")).toBeVisible();
    await expect(page.locator("#status-text")).not.toContainText("sign-in failed");
    expect(new URL(page.url()).search).toBe("");
  });
});

test.describe("opening the app with a revoked token", () => {
  test.use({
    githubRoutes: routes([
      { method: "GET", path: "/user", status: 401, body: { message: "Bad credentials" } },
      ...MEMBER_ROUTES.slice(1),
    ]),
  });

  // GitHub revokes a token on its own (the oldest past ten per user and app,
  // or one unused for a year). The app must not keep showing "signed in".
  test("drops the token and offers sign-in again", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    await expect(page.locator("#github-signin")).toBeVisible();
    await expect(page.locator("#github-status")).toBeHidden();
    await expect(page.locator("#status-text")).toContainText("Sign in again");
    // addInitScript seeds the token on every load, so check before any reload.
    expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  });
});

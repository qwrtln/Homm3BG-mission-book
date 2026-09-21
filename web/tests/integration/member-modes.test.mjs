// Tier 2. The welcome screen's modes: who is offered "Edit existing", and what
// that mode does. Only a signed-in repo member (upstream permissions.push) is
// offered the choice; everyone else keeps the picker they had. As in
// github.test.mjs, the sign-in itself is a token seeded into localStorage, and
// api.github.com is stubbed.

import { test, expect, openScenarioList } from "./fixtures.mjs";

import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.js";

const TOKEN_KEY = "github_token";
const TOKEN = "gh-tier2-token";
const LOGIN = "octotester";
const REPO_PATH = `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

/**
 * @param {{push: boolean}} options
 * @returns {import("./fixtures.mjs").GithubRoute[]}
 */
function identityRoutes({ push }) {
  return [
    { method: "GET", path: "/user", body: { login: LOGIN } },
    {
      method: "GET",
      path: REPO_PATH,
      body: {
        name: UPSTREAM_REPO,
        owner: { login: UPSTREAM_OWNER },
        default_branch: "main",
        permissions: { push },
      },
    },
    { method: "GET", path: `${REPO_PATH}/branches`, body: [] },
    // A non-member's fork lookup: they have none, and are not asked to make one here.
    { method: "GET", path: `/repos/${LOGIN}/${UPSTREAM_REPO}`, status: 404, body: { message: "Not Found" } },
  ];
}

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
    if (new URL(request.url()).hostname === "api.github.com") {
      seen.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  });
  return seen;
}

test("signed out, there is no mode choice and the picker is there", async ({ app }) => {
  const { page } = app;
  await expect(page.locator("#welcome-picker")).toBeVisible();
  await expect(page.locator("#mode-choice")).toBeHidden();
});

test.describe("signed in, but not a member", () => {
  test.use({ githubRoutes: routes(identityRoutes({ push: false })) });

  test("gets no mode choice, and the picker is there once membership is known", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    await expect(page.locator("#welcome-picker")).toBeVisible();
    await expect(page.locator("#mode-choice")).toBeHidden();
    });
});

test.describe("signed in as a member", () => {
  test.use({ githubRoutes: routes(identityRoutes({ push: true })) });

  test("is told they are a member, and still has the picker as it always was", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    const choice = page.locator("#mode-choice");
    await expect(choice).toBeVisible();
    await expect(choice).toContainText("project member");
    await expect(page.locator("#mode-edit")).toHaveText("Edit existing");
    await expect(page.locator("#mode-new")).toHaveText("Add new");
    await expect(page.locator("#mode-new")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#welcome-picker")).toBeVisible();
    await expect(page.locator("#name-slide")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#scratch-row")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#go")).toBeDisabled();
  });

  test("Edit existing greys out the name pane and the blank-template row, and Let's go! needs only a pick", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    await page.locator("#mode-edit").click();

    for (const id of ["#name-slide", "#scratch-row"]) {
      await expect(page.locator(id)).toBeVisible();
      await expect(page.locator(id)).toHaveAttribute("inert", "");
      await expect(page.locator(id)).toHaveClass(/dimmed/);
    }
    await expect(page.locator("#go")).toBeDisabled();

    const results = await openScenarioList(page);
    await results.first().dispatchEvent("mousedown");
    await expect(page.locator("#go")).toBeEnabled();
  });

  test("Add new gives the name pane and the templates back", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await page.locator("#mode-edit").click();

    await page.locator("#mode-new").click();

    await expect(page.locator("#name-slide")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#scratch-row")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#go")).toBeDisabled();
  });

  test("a blank template picked before switching to Edit existing is dropped", async ({ app }) => {
    const { page } = app;
    await signInAs(page);
    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill("Some Name");
    await expect(page.locator("#go")).toBeEnabled();

    await page.locator("#mode-edit").click();

    await expect(page.locator("#go")).toBeDisabled();
  });
});

test.describe("a member with work to resume", () => {
  test.use({
    githubRoutes: routes([
      ...identityRoutes({ push: true }).filter((route) => !route.path.endsWith("/branches")),
      { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
      {
        method: "GET",
        path: /\/compare\//,
        body: { files: [{ filename: "draft-scenarios/clash/half_written.tex", sha: "s", status: "added" }] },
      },
    ]),
  });

  test("sees the resume list, headed \"Resume your work\", on the same row as the member banner", async ({ app }) => {
    const { page } = app;
    await signInAs(page);

    await expect(page.locator("#resume-drafts")).toBeVisible();
    await expect(page.locator("#resume-drafts h2")).toHaveText("Resume your work");
    const banner = await page.locator("#mode-choice").boundingBox();
    const resume = await page.locator("#resume-drafts").boundingBox();
    expect(banner && resume && Math.abs(banner.y - resume.y) < 4, "banner and resume list are not side by side").toBe(true);
    expect(banner && resume && banner.x < resume.x).toBe(true);
  });
});

test.describe("editing in place", () => {
  const NEW_TREE = "new-tree-sha";
  const BASE_ROUTES = [
    { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
    { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
    { method: "POST", path: /\/git\/trees$/, body: { sha: NEW_TREE } },
    { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: NEW_TREE } } },
    { method: "POST", path: /\/git\/refs$/, body: { ref: "refs/heads/x" } },
    { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: "refs/heads/x" } },
  ];

  /**
   * Opens Edit existing and picks the first scenario the book lists.
   *
   * @param {import("@playwright/test").Page} page
   * @returns {Promise<string>} the picked scenario's repository path
   */
  async function pickFirstScenario(page) {
    await signInAs(page);
    await page.locator("#mode-edit").click();
    const results = await openScenarioList(page);
    const path = /** @type {string} */ (await results.first().getAttribute("data-path"));
    await results.first().dispatchEvent("mousedown");
    return path;
  }

  test.describe("with no earlier edit branch", () => {
    test.use({
      githubRoutes: routes([
        ...identityRoutes({ push: true }),
        { method: "GET", path: /\/git\/ref\/heads\/.*updates/, status: 404, body: { message: "Not Found" } },
        { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
        ...BASE_ROUTES,
      ]),
    });

    test("opens the file's own source, saves it at its own path on an updates/ branch, and offers the PR", async ({ app }) => {
      const { page } = app;
      const path = await pickFirstScenario(page);
      await page.locator("#go").click();

      await expect(page.locator("#workspace")).toBeVisible();
      await expect(page.locator("#edit-branch-prompt")).toBeHidden();
      await expect(page.locator("#status-text")).toHaveText("Ready.");

      const seen = recordGithubRequests(page);
      await page.locator("#github-save").click();
      await expect(page.locator("#github-open-pr")).toBeVisible();

      const trees = seen.filter((r) => r.method === "POST" && r.url.endsWith("/git/trees"));
      expect(JSON.parse(trees[0].body ?? "{}").tree.map((/** @type {{path: string}} */ entry) => entry.path)).toEqual([path]);
      const patch = seen.find((r) => r.method === "PATCH");
      expect(decodeURIComponent(patch?.url ?? "")).toContain(`/scenario-editor/${LOGIN}/updates/`);
      expect(JSON.parse(patch?.body ?? "{}").force, "a plain edit must not force-move the branch").toBeUndefined();
    });
  });

  test.describe("with an earlier edit branch", () => {
    const BRANCH_COPY = "% the copy on the earlier edit branch\n";

    test.use({
      githubRoutes: routes([
        ...identityRoutes({ push: true }),
        { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
        { method: "GET", path: /\/contents\/.*ref=.*updates/, body: { content: btoa(BRANCH_COPY) } },
        ...BASE_ROUTES,
      ]),
    });

    test("asks, and Continue opens the branch's copy", async ({ app }) => {
      const { page } = app;
      await pickFirstScenario(page);
      await page.locator("#go").click();

      await expect(page.locator("#edit-branch-prompt")).toBeVisible();
      await expect(page.locator("#workspace")).toBeHidden();

      await page.locator("#edit-continue").click();

      await expect(page.locator("#workspace")).toBeVisible();
      await expect(page.locator(".CodeMirror")).toContainText("the copy on the earlier edit branch");
    });

    test("asks, and Start over opens main's copy and force-resets the branch only on the first save", async ({ app }) => {
      const { page } = app;
      await pickFirstScenario(page);
      await page.locator("#go").click();
      await expect(page.locator("#edit-branch-prompt")).toBeVisible();

      const seen = recordGithubRequests(page);
      await page.locator("#edit-start-over").click();

      await expect(page.locator("#workspace")).toBeVisible();
      await expect(page.locator(".CodeMirror")).not.toContainText("the copy on the earlier edit branch");
      expect(seen.filter((r) => r.method !== "GET"), "starting over changed the branch before any save").toEqual([]);

      await page.locator("#github-save").click();
      await expect(page.locator("#github-open-pr")).toBeVisible();
      expect(JSON.parse(seen.find((r) => r.method === "PATCH")?.body ?? "{}").force).toBe(true);

      // A second save builds on the first: only the first one resets.
      seen.length = 0;
      await page.locator("#github-save").click();
      await expect.poll(() => seen.some((r) => r.method === "PATCH")).toBe(true);
      expect(JSON.parse(seen.find((r) => r.method === "PATCH")?.body ?? "{}").force).toBeUndefined();
    });
  });
});

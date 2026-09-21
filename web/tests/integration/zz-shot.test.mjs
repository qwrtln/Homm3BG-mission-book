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

test.describe("shot", () => {
  test.use({ githubRoutes: routes(identityRoutes({ push: true })) });
  for (const w of [1000, 1500]) {
    test("w"+w, async ({ app }) => {
      const { page } = app;
      await page.setViewportSize({ width: w, height: 800 });
      await signInAs(page);
      await expect(page.locator("#mode-choice")).toBeVisible();
      await page.screenshot({ path: "/tmp/claude-1000/-home-qwrtln-Workspace-Homm3BG-mission-book/fa0160b6-d270-40f3-a339-f8311ba832e5/scratchpad/w"+w+".png" });
    });
  }
});

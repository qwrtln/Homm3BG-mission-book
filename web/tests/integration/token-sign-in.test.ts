// Tier 2. Signing in with a pasted token: the sign-in dialog's two choices,
// the token dialog, and what a token does and does not change. GitHub is a
// stub; the probe the app makes to see whether the token can write (a
// ref created from a sha that does not exist) answers 422, which is a pass.

import type { Page } from "@playwright/test";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.ts";
import { expect, type GithubRoute, test } from "./fixtures.ts";

const TOKEN_KEY = "github_token";
const METHOD_KEY = "wasm-scenario-builder:sign-in-method";
const LOGIN = "octotester";
const TOKEN = "github_pat_tier2";
const FORK_PATH = `/repos/${LOGIN}/${UPSTREAM_REPO}`;

/** See routes() in github.test.ts: Playwright needs the list wrapped as an option tuple. */
function routes(list: GithubRoute[]): [GithubRoute[], { scope: "test" }] {
  return [list, { option: true } as unknown as { scope: "test" }];
}

const UPSTREAM = {
  method: "GET",
  path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`,
  body: {
    name: UPSTREAM_REPO,
    owner: { login: UPSTREAM_OWNER },
    default_branch: "main",
    permissions: { push: false },
  },
};
const USER = { method: "GET", path: "/user", body: { login: LOGIN } };
const FORK = {
  method: "GET",
  path: FORK_PATH,
  body: { name: UPSTREAM_REPO, owner: { login: LOGIN }, default_branch: "main", permissions: { push: true } },
};
const FORK_BRANCHES = { method: "GET", path: `${FORK_PATH}/branches`, body: [] };
const PROBE = {
  method: "POST",
  path: `${FORK_PATH}/git/refs`,
  status: 422,
  body: { message: "Object does not exist" },
};

const REVOKE = { method: "POST", path: "/credentials/revoke", status: 202, body: null };

async function openTokenDialog(page: Page): Promise<void> {
  await page.locator("#github-signin").click();
  await page.locator("#signin-token").click();
  await expect(page.locator("#token-dialog")).toBeVisible();
}

async function storedKeys(page: Page): Promise<{ token: string | null; method: string | null }> {
  return page.evaluate(
    ([tokenKey, methodKey]) => ({ token: localStorage.getItem(tokenKey), method: localStorage.getItem(methodKey) }),
    [TOKEN_KEY, METHOD_KEY] as [string, string],
  );
}

test("the sign-in dialog offers GitHub first and a token second", async ({ app }) => {
  const { page } = app;
  await page.locator("#github-signin").click();
  await expect(page.locator("#signin-dialog")).toBeVisible();
  await expect(page.locator("#signin-oauth")).toHaveText("Sign in with GitHub (recommended)");
  await expect(page.locator("#signin-token")).toHaveText("Sign in with a fine-grained token");
});

test("Sign in with a token opens the token dialog with its steps", async ({ app }) => {
  const { page } = app;
  await openTokenDialog(page);
  await expect(page.locator("#signin-dialog")).toBeHidden();
  await expect(page.locator("#token-input")).toHaveAttribute("type", "password");
  await expect(page.locator("#token-create-link")).toHaveAttribute("href", /contents=write/);
  await expect(page.locator("#token-fork-link")).toHaveAttribute(
    "href",
    `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/fork`,
  );
});

test.describe("a token with a fork", () => {
  test.use({ githubRoutes: routes([USER, UPSTREAM, FORK, FORK_BRANCHES, PROBE, REVOKE]) });

  test("signs in, keeps the open scenario, and signing out clears both keys", async ({ app }) => {
    const { page } = app;
    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill("Token Probe");
    await page.locator("#go").click();
    await expect(page.locator("#workspace")).toBeVisible();

    await openTokenDialog(page);
    await page.locator("#token-input").fill(`  ${TOKEN}  `);
    await page.locator("#token-submit").click();

    await expect(page.locator("#token-dialog")).toBeHidden();
    await expect(page.locator("#github-save")).toBeVisible();
    await expect(page.locator("#workspace")).toBeVisible();
    expect(await storedKeys(page)).toEqual({ token: TOKEN, method: "token" });

    await page.locator("#header-menu-toggle").click();
    await page.locator("#github-signout").click();
    await page.waitForLoadState("load");
    await expect(page.locator("#github-signin")).toBeVisible();
    expect(await storedKeys(page)).toEqual({ token: null, method: null });
  });

  test("Sign out and revoke token sends the token to GitHub without signing the request, then signs out", async ({
    app,
  }) => {
    const { page } = app;
    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-submit").click();
    await expect(page.locator("#token-dialog")).toBeHidden();

    await page.locator("#header-menu-toggle").click();
    await page.locator("#github-signout-revoke").click();
    const revoke = page.waitForRequest((request) => new URL(request.url()).pathname === "/credentials/revoke");
    await page.locator("#confirm-ok").click();
    const request = await revoke;

    expect(request.postDataJSON()).toEqual({ credentials: [TOKEN] });
    expect(await request.headerValue("authorization")).toBeNull();
    await expect(page.locator("#github-signin")).toBeVisible();
    expect(await storedKeys(page)).toEqual({ token: null, method: null });
  });

  test("Enter in the field submits it", async ({ app }) => {
    const { page } = app;
    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-input").press("Enter");
    await expect(page.locator("#token-dialog")).toBeHidden();
    await expect(page.locator("#github-signin")).toBeHidden();
  });
});

test.describe("a token without a fork", () => {
  test.use({
    githubRoutes: routes([
      USER,
      UPSTREAM,
      { method: "GET", path: FORK_PATH, status: 404, body: { message: "Not Found" } },
    ]),
  });

  test("names the missing fork and stores nothing", async ({ app }) => {
    const { page } = app;
    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-submit").click();

    await expect(page.locator("#token-dialog [role=alert]")).toContainText("cannot see a fork");
    await expect(page.locator("#token-dialog [role=alert] code")).toHaveText(UPSTREAM_REPO);
    await expect(page.locator("#token-dialog")).toBeVisible();
    await expect(page.locator("#token-input")).toHaveValue(TOKEN);
    expect(await storedKeys(page)).toEqual({ token: null, method: null });
  });
});

test.describe("a token GitHub rejects", () => {
  test.use({
    githubRoutes: routes([
      { method: "GET", path: "/user", status: 401, body: { message: "Bad credentials" } },
      UPSTREAM,
    ]),
  });

  test("says it was not accepted and stores nothing", async ({ app }) => {
    const { page } = app;
    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-submit").click();

    await expect(page.locator("#token-dialog [role=alert]")).toContainText("was not accepted by GitHub");
    expect(await storedKeys(page)).toEqual({ token: null, method: null });
  });
});

test.describe("a revoke GitHub refuses", () => {
  test.use({
    githubRoutes: routes([
      USER,
      UPSTREAM,
      FORK,
      FORK_BRANCHES,
      PROBE,
      { ...REVOKE, status: 422, body: { message: "Validation Failed" } },
    ]),
  });

  test("keeps the user signed in and says to delete the token by hand", async ({ app }) => {
    const { page } = app;
    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-submit").click();
    await expect(page.locator("#token-dialog")).toBeHidden();

    await page.locator("#header-menu-toggle").click();
    await page.locator("#github-signout-revoke").click();
    await page.locator("#confirm-ok").click();

    await expect(page.getByText("GitHub did not revoke the token")).toBeVisible();
    expect(await storedKeys(page)).toEqual({ token: TOKEN, method: "token" });
  });
});

test.describe("an OAuth sign-in", () => {
  test.use({ githubRoutes: routes([USER, UPSTREAM, FORK, FORK_BRANCHES]) });

  test("offers no revoke item", async ({ app }) => {
    const { page } = app;
    await page.evaluate((key) => localStorage.setItem(key, "gho_tier2"), TOKEN_KEY);
    await page.reload();
    await page.locator("#header-menu-toggle").click();
    await expect(page.locator("#github-signout")).toBeVisible();
    await expect(page.locator("#github-signout-revoke")).toHaveCount(0);
  });
});

test.describe("a token user opening the pull request", () => {
  const PR_URL = `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pull/7`;
  const SAVE_ROUTES = [
    { method: "GET", path: /\/contents\//, status: 404, body: { message: "Not Found" } },
    { method: "GET", path: /\/git\/ref\/heads\//, body: { object: { sha: "base-sha" } } },
    { method: "GET", path: /\/git\/commits\//, body: { sha: "base-sha", tree: { sha: "base-tree-sha" } } },
    { method: "POST", path: /\/git\/blobs$/, body: { sha: "blob-sha" } },
    { method: "POST", path: /\/git\/trees$/, body: { sha: "new-tree-sha" } },
    { method: "POST", path: /\/git\/commits$/, body: { sha: "new-commit-sha", tree: { sha: "new-tree-sha" } } },
    { method: "POST", path: /\/git\/refs$/, body: { ref: "refs/heads/x" } },
    { method: "PATCH", path: /\/git\/refs\/heads\//, body: { ref: "refs/heads/x" } },
    { method: "GET", path: /\/pulls\?/, body: [] },
  ];
  test.use({ githubRoutes: routes([USER, UPSTREAM, FORK, FORK_BRANCHES, PROBE, ...SAVE_ROUTES]) });

  test("Open PR opens the compare page, makes no POST to /pulls, and View PR appears on return", async ({ app }) => {
    const { page } = app;
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/pulls")) posts.push(request.url());
    });
    // The compare page is a real site; keep the test off the network.
    await page.context().route("https://github.com/**", (route) => route.fulfill({ status: 200, body: "stub" }));

    await openTokenDialog(page);
    await page.locator("#token-input").fill(TOKEN);
    await page.locator("#token-submit").click();
    await expect(page.locator("#token-dialog")).toBeHidden();

    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill("Compare Probe");
    await page.locator("#go").click();
    await expect(page.locator("#workspace")).toBeVisible();
    await page.locator("#github-save").click();
    await expect(page.locator("#github-open-pr")).toBeVisible();
    await page.locator("#build").click();
    await expect(page.locator("#status-text")).toHaveText(/^Built /);

    await page.locator("#github-open-pr").click();
    for (const box of await page.locator("#submit-checklist input[type=checkbox]").all()) await box.check();
    const popup = page.context().waitForEvent("page");
    await page.locator("#submit-confirm").click();
    const opened = await popup;

    const url = new URL(opened.url());
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toMatch(
      new RegExp(`^/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/compare/main\\.\\.\\.${LOGIN}:[^/]+$`),
    );
    expect(url.searchParams.get("quick_pull")).toBe("1");
    expect(url.searchParams.get("title")).toBe("New scenario: Compare Probe");
    expect(url.searchParams.get("body")).toContain("Edited in the browser mission book editor.");
    expect(posts).toEqual([]);
    await expect(page.locator("#status-text")).toHaveText("Finish the pull request on GitHub.");
    await expect(page.locator("#github-open-pr")).toBeVisible();

    // Registered last, so it runs first: the pull request now exists.
    await page.route(
      (u) => u.hostname === "api.github.com" && u.pathname.endsWith("/pulls"),
      (route) => route.fulfill({ status: 200, json: [{ html_url: PR_URL, number: 7 }] }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#github-pr-link")).toBeVisible();
    await expect(page.locator("#github-open-pr")).toBeHidden();
    expect(posts).toEqual([]);
  });
});

// Tier 2. URL awareness: "#/drafts/<name>" reopens a local autosave, an
// address that matches nothing is dropped, and opening a scenario writes its
// address. Signed out, so only local autosaves can match.

import { expect, test } from "./fixtures.mjs";

const DRAFT_PATH = "draft-scenarios/clash/route_probe.tex";
const DRAFT_TEXT = "% route probe draft\n";

test("a drafts address reopens the local autosave", async ({ app }) => {
  const { page } = app;
  await page.evaluate(
    ([path, text]) => {
      localStorage.setItem(`wasm-scenario-builder:draft:${path}`, text);
    },
    [DRAFT_PATH, DRAFT_TEXT],
  );
  await page.goto("/web/app/#/drafts/clash/route_probe");
  await page.reload();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#welcome")).toBeHidden();
  const value = await page.evaluate(() =>
    /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
  );
  expect(value).toBe(DRAFT_TEXT);
  expect(new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});

test("the same file name in another category is a different address", async ({ app }) => {
  const { page } = app;
  await page.evaluate(
    ([path, text]) => {
      localStorage.setItem(`wasm-scenario-builder:draft:${path}`, text);
    },
    [DRAFT_PATH, DRAFT_TEXT],
  );
  await page.goto("/web/app/#/drafts/coops/route_probe");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("an address that matches nothing is dropped", async ({ app }) => {
  const { page } = app;
  await page.goto("/web/app/#/drafts/clash/does_not_exist");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("an updates address is dropped when signed out", async ({ app }) => {
  const { page } = app;
  await page.goto("/web/app/#/updates/clash/gold_rush");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("starting a new scenario writes its address", async ({ app }) => {
  const { page } = app;
  await page.locator('[data-category="clash"]').click();
  await page.locator("#scenario-name").fill("Route Probe");
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});

test.describe("signed in with a branch on GitHub", () => {
  const LOGIN = "octotester";
  const REPO_PATH = "/repos/qwrtln/Homm3BG-mission-book";
  test.use({
    githubRoutes: [
      [
        { method: "GET", path: "/user", body: { login: LOGIN } },
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
        { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
        {
          method: "GET",
          path: /\/compare\//,
          body: { files: [{ filename: "draft-scenarios/clash/half_written.tex", sha: "s", status: "added" }] },
        },
        {
          method: "GET",
          path: /\/contents\/draft-scenarios\/clash\/half_written\.tex/,
          body: { content: btoa("% from branch\n") },
        },
      ],
      { option: true },
    ],
  });

  test("an address opened in a fresh page, with an OAuth query string, reopens the branch", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("github_token", "t"));
    await page.goto("/web/app/?iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth#/drafts/clash/half_written");
    await page.reload();

    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#github-signin")).toBeHidden();
    const value = await page.evaluate(() =>
      /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue(),
    );
    expect(value).toBe("% from branch\n");
  });
});

test("Save is not offered on the welcome screen when signed in", async ({ app }) => {
  const { page } = app;
  await page.evaluate(() => localStorage.setItem("github_token", "t"));
  await page.reload();
  await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
  await expect(page.locator("#github-save")).toBeHidden();
});

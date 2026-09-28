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

/**
 * Opens a new blank Clash scenario named "Route Probe", signed out.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openBlankClash(page) {
  await page.locator('[data-category="clash"]').click();
  await page.locator("#scenario-name").fill("Route Probe");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText("Ready.");
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>} the editor's text
 */
function editorValue(page) {
  return page.evaluate(() => /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue());
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<string | null>} the autosave stored for that path
 */
function storedDraft(page, path) {
  return page.evaluate((p) => localStorage.getItem(`wasm-scenario-builder:draft:${p}`), path);
}

const CLASH_PATH = "draft-scenarios/clash/route_probe.tex";
const COOPS_PATH = "draft-scenarios/coops/route_probe.tex";

test("changing the category before saving moves the autosave and the address", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page);
  const category = page.locator("#scenario-category");
  await expect(category).toHaveValue("clash");
  await expect(category).toBeEnabled();
  expect(await editorValue(page)).toContain("{Clash Scenario}");

  await category.selectOption("coops");

  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/coops/route_probe");
  const text = await editorValue(page);
  // The standard heading kind follows the category.
  expect(text).toContain("{Cooperative Scenario}");
  expect(text).not.toContain("{Clash Scenario}");
  expect(await storedDraft(page, CLASH_PATH)).toBeNull();
  expect(await storedDraft(page, COOPS_PATH)).toBe(text);
  await expect(page.locator("#category-note")).toBeHidden();

  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#scenario-category")).toHaveValue("coops");
  expect(await editorValue(page)).toBe(text);
  expect(new URL(page.url()).hash).toBe("#/drafts/coops/route_probe");
});

test("a hand-written heading kind survives a category change", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page);
  await page.evaluate(() => {
    const cm = /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror;
    cm.setValue(cm.getValue().replace("{Clash Scenario}", "{Clash/Alliance Scenario}"));
  });

  await page.locator("#scenario-category").selectOption("coops");

  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/coops/route_probe");
  const text = await editorValue(page);
  expect(text).toContain("{Clash/Alliance Scenario}");
  expect(await storedDraft(page, COOPS_PATH)).toBe(text);
});

test("a category change is refused when a local draft already sits there", async ({ app }) => {
  const { page } = app;
  const theirs = "% another draft of the same name\n";
  await page.evaluate(
    ([path, text]) => localStorage.setItem(`wasm-scenario-builder:draft:${path}`, text),
    [COOPS_PATH, theirs],
  );
  await openBlankClash(page);
  const mine = await editorValue(page);

  await page.locator("#scenario-category").selectOption("coops");

  await expect(page.locator("#scenario-category")).toHaveValue("clash");
  await expect(page.locator("#category-note")).toBeVisible();
  await expect(page.locator("#category-note")).toHaveText(
    "You already have a local draft with this name under Coop. Rename it or open that draft instead.",
  );
  expect(await editorValue(page)).toBe(mine);
  expect(await storedDraft(page, COOPS_PATH)).toBe(theirs);
  expect(await storedDraft(page, CLASH_PATH)).toBe(mine);
  expect(new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});

test("the category cannot move until the new scenario's text is in the editor", async ({ app }) => {
  const { page } = app;
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route("**/templates/default.tex", async (route) => {
    await held;
    await route.continue();
  });

  await page.locator('[data-category="clash"]').click();
  await page.locator("#scenario-name").fill("Route Probe");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText("Loading…");
  await expect(page.locator("#scenario-category")).toHaveValue("clash");
  await expect(page.locator("#scenario-category")).toBeDisabled();

  release();
  await expect(page.locator("#status-text")).toHaveText("Ready.");
  await expect(page.locator("#scenario-category")).toBeEnabled();
});

test("a category change is refused when the storage cannot take the moved copy", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page);
  const mine = await editorValue(page);
  // A full storage, for the new key only: the flush under the old key still lands.
  await page.evaluate((path) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === `wasm-scenario-builder:draft:${path}`) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  }, COOPS_PATH);

  await page.locator("#scenario-category").selectOption("coops");

  await expect(page.locator("#scenario-category")).toHaveValue("clash");
  await expect(page.locator("#category-note")).toHaveText(
    "Could not move the scenario: this browser's storage is full.",
  );
  expect(await editorValue(page)).toBe(mine);
  expect(await storedDraft(page, CLASH_PATH)).toBe(mine);
  expect(await storedDraft(page, COOPS_PATH)).toBeNull();
  expect(new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});

test("the sign-in round trip reopens at the moved path", async ({ app }) => {
  const { page } = app;
  await openBlankClash(page);
  await page.locator("#scenario-category").selectOption("campaigns");
  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/campaigns/route_probe");
  const text = await editorValue(page);

  // GitHub itself is never reached: its authorize page answers blank, and the
  // way back is a plain load of the app, as a sign-in that was abandoned.
  await page.route("https://github.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>GitHub</title>" }),
  );
  await page.locator("#github-signin").click();
  await page.waitForURL(/github\.com/);
  await page.goto("/web/app/");

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#scenario-category")).toHaveValue("campaigns");
  expect(await editorValue(page)).toBe(text);
  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/campaigns/route_probe");
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
    // The branch names the category now: it shows, read-only.
    await expect(page.locator("#scenario-category")).toHaveValue("clash");
    await expect(page.locator("#scenario-category")).toBeDisabled();
  });
});

test("Save is not offered on the welcome screen when signed in", async ({ app }) => {
  const { page } = app;
  await page.evaluate(() => localStorage.setItem("github_token", "t"));
  await page.reload();
  await expect(page.locator("#github-status")).not.toHaveAttribute("hidden");
  await expect(page.locator("#github-save")).toBeHidden();
});

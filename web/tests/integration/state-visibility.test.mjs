// Tier 2. What the app says about its own state: the status bar flags a PDF
// the editor has moved on from, disabled buttons look unavailable in both
// themes, and the signed-out header says what signing in is for.

import { expect, openScenarioList, test } from "./fixtures.mjs";

const SCENARIO_NAME = "tier two probe";
const STALE = "Source changed since last build.";

// A one-page PDF pdf.js can draw with no fonts: the stand-in published PDF.
const TINY_PDF = [
  "%PDF-1.4",
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
  "trailer<</Root 1 0 R>>",
  "%%EOF",
  "",
].join("\n");

/**
 * Answers the published-PDF CDN: with TINY_PDF, or with a 404 so the pick
 * opens with no PDF shown. Either way the real network is never reached.
 *
 * @param {import("@playwright/test").Page} page
 * @param {boolean} published
 * @returns {Promise<void>}
 */
async function stubPublishedPdf(page, published) {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    (route) =>
      published
        ? route.fulfill({ status: 200, contentType: "application/pdf", body: TINY_PDF })
        : route.fulfill({ status: 404, body: "" }),
  );
}

/**
 * Picks the first offered scenario, names it, and opens the editor.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openFirstScenario(page) {
  const results = await openScenarioList(page);
  await results.first().click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  // A published PDF is the original's, so the renamed pick says so instead.
  await expect(page.locator("#status-text")).toHaveText(
    /^(Ready\.|Published PDF of .+\. Build to see your changes\.)$/,
  );
}

/**
 * Types one character into the editor, the way a contributor does.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function editOnce(page) {
  await page.locator(".CodeMirror").click();
  await page.keyboard.type("x");
}

test("an edit after a build flags the PDF stale, and the next build clears it", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, false);
  await openFirstScenario(page);
  await expect(page.locator("#pdf-empty")).toBeVisible();

  const status = page.locator("#status-text");
  await page.locator("#build").click();
  await expect(status).toHaveText(/^Built /);

  await editOnce(page);
  await expect(status).toHaveText(STALE);
  // The PDF stays readable: flagged in words, never dimmed or covered.
  await expect(page.locator("#pdf-body canvas.pdf-page").first()).toBeVisible();

  await page.locator("#build").click();
  await expect(status).toHaveText(/^Built /);
});

test("an edit after the published PDF shows flags it stale", async ({ app }) => {
  const { page } = app;
  await stubPublishedPdf(page, true);
  await openFirstScenario(page);
  await expect(page.locator("#pdf-body canvas.pdf-page")).toHaveCount(1);

  await editOnce(page);
  await expect(page.locator("#status-text")).toHaveText(STALE);
});

test("a renamed pick says the published PDF is the original's, and Download names it so", async ({ app }) => {
  const { page } = app;
  /** @type {string[]} */
  const requested = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "raw.githubusercontent.com") requested.push(url.pathname);
  });
  await stubPublishedPdf(page, true);
  const results = await openScenarioList(page);
  const title = (await results.first().textContent()).trim();
  await results.first().click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#pdf-body canvas.pdf-page")).toHaveCount(1);

  // The editor holds the renamed copy; the PDF still shows the original.
  await expect(page.locator("#status-text")).toHaveText(`Published PDF of ${title}. Build to see your changes.`);

  const published = requested.find((pathname) => pathname.endsWith(".pdf"));
  expect(published, "the pick fetched a published PDF").toBeTruthy();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  const stem = download.suggestedFilename().replace(/\.pdf$/, "");
  expect(stem).not.toBe("tier_two_probe");
  // The CDN names the file after the scenario, plus a language suffix.
  expect(String(published).split("/").pop()).toMatch(new RegExp(`^${stem}_[a-z]+\\.pdf$`));
});

test("an edit with no PDF shown says nothing about staleness", async ({ app }) => {
  const { page } = app;
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#status-text")).toHaveText("Ready.");
  await expect(page.locator("#pdf-empty")).toBeVisible();

  await editOnce(page);
  await expect(page.locator(".CodeMirror")).toContainText("x");
  await expect(page.locator("#status-text")).toHaveText("Ready.");
});

for (const theme of ["light", "dark"]) {
  test(`disabled primary buttons are grey, not green, in the ${theme} theme`, async ({ app }) => {
    const { page } = app;
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);

    // Both carry index.html's own disabled attribute before a pick.
    for (const id of ["go", "build"]) {
      const button = page.locator(`#${id}`);
      await expect(button).toBeDisabled();
      const look = await button.evaluate((node) => {
        // Resolve each token to a colour the same way the button's own is.
        const probe = document.createElement("span");
        document.body.appendChild(probe);
        /** @param {string} token */
        const resolve = (token) => {
          probe.style.color = `var(${token})`;
          return getComputedStyle(probe).color;
        };
        const tokens = { paper: resolve("--paper"), muted: resolve("--muted"), line: resolve("--line") };
        probe.remove();
        const style = getComputedStyle(node);
        return {
          tokens,
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopColor,
          opacity: style.opacity,
        };
      });
      expect(look.background, `#${id} background`).toBe(look.tokens.paper);
      expect(look.color, `#${id} text`).toBe(look.tokens.muted);
      expect(look.border, `#${id} border`).toBe(look.tokens.line);
      expect(look.opacity, `#${id} opacity`).toBe("1");
    }
  });
}

test("signed out, the sign-in button says it is how to save only once a scenario is open", async ({ app }) => {
  const { page } = app;
  const signin = page.locator("#github-signin");
  // The welcome screen has nothing to save yet.
  await expect(signin).toBeVisible();
  await expect(signin).toHaveAccessibleName("Sign in with GitHub");
  await expect(signin.locator("svg.octicon")).toBeVisible();

  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(signin).toHaveAccessibleName("Sign in to save");
  await expect(signin.locator("svg.octicon")).toBeVisible();
});

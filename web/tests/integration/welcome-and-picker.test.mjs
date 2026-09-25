// Tier 2. The welcome screen and the scenario picker of web/app/index.html,
// driven in headless Chromium through the shared fixtures. Ranking itself
// (matchScore, groupedResults) belongs to tier 1; what is asserted here is the
// wiring tier 1 cannot see: which rows the dropdown draws, the keyboard and
// outside-click handlers, the selected row, the Open editor gate, and the
// hand-off from the welcome screen to the workspace.

import { withScenarioTitle } from "../../shared/build-plan.js";
import { expect, openScenarioList, test } from "./fixtures.mjs";

// config.js's TEMPLATES. These two are the app's own constants, not book
// content, and nothing in the DOM names them — a blank pick is the only way
// to reach them, so a test that checks what a blank pick loads has to.
const TEMPLATE_SCENARIO_PATH = "templates/default.tex";
const TEMPLATE_CAMPAIGN_PATH = "templates/campaign.tex";

// The smallest structurally valid PDF: one empty page, no fonts, no content
// stream. It stands in for a scenario's published PDF below.
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
 * Answers the published-PDF CDN with a stand-in PDF.
 *
 * Picking a real entry starts prefetchScenario, which asks
 * raw.githubusercontent.com for that scenario's published PDF. That host is
 * outside installGithubStub's api.github.com interception, so without this a
 * pick reaches the real network. A 200 rather than a 404: Chromium reports a
 * failed resource load on the console, which would land in `errors` and say
 * nothing about the app.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function stubPublishedPdf(page) {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    async (route) => {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: TINY_PDF });
    },
  );
}

/**
 * The dropdown's row titles, in the order drawn.
 *
 * @param {import("@playwright/test").Locator} results
 * @returns {Promise<string[]>}
 */
async function titlesOf(results) {
  return (await results.allTextContents()).map((text) => text.trim());
}

/**
 * The editor's text, read off the CodeMirror instance rather than the DOM:
 * CodeMirror only renders the lines in view, so the visible text is not the
 * document. CodeMirror 5 hangs the instance on its own wrapper element.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>}
 */
async function editorValue(page) {
  return page.evaluate(() => {
    const wrapper = /** @type {any} */ (document.querySelector(".CodeMirror"));
    return wrapper ? wrapper.CodeMirror.getValue() : "";
  });
}

/**
 * One repository file, fetched the same way the app fetches it (through the
 * static server's /web/repo/ alias), so an assertion about the editor's
 * contents names no scenario and hardcodes no source.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path repository-relative path
 * @returns {Promise<string>}
 */
async function repoFile(page, path) {
  const response = await page.request.get(`/web/repo/${path}`);
  expect(response.ok(), `the static server would not serve ${path}`).toBe(true);
  return response.text();
}

test("a cold load shows the welcome screen, with the workspace and its actions hidden", async ({ app }) => {
  const { page, errors } = app;

  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  // The build/download/upload cluster belongs to the workspace, and
  // commitEntry is the only thing that unhides it.
  await expect(page.locator("#header-actions")).toBeHidden();
  // Nothing is picked and nothing is named yet.
  await expect(page.locator("#search-results")).toBeHidden();
  await expect(page.locator("#go")).toBeDisabled();
  // A greyed-out button says why it is greyed out.
  await expect(page.locator("#go-hint")).toHaveText("Pick a scenario or a blank template first.");
  await expect(page.locator("#name-error")).toBeHidden();

  expect(errors, "the page reported errors on a cold load").toEqual([]);
});

test("typing a query filters the dropdown to the rows that match", async ({ app }) => {
  const { page, errors } = app;
  const search = page.locator("#search");
  const results = await openScenarioList(page);

  const allTitles = await titlesOf(results);
  const query = allTitles[0];

  // A control row that cannot match this query under any matching rule the
  // app could use: it is missing at least one character the query needs, so
  // neither a substring nor an in-order-letters match can reach it. This only
  // picks the row; the ranking it would get is tier 1's business.
  const queryChars = [...query.toLowerCase()];
  const control = allTitles.slice(1).find((title) => {
    const present = new Set(title.toLowerCase());
    return queryChars.some((character) => !present.has(character));
  });
  expect(control, `no row differs from "${query}" enough to serve as a control`).toBeDefined();

  await search.fill(query);

  await expect.poll(() => titlesOf(results), { message: "the query's own row was filtered out" }).toContain(query);
  const filtered = await titlesOf(results);
  expect(filtered, "a row that cannot match the query was still drawn").not.toContain(control);
  expect(filtered.length, "the query drew as many rows as the empty search did").toBeLessThan(allTitles.length);

  // The other end of the same wiring: a query nothing matches draws the empty
  // state instead of rows.
  await search.fill("qqzzxxjj");
  await expect(page.locator("#search-results .combobox-empty")).toHaveText("No scenario matches.");
  await expect(results).toHaveCount(0);

  expect(errors, "the page reported errors while filtering").toEqual([]);
});

test("a search that finds nothing offers the blank templates, and one of them picks it", async ({ app }) => {
  const { page, errors } = app;
  const search = page.locator("#search");
  await openScenarioList(page);

  await search.fill("qqzzxxjj");
  const blanks = page.locator("#search-results [data-blank]");
  // One per category, named the way the book names them.
  await expect(blanks).toHaveText([
    "Start a blank Clash scenario",
    "Start a blank Coop scenario",
    "Start a blank Alliance scenario",
    "Start a blank Campaign scenario",
  ]);

  // The same pick the blank-template row makes: the same title in the search
  // box, and the matching button in that row shows as chosen.
  await page.locator("#search-results").getByRole("button", { name: "Start a blank Coop scenario" }).click();
  await expect(page.locator("#search-results")).toBeHidden();
  await expect(page.locator("#scratch-coop")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#scratch-clash")).toHaveAttribute("aria-pressed", "false");
  const blankTitle = await search.inputValue();
  await page.locator("#scratch-clash").click();
  await expect(search).toHaveValue(blankTitle);
  await expect(page.locator("#go-hint")).toHaveText("Name your scenario to continue.");

  // From the keyboard too: Tab reaches the action, Enter presses it.
  await search.fill("qqzzxxjj");
  await page.locator("#search-results [data-blank='campaigns']").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scratch-campaign")).toHaveAttribute("aria-pressed", "true");
  await expect(search, "the campaign action picked the scenario template").not.toHaveValue(blankTitle);

  expect(errors, "the page reported errors while starting from a no-match search").toEqual([]);
});

test("ArrowDown moves the highlight, Escape hides the list, Enter takes the highlighted row", async ({ app }) => {
  const { page, errors } = app;
  await stubPublishedPdf(page);
  const search = page.locator("#search");
  const results = await openScenarioList(page);
  expect(await results.count(), "this needs at least two rows to move between").toBeGreaterThan(1);

  // search.js tracks the highlight with an "active" class on the row.
  await search.press("ArrowDown");
  await expect(results.nth(0)).toHaveClass(/\bactive\b/);

  await search.press("Escape");
  await expect(page.locator("#search-results")).toBeHidden();

  // Reopening redraws the list, which resets the highlight to no row.
  await openScenarioList(page);
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  const secondTitle = (await results.nth(1).textContent()).trim();
  await expect(results.nth(1)).toHaveClass(/\bactive\b/);
  await expect(results.nth(0)).not.toHaveClass(/\bactive\b/);

  await search.press("Enter");
  await expect(search).toHaveValue(secondTitle);
  await expect(page.locator("#search-results")).toBeHidden();

  expect(errors, "the page reported errors while driving the list from the keyboard").toEqual([]);
});

test("clicking outside the combobox hides the list", async ({ app }) => {
  const { page, errors } = app;
  await openScenarioList(page);
  await expect(page.locator("#search-results")).toBeVisible();

  // Anywhere outside .combobox: the handler is on document, and closes the
  // list for everything that is not the search box or its dropdown.
  await page.locator("header h1").click();
  await expect(page.locator("#search-results")).toBeHidden();

  expect(errors, "the page reported errors while dismissing the list").toEqual([]);
});

test("Open editor needs both a pick and a valid name, and says which is missing", async ({ app }) => {
  const { page, errors } = app;
  await stubPublishedPdf(page);
  const go = page.locator("#go");
  const name = page.locator("#scenario-name");

  const goHint = page.locator("#go-hint");
  const nameError = page.locator("#name-error");

  // Nothing is picked yet, so there is nothing to name.
  await expect(go).toBeDisabled();
  await expect(goHint).toHaveText("Pick a scenario or a blank template first.");

  const results = await openScenarioList(page);
  const first = results.first();
  const firstTitle = (await first.textContent()).trim();
  // click() sends a real mouse sequence including the mousedown search.js
  // listens for, so the pick lands before the input's blur hides the list.
  await first.click();

  await expect(page.locator("#search")).toHaveValue(firstTitle);
  // Picked, still unnamed.
  await expect(go).toBeDisabled();
  await expect(goHint).toHaveText("Name your scenario to continue.");
  // An empty field is not a mistake yet, so no error sits under the input.
  await expect(nameError).toBeHidden();

  await name.fill("ab");
  await expect(go, "two characters were accepted as a name").toBeDisabled();
  await expect(nameError).toHaveText("Use at least 3 characters.");
  await name.fill("  a  ");
  await expect(go, "a padded single character was accepted as a name").toBeDisabled();

  // Titles only: the file name and the branch are derived from this.
  await name.fill("bad/name?");
  await expect(go, "a name with punctuation was accepted").toBeDisabled();
  await expect(nameError).toHaveText("Use letters, digits, spaces, hyphens and apostrophes only.");

  await name.fill("The Queen's Gambit 2");
  await expect(go).toBeEnabled();
  await expect(nameError).toBeHidden();
  await expect(goHint).toHaveText("");

  expect(errors, "the page reported errors while picking and naming").toEqual([]);
});

test("Open editor leaves the welcome screen and loads the picked scenario's source", async ({ app }) => {
  const { page, errors } = app;
  await stubPublishedPdf(page);

  const results = await openScenarioList(page);
  const first = results.first();
  const firstPath = await first.getAttribute("data-path");
  expect(firstPath).toMatch(/\.tex$/);
  await first.click();

  await page.locator("#scenario-name").fill("welcome picker test");
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#header-actions")).toBeVisible();
  // The source is the picked entry's own file, fetched here the same way the
  // app fetches it rather than pinned to any one scenario.
  // Only its title slot changes: the typed name replaces the entry's own.
  const expected = withScenarioTitle(await repoFile(page, firstPath), "welcome picker test");
  await expect
    .poll(() => editorValue(page), { message: "the picked scenario's source never reached the editor" })
    .toBe(expected);
  // Nothing was autosaved for this identity, so the draft note stays hidden.
  await expect(page.locator("#draft-note")).toBeHidden();

  expect(errors, "the page reported errors while opening a scenario").toEqual([]);
});

test("the blank-scenario links pick a template, and Open editor loads that template's source", async ({ app }) => {
  const { page, errors } = app;
  const go = page.locator("#go");
  const selectedTitle = page.locator("#search");

  // The three category links all pick the one scenario template; only the
  // draft-scenarios subdirectory they carry differs.
  await page.locator("#scratch-clash").click();
  const blankTitle = await selectedTitle.inputValue();
  expect(blankTitle.length).toBeGreaterThan(0);
  // A blank pick alone does not open the door either.
  await expect(go).toBeDisabled();

  await page.locator("#scratch-coop").click();
  await expect(selectedTitle).toHaveValue(blankTitle);
  await page.locator("#scratch-alliance").click();
  await expect(selectedTitle).toHaveValue(blankTitle);

  // The campaign link is the one with a template of its own.
  await page.locator("#scratch-campaign").click();
  const campaignTitle = await selectedTitle.inputValue();
  expect(campaignTitle, "the campaign button picked the same template as the others").not.toBe(blankTitle);

  await page.locator("#scratch-clash").click();
  await expect(selectedTitle).toHaveValue(blankTitle);
  // The line is one control: only the picked category shows as chosen.
  await expect(page.locator("#scratch-clash")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#scratch-campaign")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#scenario-name").fill("blank test");
  await expect(go).toBeEnabled();
  await go.click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#welcome")).toBeHidden();
  const blankSource = await repoFile(page, TEMPLATE_SCENARIO_PATH);
  const blankExpected = withScenarioTitle(blankSource, "blank test");
  await expect
    .poll(() => editorValue(page), { message: "the blank template never reached the editor" })
    .toBe(blankExpected);
  // A template is not a scenario: it has no published PDF to prefetch, so
  // nothing here needed the CDN stubbed.
  const campaignSource = await repoFile(page, TEMPLATE_CAMPAIGN_PATH);
  expect(blankSource, "the two templates are indistinguishable").not.toBe(campaignSource);

  expect(errors, "the page reported errors while starting from a blank scenario").toEqual([]);
});

test("the name step is dimmed and out of reach until there is a pick", async ({ app }) => {
  const { page, errors } = app;
  const step = page.locator("#name-slide");
  const name = page.locator("#scenario-name");

  await expect(step).toBeVisible();
  await expect(step).toHaveAttribute("inert", "");
  await expect(step).toHaveClass(/dimmed/);
  await name.evaluate((input) => input.focus());
  await expect(name, "the name field took focus before a pick").not.toBeFocused();

  await page.locator("#scratch-clash").click();

  await expect(step).not.toHaveAttribute("inert", "");
  await expect(step).not.toHaveClass(/dimmed/);
  await name.focus();
  await expect(name).toBeFocused();

  expect(errors, "the page reported errors while gating the name step").toEqual([]);
});

test("at 1440×900 the picker is one centred column, with blank starts quieter than search", async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 1440, height: 900 });

  const column = await page.locator("#welcome-picker").boundingBox();
  expect(column, "the picker has no box").not.toBeNull();
  if (!column) return;
  expect(Math.abs(column.x + column.width / 2 - 720), "the column is not centred").toBeLessThan(2);
  expect(column.width, "the column is not a single narrow column").toBeLessThan(720);

  const lefts = await Promise.all(
    ["#pick-heading", "#name-heading", "#search", "#scenario-name", "#go"].map(async (selector) => {
      const box = await page.locator(selector).boundingBox();
      return box?.x;
    }),
  );
  for (const left of lefts) expect(left, "the steps do not share one left edge").toBeCloseTo(column.x, 0);

  const fontSize = (/** @type {string} */ selector) =>
    page.locator(selector).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(await fontSize("#scratch-clash"), "the blank links are as loud as the search box").toBeLessThan(
    await fontSize("#search"),
  );
});

test("Tab walks search, the blank links, the name and Open editor, and shows where focus is", async ({ app }) => {
  const { page } = app;
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill("Tab Probe");

  await page.locator("#search").focus();
  // Focusing the search box opens its dropdown; closed, Tab leaves the box.
  await page.keyboard.press("Escape");
  await expect(page.locator("#search-results")).toBeHidden();

  for (const id of ["scratch-clash", "scratch-coop", "scratch-alliance", "scratch-campaign"]) {
    await page.keyboard.press("Tab");
    const link = page.locator(`#${id}`);
    await expect(link).toBeFocused();
    expect(await link.evaluate((node) => getComputedStyle(node).outlineStyle), `#${id} shows no focus`).not.toBe(
      "none",
    );
  }
  await page.keyboard.press("Tab");
  await expect(page.locator("#scenario-name")).toBeFocused();
  await page.keyboard.press("Tab");
  const go = page.locator("#go");
  await expect(go).toBeFocused();
  expect(await go.evaluate((node) => getComputedStyle(node).outlineStyle), "Open editor shows no focus").not.toBe(
    "none",
  );
});

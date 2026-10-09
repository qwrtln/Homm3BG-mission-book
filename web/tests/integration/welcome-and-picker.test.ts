// Tier 2. The welcome screen and the scenario picker of web/app/index.html,
// driven in headless Chromium through the shared fixtures. Ranking itself
// (matchScore, groupedResults) belongs to tier 1; what is asserted here is the
// wiring tier 1 cannot see: which rows the dropdown draws, the keyboard and
// outside-click handlers, the selected row, the Open editor gate, and the
// hand-off from the welcome screen to the workspace.

import type { Locator, Page } from "@playwright/test";
import { withScenarioTitle } from "../../shared/build-plan.ts";
import { withScenarioKind } from "../../shared/scenario-name.ts";
import { editorText } from "../helpers/editor.ts";
import { expect, openScenarioList, test } from "./fixtures.ts";

// config.ts's TEMPLATES. These two are the app's own constants, not book
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
 */
async function stubPublishedPdf(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    async (route) => {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: TINY_PDF });
    },
  );
}

/**
 * The dropdown's row titles, in the order drawn.
 */
async function titlesOf(results: Locator): Promise<string[]> {
  return (await results.allTextContents()).map((text) => text.trim());
}

/**
 * One repository file, fetched the same way the app fetches it (through the
 * static server's /web/repo/ alias), so an assertion about the editor's
 * contents names no scenario and hardcodes no source.
 *
 * @param path repository-relative path
 */
async function repoFile(page: Page, path: string): Promise<string> {
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

  // SearchCombobox.tsx tracks the highlight with an "active" class on the row.
  await search.press("ArrowDown");
  await expect(results.nth(0)).toHaveClass(/\bactive\b/);

  await search.press("Escape");
  await expect(page.locator("#search-results")).toBeHidden();

  // Reopening redraws the list, which resets the highlight to no row.
  await openScenarioList(page);
  await search.press("ArrowDown");
  await search.press("ArrowDown");
  const secondTitle = ((await results.nth(1).textContent()) as string).trim();
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
  const firstTitle = ((await first.textContent()) as string).trim();
  // click() sends a real mouse sequence including the mousedown SearchCombobox.tsx
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
  const expected = withScenarioTitle(await repoFile(page, firstPath as string), "welcome picker test");
  await expect
    .poll(() => editorText(page), { message: "the picked scenario's source never reached the editor" })
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
  // Filed under Clash, so the template's heading names a Clash scenario.
  const blankExpected = withScenarioKind(withScenarioTitle(blankSource, "blank test"), "clash");
  expect(blankExpected).toContain("{Clash Scenario}{blank test}");
  await expect
    .poll(() => editorText(page), { message: "the blank template never reached the editor" })
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

  const fontSize = (selector: string) =>
    page.locator(selector).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(await fontSize("#scratch-clash"), "the blank links are as loud as the search box").toBeLessThan(
    await fontSize("#search"),
  );
});

test("Tab walks the start choice, search, the blank links, the name, the category and Open editor, showing focus", async ({
  app,
}) => {
  const { page } = app;
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill("Tab Probe");

  // The start choice comes before search.
  await page.locator("#start-copy").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#start-wizard")).toBeFocused();
  expect(
    await page.locator("#start-wizard").evaluate((node) => getComputedStyle(node).outlineStyle),
    "#start-wizard shows no focus",
  ).not.toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.locator("#search")).toBeFocused();
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
  // A radio group is one Tab stop: the checked radio. Its label draws the ring.
  await page.keyboard.press("Tab");
  const radio = page.locator("#category-choice input[value='clash']");
  await expect(radio).toBeFocused();
  expect(
    await radio.evaluate((node) => getComputedStyle(node.closest("label") as Element).outlineStyle),
    "the category choice shows no focus",
  ).not.toBe("none");
  await page.keyboard.press("Tab");
  const go = page.locator("#go");
  await expect(go).toBeFocused();
  expect(await go.evaluate((node) => getComputedStyle(node).outlineStyle), "Open editor shows no focus").not.toBe(
    "none",
  );
});

test("copying a scenario preselects its category, and a switch files the copy elsewhere", async ({ app }) => {
  const { page, errors } = app;
  await stubPublishedPdf(page);

  const results = await openScenarioList(page);
  const clash = results.and(page.locator("[data-path^='clash/']")).first();
  const clashPath = await clash.getAttribute("data-path");
  expect(clashPath, "the book has no Clash scenario to copy").toBeTruthy();
  await clash.click();

  await expect(page.locator("#category-choice input[value='clash']")).toBeChecked();
  await expect(page.locator("#category-hint")).toHaveText("Filed in the Draft Scenarios under Clash.");

  await page.locator("#category-choice").getByLabel("Coop").check();
  await expect(page.locator("#category-choice input[value='clash']")).not.toBeChecked();
  await expect(page.locator("#category-hint")).toHaveText("Filed in the Draft Scenarios under Coop.");
  // A copy keeps its source whatever it is filed under.
  await expect(page.locator("#search")).toHaveValue((await clash.textContent())?.trim() ?? "");

  await page.locator("#scenario-name").fill("Filed Elsewhere");
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page).toHaveURL(/#\/drafts\/coops\/[^/]+$/);
  // The heading names the kind it is filed under, not the Clash it came from.
  await expect
    .poll(() => editorText(page), { message: "the copy's heading never named its new kind" })
    .toMatch(/\\addscenariosection\{1\}\{Cooperative Scenario\}\{Filed Elsewhere\}/);

  expect(errors, "the page reported errors while filing a copy elsewhere").toEqual([]);
});

test("a blank pick follows the category, swapping to the campaign template and back", async ({ app }) => {
  const { page, errors } = app;
  const search = page.locator("#search");

  await page.locator("#scratch-clash").click();
  const blankTitle = await search.inputValue();
  await expect(page.locator("#category-choice input[value='clash']")).toBeChecked();

  await page.locator("#category-choice").getByLabel("Campaign").check();
  await expect(page.locator("#scratch-campaign")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#scratch-clash")).toHaveAttribute("aria-pressed", "false");
  await expect(search).not.toHaveValue(blankTitle);

  // And back: the other categories share the default template.
  await page.locator("#category-choice").getByLabel("Alliance").check();
  await expect(page.locator("#scratch-alliance")).toHaveAttribute("aria-pressed", "true");
  await expect(search).toHaveValue(blankTitle);

  await page.locator("#category-choice").getByLabel("Campaign").check();
  await page.locator("#scenario-name").fill("Blank Campaign Test");
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  const expected = withScenarioTitle(await repoFile(page, TEMPLATE_CAMPAIGN_PATH), "Blank Campaign Test");
  await expect
    .poll(() => editorText(page), { message: "the campaign template never reached the editor" })
    .toBe(expected);
  await expect(page).toHaveURL(/#\/drafts\/campaigns\/[^/]+$/);

  expect(errors, "the page reported errors while swapping blank templates").toEqual([]);
});

test("the category choice is dimmed until there is a pick", async ({ app }) => {
  const { page, errors } = app;
  const choice = page.locator("#category-choice");
  const radio = choice.locator("input[value='coops']");

  await expect(choice).toBeVisible();
  // It sits inside the name step and shares its dimming.
  await expect(page.locator("#name-slide #category-choice")).toHaveCount(1);
  await expect(page.locator("#name-slide")).toHaveAttribute("inert", "");
  await expect(choice.locator("input:checked")).toHaveCount(0);
  await radio.evaluate((input) => input.focus());
  await expect(radio, "a category took focus before a pick").not.toBeFocused();

  await page.locator("#scratch-coop").click();

  await expect(page.locator("#name-slide")).not.toHaveAttribute("inert", "");
  await expect(radio).toBeChecked();
  await radio.focus();
  await expect(radio).toBeFocused();

  expect(errors, "the page reported errors while gating the category choice").toEqual([]);
});

// A copy is keyed by the typed name and game mode, not by the scenario it
// copies. A second copy under the same name and game mode, from another
// scenario, meets the first one's local draft: the app asks which one opens,
// rather than opening the draft over the other scenario's published PDF.
test.describe("a copy whose name already has a local draft", () => {
  const NAME = "Draft Clash";
  const DRAFT_KEY = "wasm-scenario-builder:draft:draft-scenarios/clash/draft_clash.tex";
  const DRAFT_TEXT = "% the first copy, edited\n";

  /**
   * Seeds the draft, picks a Clash scenario and opens it under NAME.
   *
   * @param page the page under test
   * @returns the picked scenario's path
   */
  async function copyOverDraft(page: Page): Promise<string> {
    await stubPublishedPdf(page);
    await page.evaluate(([key, text]: [string, string]) => localStorage.setItem(key, text), [DRAFT_KEY, DRAFT_TEXT] as [
      string,
      string,
    ]);
    const results = await openScenarioList(page);
    const clash = results.and(page.locator("[data-path^='clash/']")).first();
    const path = await clash.getAttribute("data-path");
    expect(path, "the book has no Clash scenario to copy").toBeTruthy();
    await clash.click();
    await page.locator("#scenario-name").fill(NAME);
    await page.locator("#go").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("Replace your draft?");
    return path as string;
  }

  test("Replace opens a fresh copy of the picked scenario, with its published PDF", async ({ app }) => {
    const { page, errors } = app;
    const path = await copyOverDraft(page);
    await expect(page.locator("#confirm-ok")).toHaveText("Replace");

    await page.locator("#confirm-ok").click();

    const expected = withScenarioKind(withScenarioTitle(await repoFile(page, path), NAME), "clash");
    await expect
      .poll(() => editorText(page), { message: "the picked scenario never replaced the draft" })
      .toBe(expected);
    await expect(page.locator("#draft-note")).toBeHidden();
    await expect(page.locator("#pdf-body canvas.pdf-page")).toHaveCount(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).not.toBe(DRAFT_TEXT);

    expect(errors, "the page reported errors while replacing a draft").toEqual([]);
  });

  test("Keep opens the draft, without the picked scenario's published PDF", async ({ app }) => {
    const { page, errors } = app;
    await copyOverDraft(page);
    await expect(page.locator("#confirm-cancel")).toHaveText("Open my draft");

    await page.locator("#confirm-cancel").click();

    await expect.poll(() => editorText(page), { message: "the draft never reached the editor" }).toBe(DRAFT_TEXT);
    await expect(page.locator("#draft-note")).toBeVisible();
    await expect(page.locator("#status-text")).toHaveText(/^Ready\./);
    await expect(page.locator("#pdf-body canvas.pdf-page")).toHaveCount(0);

    expect(errors, "the page reported errors while keeping a draft").toEqual([]);
  });

  test("an untouched draft opens the copy without asking", async ({ app }) => {
    const { page, errors } = app;
    await stubPublishedPdf(page);
    const results = await openScenarioList(page);
    const clash = results.and(page.locator("[data-path^='clash/']")).first();
    const path = (await clash.getAttribute("data-path")) as string;
    const pristine = withScenarioKind(withScenarioTitle(await repoFile(page, path), NAME), "clash");
    await page.evaluate(([key, text]: [string, string]) => localStorage.setItem(key, text), [DRAFT_KEY, pristine] as [
      string,
      string,
    ]);
    await clash.click();
    await page.locator("#scenario-name").fill(NAME);
    await page.locator("#go").click();

    await expect(page.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(page)).toBe(pristine);
    await expect(page.locator("#confirm-dialog")).toBeHidden();

    expect(errors, "the page reported errors while reopening an untouched copy").toEqual([]);
  });
});

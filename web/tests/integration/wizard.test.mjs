// Tier 2. The start wizard on the welcome screen: entering and leaving it,
// the gates on its required panes, the Next / Skip button, and the hand-off
// that opens the generated scenario in the editor with its header image
// staged. What the generator writes for each answer is tier 1's business
// (scenario-wizard.test.mjs); here the text is only checked to have arrived.

import { fillScenarioTemplate, WIZARD_TEMPLATE_PATH } from "../../shared/scenario-wizard.ts";
import { expect, test } from "./fixtures.mjs";

const NAME = "Wizard Probe";
const SLUG = "wizard_probe";
const MAP_EDITOR = "https://zedero.github.io/homm3boardgame/";

/**
 * The editor's text, read off the CodeMirror instance: it renders only the
 * lines in view.
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
 * One repository file, through the static server's /web/repo/ alias.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<string>}
 */
async function repoFile(page, path) {
  const response = await page.request.get(`/web/repo/${path}`);
  expect(response.ok(), `the static server would not serve ${path}`).toBe(true);
  return response.text();
}

/**
 * @param {string} name
 * @param {string} [mimeType]
 * @returns {{name: string, mimeType: string, buffer: Buffer}}
 */
function fakeFile(name, mimeType = "image/png") {
  return { name, mimeType, buffer: Buffer.from("not really an image, and never decoded") };
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function openWizard(page) {
  await page.locator("#start-wizard").click();
  await expect(page.locator("#wizard")).toBeVisible();
}

/**
 * Fills pane 1 with a valid name and a game mode, and moves on.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{name?: string, mode?: string, author?: string, header?: ReturnType<typeof fakeFile>}} [options]
 * @returns {Promise<void>}
 */
async function answerBasics(page, { name = NAME, mode = "Clash", author, header } = {}) {
  await page.locator("#wizard-name").fill(name);
  await page.locator("#wizard-category").getByLabel(mode).check();
  if (author) await page.locator("#wizard-author").fill(author);
  if (header) {
    await page.locator("#wizard-header").setInputFiles(header);
    await expect(page.locator("#wizard-header-preview")).toHaveAttribute("src", /^blob:/);
  }
  await page.locator("#wizard-next").click();
  await expect(page.locator("#wizard-pane-lore")).toBeVisible();
}

/** @typedef {"resources" | "units" | "buildings" | "pool" | "map" | "conditions" | "events" | "rules" | "maps"} LaterPane */

/** Panes 4-12, in order. The last one creates the scenario. @type {LaterPane[]} */
const LATER_PANES = ["resources", "units", "buildings", "pool", "map", "conditions", "events", "rules", "maps"];

/**
 * From pane 1 to pane 4: a valid name and game mode, no lore, 12 Rounds.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{name?: string, mode?: string}} [options]
 * @returns {Promise<void>}
 */
async function reachSetup(page, options = {}) {
  await openWizard(page);
  await answerBasics(page, options);
  await page.locator("#wizard-next").click(); // Skip the lore
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await page.locator("#wizard-next").click();
  await expect(page.locator("#wizard-pane-resources")).toBeVisible();
}

/**
 * Goes through panes 4-12 and creates the scenario. A pane without an answer
 * callback is skipped: the prefilled Starting Units are cleared first, and
 * pane 6 goes on with nothing ticked. Pane 4's income and resources fields
 * are prefilled with actual values, so it is always answered and left as it
 * is unless the caller's callback changes it.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Partial<Record<LaterPane, () => Promise<void>>>} [answer]
 * @returns {Promise<void>}
 */
async function runSetup(page, answer = {}) {
  for (const pane of LATER_PANES) {
    await expect(page.locator(`#wizard-pane-${pane}`)).toBeVisible();
    const fill = answer[pane];
    if (fill) await fill();
    else if (pane === "units") await page.locator("#wizard-units").fill("");
    await page.locator("#wizard-next").click();
  }
  await expect(page.locator("#workspace")).toBeVisible();
}

/**
 * Presses Next, or Back, until the pane shows.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} pane the pane id after "wizard-pane-"
 * @param {"next" | "back"} button
 * @returns {Promise<void>}
 */
async function moveTo(page, pane, button = "next") {
  const target = page.locator(`#wizard-pane-${pane}`);
  for (let i = 0; i < 12 && !(await target.isVisible()); i++) await page.locator(`#wizard-${button}`).click();
  await expect(target).toBeVisible();
}

/**
 * Leaves the editor for the welcome screen, past the unsaved-work question.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function backToWelcome(page) {
  await page.locator("#back-to-welcome").click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#welcome-picker")).toBeVisible();
}

test("the start choice switches between copy or blank and the wizard", async ({ app }) => {
  const { page, errors } = app;

  await expect(page.locator("#wizard")).toBeHidden();
  await expect(page.locator("#start-copy")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#start-wizard")).toHaveAttribute("aria-pressed", "false");
  await openWizard(page);
  await expect(page.locator("#start-wizard")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#start-copy")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#search")).toBeHidden();
  await expect(page.locator("#go")).toBeHidden();
  await expect(page.locator("#resume-drafts")).toBeHidden();
  await expect(page.locator("#wizard-pane-basics")).toBeVisible();
  await expect(page.locator("#wizard-pane-lore")).toBeHidden();
  await expect(page.locator("#wizard-step")).toHaveText(/^Step 1 of \d+$/);
  // Game mode comes first, then the name, the author and the header image,
  // each under its own heading, and none of them marked "(optional)".
  await expect(page.locator("#wizard-category input").first()).toBeFocused();
  await expect(page.locator("#wizard-pane-basics :is(h3, legend)")).toHaveText([
    "Game mode",
    "Scenario name",
    "Author",
    "Header image",
  ]);
  await expect(page.locator("#wizard-pane-basics")).not.toContainText("optional");
  // The browser's own file picker never shows; the Add button stands in for it.
  await expect(page.locator("#wizard-header")).toBeHidden();
  await expect(page.locator("#wizard-header-add")).toBeVisible();
  await expect(page.locator("#wizard-back")).toBeDisabled();
  // Nothing is preselected.
  await expect(page.locator("#wizard-category input:checked")).toHaveCount(0);
  await expect(page.locator("#wizard-category legend")).toHaveText("Game mode");
  // Campaign is not in the wizard.
  await expect(page.locator("#wizard-category input")).toHaveCount(3);

  await page.locator("#start-copy").click();
  await expect(page.locator("#wizard")).toBeHidden();
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#go")).toBeVisible();

  expect(errors, "the page reported errors while switching the start choice").toEqual([]);
});

test("pane 1 needs a valid name and a game mode, and refuses a name with a local draft", async ({ app }) => {
  const { page, errors } = app;
  await page.evaluate(
    (path) => localStorage.setItem(`wasm-scenario-builder:draft:${path}`, "% an earlier draft\n"),
    `draft-scenarios/coops/${SLUG}.tex`,
  );
  await openWizard(page);
  const next = page.locator("#wizard-next");
  const error = page.locator("#wizard-name-error");

  await expect(next).toBeDisabled();
  await expect(page.locator("#wizard-hint")).toHaveText("Name your scenario to continue.");

  await page.locator("#wizard-name").fill("ab");
  await expect(error).toHaveText("Use at least 3 characters.");
  await expect(next).toBeDisabled();

  await page.locator("#wizard-name").fill(NAME);
  await expect(error).toBeHidden();
  await expect(next, "a name without a game mode was accepted").toBeDisabled();
  await expect(page.locator("#wizard-hint")).toHaveText("Choose a game mode to continue.");

  // The same name already has a draft under Coop.
  await page.locator("#wizard-category").getByLabel("Coop").check();
  await expect(error).toHaveText(
    "You already have a local draft with this name under Coop. Open it from the list, or pick another name.",
  );
  await expect(next).toBeDisabled();

  // Filed elsewhere, it collides with nothing.
  await page.locator("#wizard-category").getByLabel("Clash").check();
  await expect(error).toBeHidden();
  await expect(next).toBeEnabled();
  await expect(next).toHaveText("Next");

  // A bad header file is refused, and nothing is kept.
  await page.locator("#wizard-header").setInputFiles(fakeFile("art.webp", "image/webp"));
  await expect(page.locator("#wizard-header-status")).toHaveClass(/bad/);
  await expect(page.locator("#wizard-header-preview")).toBeHidden();

  await next.click();
  await expect(page.locator("#wizard-pane-lore")).toBeVisible();
  await expect(page.locator("#wizard-step")).toHaveText(/^Step 2 of \d+$/);

  expect(errors, "the page reported errors on pane 1").toEqual([]);
});

test("a skipped pane shows a grey Skip button, an answered one a green Next button", async ({ app }) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page);
  const next = page.locator("#wizard-next");

  await expect(page.locator("#wizard-lore")).toHaveAttribute("placeholder", /Power struggle at the border/);
  await expect(next).toHaveText("Skip");
  await expect(next).not.toHaveClass(/\bprimary\b/);
  await expect(next).toBeEnabled();

  await page.locator("#wizard-lore").fill("A dark tale.");
  await expect(next).toHaveText("Next");
  await expect(next).toHaveClass(/\bprimary\b/);

  await page.locator("#wizard-lore").fill("   ");
  await expect(next).toHaveText("Skip");

  // Back keeps the answers.
  await page.locator("#wizard-back").click();
  await expect(page.locator("#wizard-name")).toHaveValue(NAME);
  await expect(page.locator("#wizard-category input[value='clash']")).toBeChecked();

  expect(errors, "the page reported errors while skipping").toEqual([]);
});

test("the length pane cannot be skipped", async ({ app }) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page);
  await page.locator("#wizard-next").click(); // Skip the lore
  await expect(page.locator("#wizard-pane-length")).toBeVisible();

  const next = page.locator("#wizard-next");
  await expect(page.locator("#wizard-rounds button")).toHaveCount(13);
  await expect(page.locator("#wizard-players button")).toHaveCount(8);
  await expect(next).toBeDisabled();
  await expect(next).toHaveText("Next");

  // Player counts alone are not a length.
  await page.locator("#wizard-players button[data-value='2']").click();
  await expect(next).toBeDisabled();

  // From the keyboard: the Round buttons take focus and Enter presses one.
  await page.locator("#wizard-rounds button[data-value='10']").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#wizard-rounds button[data-value='10']")).toHaveAttribute("aria-pressed", "true");
  await expect(next).toBeEnabled();

  // Single choice: another Round replaces it.
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await expect(page.locator("#wizard-rounds [aria-pressed='true']")).toHaveCount(1);

  expect(errors, "the page reported errors on the length pane").toEqual([]);
});

test("creating after panes 1-3 opens the editor at #/drafts/<category>/<file> with the title, kind, author, lore, length and player count filled in", async ({
  app,
}) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page, { mode: "Alliance", author: "Tier Two" });
  await page.locator("#wizard-lore").fill('A "grim" tale.\n\nOf 50% luck & #1 heroes.');
  await page.locator("#wizard-next").click();
  await page.locator("#wizard-rounds button[data-value='9']").click();
  for (const n of ["2", "3", "4", "6"]) await page.locator(`#wizard-players button[data-value='${n}']`).click();
  await page.locator("#wizard-next").click();
  await runSetup(page);

  await expect(page).toHaveURL(new RegExp(`#/drafts/alliances/${SLUG}$`));
  await expect(page.locator("#scenario-title")).toHaveText(NAME);
  await expect(page.locator("#scenario-category")).toHaveValue("alliances");

  const expected = fillScenarioTemplate(await repoFile(page, WIZARD_TEMPLATE_PATH), {
    name: NAME,
    category: "alliances",
    author: "Tier Two",
    lore: 'A "grim" tale.\n\nOf 50% luck & #1 heroes.',
    rounds: 9,
    playerCounts: [2, 3, 4, 6],
    buildings: [],
    // Pane 4 is prefilled with actual values, so it is answered by default.
    income: { gold: 10, building_materials: 0, valuables: 0 },
    resources: { gold: 10, building_materials: 0, valuables: 0 },
  });
  await expect.poll(() => editorValue(page), { message: "the generated text never reached the editor" }).toBe(expected);
  const text = await editorValue(page);
  expect(text).toContain(String.raw`\addscenariosection{1}{Alliance Scenario}{Wizard Probe}`);
  expect(text).toContain(String.raw`\textbf{Author:} Tier Two`);
  expect(text).toContain("\\textit{A ``grim'' tale. Of 50\\% luck \\& \\#1 heroes.}");
  expect(text).toContain("\n9 Rounds\n");
  expect(text).toContain(String.raw`\textbf{Player Count:} 2--4 or 6`);

  // Saved to the local draft at once.
  const draft = await page.evaluate(
    (path) => localStorage.getItem(`wasm-scenario-builder:draft:${path}`),
    `draft-scenarios/alliances/${SLUG}.tex`,
  );
  expect(draft).toBe(expected);

  // Back on the welcome screen, the picker shows again, not the wizard.
  // The text exists nowhere but here, so leaving asks first.
  await page.locator("#back-to-welcome").click();
  await expect(page.locator("#confirm-title")).toHaveText("Leave with unsaved changes?");
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#welcome-picker")).toBeVisible();
  await expect(page.locator("#wizard")).toBeHidden();

  expect(errors, "the page reported errors while creating a scenario").toEqual([]);
});

test("the header image appears in the upload popover and the generated title image path matches it", async ({
  app,
}) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page, { header: fakeFile("Cover Art.png") });
  await page.locator("#wizard-next").click();
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await page.locator("#wizard-next").click();
  await runSetup(page);

  await expect
    .poll(() => editorValue(page))
    .toContain(String.raw`\addscenariosection{1}{Clash Scenario}{Wizard Probe}{\images/${SLUG}.png}`);

  await page.locator("#upload-open").click();
  await expect(page.locator("#upload-dialog")).toBeVisible();
  await expect(page.locator("#upload-header-card")).toBeVisible();
  // The popover names the staged file by its target name: the one the heading references.
  await expect(page.locator("#upload-header-name")).toHaveValue(`${SLUG}.png`);
  await expect(page.locator("#upload-header-preview")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("#upload-header-add")).toHaveText("Replace header image");

  expect(errors, "the page reported errors while staging the header image").toEqual([]);
});

test("a reload after creating reopens the generated text from the local draft", async ({ app }) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page, { mode: "Coop" });
  await page.locator("#wizard-lore").fill("Reload probe.");
  await page.locator("#wizard-next").click();
  await page.locator("#wizard-rounds button[data-value='8']").click();
  await page.locator("#wizard-next").click();
  await runSetup(page);

  await expect(page).toHaveURL(new RegExp(`#/drafts/coops/${SLUG}$`));
  await expect.poll(() => editorValue(page)).toContain(String.raw`\textit{Reload probe.}`);
  const generated = await editorValue(page);

  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect.poll(() => editorValue(page), { message: "the reload lost the generated text" }).toBe(generated);

  expect(errors, "the page reported errors while reopening the generated text").toEqual([]);
});

test("switching back to copy or blank keeps the wizard's answers", async ({ app }) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page, { author: "Someone" });
  await page.locator("#wizard-lore").fill("Kept lore.");

  await page.locator("#start-copy").click();
  await expect(page.locator("#confirm-dialog")).toBeHidden();
  await expect(page.locator("#wizard")).toBeHidden();

  // Back in the wizard: same pane, same answers.
  await openWizard(page);
  await expect(page.locator("#wizard-pane-lore")).toBeVisible();
  await expect(page.locator("#wizard-lore")).toHaveValue("Kept lore.");
  await page.locator("#wizard-back").click();
  await expect(page.locator("#wizard-name")).toHaveValue(NAME);
  await expect(page.locator("#wizard-author")).toHaveValue("Someone");

  expect(errors, "the page reported errors while switching away and back").toEqual([]);
});

test("income and resources write both lines with glyphs, and income offers no empty value", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page);
  const next = page.locator("#wizard-next");
  const income = page.locator("#wizard-income");

  // The selects hold the board's track and nothing else: income cannot be empty.
  const optionValues = (label) =>
    page
      .getByLabel(label)
      .evaluate((select) => [.../** @type {HTMLSelectElement} */ (select).options].map((o) => o.value));
  expect(await optionValues("Gold income")).toEqual(["10", "15", "20", "25", "30", "35", "40", "45"]);
  expect(await optionValues("Building Materials income")).toEqual(["0", "2", "4", "6", "8", "10", "12", "14"]);
  expect(await optionValues("Valuables income")).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
  await expect(income.locator("img.wizard-glyph")).toHaveCount(3);
  await expect(income.locator("img.wizard-glyph").first()).toHaveAttribute("src", /assets\/glyphs\/gold\.svg$/);
  await expect(page.locator("#wizard-resources img.wizard-glyph")).toHaveCount(3);
  // No light chip behind a glyph.
  expect(
    await income
      .locator("img.wizard-glyph")
      .first()
      .evaluate((img) => getComputedStyle(img).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");

  // Income starts at the bottom of each track, so the pane is answered.
  await expect(page.getByLabel("Gold income")).toHaveValue("10");
  await expect(page.getByLabel("Building Materials income")).toHaveValue("0");
  await expect(page.getByLabel("Valuables income")).toHaveValue("0");
  await expect(next).toHaveText("Next");
  await expect(next).toHaveClass(/\bprimary\b/);

  await page.getByLabel("Building Materials income").selectOption("4");

  // The resource fields step with − and +, not the browser's spinner. Gold is
  // prefilled with 10; clear it first to check the − clamp at 0.
  const gold = page.getByLabel("Starting Gold", { exact: true });
  expect(await gold.evaluate((input) => getComputedStyle(input).appearance)).toBe("textfield");
  await gold.fill("");
  await page.getByRole("button", { name: "Decrease Starting Gold" }).click();
  await expect(gold, "− went below 0").toHaveValue("0");
  await page.getByRole("button", { name: "Increase Starting Gold" }).click();
  await expect(gold).toHaveValue("1");
  // From the keyboard.
  await page.getByRole("button", { name: "Increase Starting Gold" }).focus();
  await page.keyboard.press("Enter");
  await expect(gold).toHaveValue("2");

  // A value off the 0-99 range cannot go on; + brings it back into range.
  await gold.fill("150");
  await expect(next).toBeDisabled();
  await expect(page.locator("#wizard-hint")).toHaveText("Use a whole number from 0 to 99.");
  await page.getByRole("button", { name: "Increase Starting Gold" }).click();
  await expect(gold).toHaveValue("99");
  await expect(next).toBeEnabled();
  await gold.fill("20");
  await page.getByLabel("Starting Building Materials", { exact: true }).fill("6");
  await page.getByLabel("Starting Valuables", { exact: true }).fill("1");
  await expect(next).toBeEnabled();

  // Answered above, so runSetup leaves it as it is.
  await runSetup(page, { resources: async () => {} });
  const text = await editorValue(page);
  expect(text).toContain(
    String.raw`\textbf{Starting Resources:} 20 \svg{gold}, 6 \svg{building_materials}, 1 \svg{valuables}`,
  );
  expect(text).toContain(
    String.raw`\textbf{Starting Income:} 10 \svg{gold}, 4 \svg{building_materials}, 0 \svg{valuables}`,
  );

  expect(errors, "the page reported errors on the resources pane").toEqual([]);
});

test("the starting resources fields are prefilled 10/0/0 and answered by default", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  await reachSetup(page);
  await expect(page.getByLabel("Starting Gold", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Starting Building Materials", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Starting Valuables", { exact: true })).toHaveValue("0");
  await expect(next).toHaveText("Next");
  await expect(next).toHaveClass(/\bprimary\b/);

  await runSetup(page, { resources: async () => {} });
  const text = await editorValue(page);
  expect(text).toContain(String.raw`\textbf{Starting Resources:} 10 \svg{gold}`);

  expect(errors, "the page reported errors on the prefilled resources pane").toEqual([]);
});

test("the starting units hint names the three Unit glyphs", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page);
  await page.locator("#wizard-next").click();
  const hint = page.locator("#wizard-pane-units .hint");
  await expect(hint).toContainText(String.raw`\svg{bronze}`);
  await expect(hint).toContainText(String.raw`\svg{silver}`);
  await expect(hint).toContainText(String.raw`\svg{golden}`);
  await expect(hint.locator("img.wizard-glyph")).toHaveCount(3);
  await expect(hint.locator("img.wizard-glyph").last()).toHaveAttribute("src", /assets\/glyphs\/golden\.svg$/);

  expect(errors, "the page reported errors on the starting units pane").toEqual([]);
});

test("the prefilled starting units pass \\svg{bronze} through", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page);
  await runSetup(page, {
    // Left as prefilled, the pane is answered.
    units: async () => {
      await expect(page.locator("#wizard-units")).toHaveValue(
        [
          String.raw`A "Pack" of the cheapest \svg{bronze} Units`,
          String.raw`A "Few" of the most expensive \svg{bronze} Units`,
        ].join("\n"),
      );
      await expect(page.locator("#wizard-next")).toHaveText("Next");
    },
  });
  const text = await editorValue(page);
  expect(text).toContain(
    [
      String.raw`\textbf{Starting Units:}`,
      String.raw`\begin{itemize}`,
      "  \\item A ``Pack'' of the cheapest \\svg{bronze} Units",
      "  \\item A ``Few'' of the most expensive \\svg{bronze} Units",
      String.raw`\end{itemize}`,
    ].join("\n"),
  );

  expect(errors, "the page reported errors on the starting units pane").toEqual([]);
});

test("no buildings ticked writes None; ticked buildings follow the fixed order with Dwelling glyphs", async ({
  app,
}) => {
  const { page, errors } = app;
  await reachSetup(page);
  await runSetup(page, {
    buildings: async () => {
      await expect(page.locator("#wizard-buildings input[type='checkbox']")).toHaveCount(8);
      await expect(page.locator("#wizard-buildings img.wizard-glyph:not(.dark)")).toHaveCount(8);
      // Two columns: the Dwellings and the Citadel, then the rest.
      const columns = page.locator("#wizard-buildings .wizard-check-column");
      await expect(columns).toHaveCount(2);
      await expect(columns.nth(0).locator("input")).toHaveCount(4);
      expect(
        await columns
          .nth(0)
          .locator("input")
          .evaluateAll((boxes) => boxes.map((box) => box.value)),
      ).toEqual(["bronze", "silver", "golden", "citadel"]);
      const [first, second] = await Promise.all([columns.nth(0).boundingBox(), columns.nth(1).boundingBox()]);
      expect(second?.x, "the columns do not stand side by side").toBeGreaterThan(first?.x ?? 0);
      // The dark theme draws the yellow variant where there is one, and the Unit stars as they are.
      const citadel = page.locator("#wizard-buildings label").filter({ hasText: "Citadel" });
      const bronze = page.locator("#wizard-buildings label").filter({ hasText: "Bronze Dwelling" });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      await expect(citadel.locator("img:visible")).toHaveAttribute("src", /building_citadel\.svg$/);
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await expect(citadel.locator("img:visible")).toHaveAttribute("src", /building_citadel-yellow\.svg$/);
      await expect(bronze.locator("img:visible")).toHaveAttribute("src", /bronze\.svg$/);
      expect(await bronze.locator("img").evaluate((img) => getComputedStyle(img).backgroundColor)).toBe(
        "rgba(0, 0, 0, 0)",
      );
      // Nothing ticked is an answer too: the button stays a green Next.
      await expect(page.locator("#wizard-next")).toHaveText("Next");
      await expect(page.locator("#wizard-next")).toHaveClass(/\bprimary\b/);
      await expect(page.locator("#wizard-next")).toBeEnabled();
    },
  });
  expect(await editorValue(page)).toContain(String.raw`\textbf{Town Buildings:} None`);

  await backToWelcome(page);
  await reachSetup(page, { name: "Wizard Probe Two" });
  await runSetup(page, {
    buildings: async () => {
      // Ticked out of order, from the keyboard for one of them.
      await page.getByLabel("Citadel").check();
      await page.getByLabel("Golden Dwelling").focus();
      await page.keyboard.press("Space");
      await page.getByLabel("Bronze Dwelling").check();
    },
  });
  expect(await editorValue(page)).toContain(
    String.raw`\textbf{Town Buildings:} \svg{bronze}~Dwelling, \svg{golden}~Dwelling, Citadel`,
  );

  expect(errors, "the page reported errors on the buildings pane").toEqual([]);
});

test("tile pool No removes the line; Yes with 2 Far writes the random Far sentence", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  await reachSetup(page);
  await runSetup(page, {
    pool: async () => {
      await expect(next).toHaveText("Skip");
      await expect(page.locator("#wizard-pool-counts")).toBeHidden();
      await page.locator("#wizard-pool").getByLabel("No").check();
      await expect(next).toHaveText("Next");
      await expect(page.locator("#wizard-pool-counts")).toBeHidden();
    },
  });
  const without = await editorValue(page);
  expect(without).not.toContain("Map Tile Pool");
  expect(without).not.toContain("Additional Bonus");
  expect(without).toContain("\\textbf{Town Buildings:} None\n\n\\subsection*{\\MakeUppercase{Map Setup}}");

  await backToWelcome(page);
  await reachSetup(page, { name: "Wizard Probe Two" });
  await runSetup(page, {
    pool: async () => {
      await page.locator("#wizard-pool").getByLabel("Yes").check();
      await expect(page.locator("#wizard-pool-counts")).toBeVisible();
      // Yes with no Map Tiles is no answer.
      await expect(next).toBeDisabled();
      await expect(page.locator("#wizard-hint")).toHaveText("Set how many Map Tiles each player takes, or choose No.");
      await page.locator("#wizard-pool-far").fill("7");
      await expect(next).toBeDisabled();
      await page.locator("#wizard-pool-far").fill("1");
      await page.getByRole("button", { name: "Increase Far (II–III) Map Tiles" }).click();
      await expect(page.locator("#wizard-pool-far")).toHaveValue("2");
      await expect(next).toBeEnabled();
      await expect(next).toHaveText("Next");
    },
  });
  expect(await editorValue(page)).toContain(
    "\\textbf{Map Tile Pool:} Each player takes 2 random Far (II--III) Map Tiles\n",
  );

  expect(errors, "the page reported errors on the tile pool pane").toEqual([]);
});

test("map setup writes one item per non-zero tile type", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  await reachSetup(page);
  await runSetup(page, {
    map: async () => {
      await expect(next).toHaveText("Skip");
      await page.getByLabel("Starting (I)", { exact: true }).fill("2");
      await expect(next).toHaveText("Next");
      await page.locator("#wizard-map-far").fill("4");
      await page.locator("#wizard-map-near").fill("0");
      await page.getByRole("button", { name: "Increase Center (VI–VII) Map Tiles" }).click();
      await expect(page.getByLabel("Center (VI–VII)", { exact: true })).toHaveValue("1");
    },
  });
  expect(await editorValue(page)).toContain(
    [
      "Take the following Map Tiles and arrange them as shown in the Scenario map layout:",
      String.raw`\begin{itemize}`,
      String.raw`  \item 2 × Starting (I) Map Tiles`,
      String.raw`  \item 4 × Far (II--III) Map Tiles`,
      String.raw`  \item 1 × Center (VI--VII) Map Tile`,
      String.raw`\end{itemize}`,
    ].join("\n"),
  );

  expect(errors, "the page reported errors on the map setup pane").toEqual([]);
});

test("map setup accepts a fixed count or a multiple of the players, and explains P", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  const hint = page.locator("#wizard-hint");
  await reachSetup(page);
  await runSetup(page, {
    map: async () => {
      await expect(page.locator("#wizard-pane-map .hint")).toContainText(
        "a fixed number, or a multiple of the number of players",
      );
      const starting = page.locator("#wizard-map-starting");
      const startingMode = page.locator('.wizard-count[data-tile="starting"] .wizard-tile-mode');
      const startingFixed = startingMode.getByRole("button", { name: "Fixed" });
      const startingPerPlayer = startingMode.getByRole("button", { name: "× Players" });

      await expect(startingFixed).toHaveAttribute("aria-pressed", "true");
      await expect(startingPerPlayer).toHaveAttribute("aria-pressed", "false");

      // Fixed mode: past 20 cannot go on.
      await starting.fill("21");
      await expect(next).toBeDisabled();
      await expect(hint).toHaveText("Use a whole number from 0 to 20, or from 1 to 6 in × Players mode.");
      await expect(starting).toHaveAttribute("aria-invalid", "true");
      await starting.fill("2");
      await expect(next).toBeEnabled();

      // Switching to × Players keeps the value if it still fits, from the keyboard.
      await startingPerPlayer.focus();
      await page.keyboard.press("Enter");
      await expect(startingPerPlayer).toHaveAttribute("aria-pressed", "true");
      await expect(startingFixed).toHaveAttribute("aria-pressed", "false");
      await expect(starting, "× Players shows the multiple as 2P").toHaveValue("2P");
      await expect(next).toBeEnabled();
      await expect(next).toHaveText("Next");
      // The stepper counts in multiples too: P, 2P, 3P.
      const startingStepper = page.locator('.wizard-count[data-tile="starting"] .wizard-stepper');
      await startingStepper.getByRole("button", { name: /^Increase/ }).click();
      await expect(starting).toHaveValue("3P");
      await startingStepper.getByRole("button", { name: /^Decrease/ }).click();
      await startingStepper.getByRole("button", { name: /^Decrease/ }).click();
      await expect(starting).toHaveValue("P");
      await startingStepper.getByRole("button", { name: /^Decrease/ }).click();
      await expect(starting, "− went below P").toHaveValue("P");
      // Back to Fixed, the plain number returns.
      await startingFixed.click();
      await expect(starting).toHaveValue("1");
      await startingPerPlayer.click();
      await expect(hint).toHaveText("");

      // Past MAX_PER_PLAYER (6) in × Players mode cannot go on either.
      await starting.fill("7P");
      await expect(next).toBeDisabled();
      await starting.fill("P");

      const nearPerPlayer = page
        .locator('.wizard-count[data-tile="near"] .wizard-tile-mode')
        .getByRole("button", { name: "× Players" });
      await nearPerPlayer.click();
      await page.locator("#wizard-map-near").fill("2P");
      await page.locator("#wizard-map-center").fill("1");
    },
  });
  expect(await editorValue(page)).toContain(
    [
      "Take the following Map Tiles and arrange them as shown in the Scenario map layout ($P$ stands for the number of players):",
      String.raw`\begin{itemize}`,
      String.raw`  \item $P$ × Starting (I) Map Tiles`,
      String.raw`  \item $2P$ × Near (IV--V) Map Tiles`,
      String.raw`  \item 1 × Center (VI--VII) Map Tile`,
      String.raw`\end{itemize}`,
    ].join("\n"),
  );

  expect(errors, "the page reported errors on the map setup pane").toEqual([]);
});

test("skipping panes 5 and 8 leaves their template text unchanged, skipping pane 7 drops its line; pane 4's defaults are written", async ({
  app,
}) => {
  const { page, errors } = app;
  await reachSetup(page);
  await runSetup(page);

  const template = await repoFile(page, WIZARD_TEMPLATE_PATH);
  const expected = fillScenarioTemplate(template, {
    name: NAME,
    category: "clash",
    rounds: 12,
    buildings: [],
    // Pane 4 is prefilled with actual values, so it is answered by default.
    income: { gold: 10, building_materials: 0, valuables: 0 },
    resources: { gold: 10, building_materials: 0, valuables: 0 },
  });
  await expect.poll(() => editorValue(page)).toBe(expected);
  const text = await editorValue(page);
  expect(text).toContain(String.raw`\textbf{Starting Resources:} 10 \svg{gold}`);
  expect(text).toContain(
    String.raw`\textbf{Starting Income:} 10 \svg{gold}, 0 \svg{building_materials}, 0 \svg{valuables}`,
  );
  for (const placeholder of [
    String.raw`  \item A Few \svg{bronze}...`,
    String.raw`  \item W × Starting (I) Map Tile`,
    String.raw`  \item Z × Center (VI--VII) Map Tile`,
  ]) {
    expect(text, `a skipped pane changed ${placeholder}`).toContain(placeholder);
  }
  expect(text, "a skipped Map Tile Pool pane still mentions the pool").not.toContain("Map Tile Pool");

  expect(errors, "the page reported errors while skipping the setup panes").toEqual([]);
});

test("victory and defeat bodies replace the placeholders; an empty one keeps ...", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  await reachSetup(page);
  await runSetup(page, {
    conditions: async () => {
      await expect(page.locator("#wizard-victory")).toHaveAttribute("placeholder", "Take control of the enemy Town.");
      await expect(page.locator("#wizard-defeat")).toHaveAttribute(
        "placeholder",
        "At end of Round 12 the game ends in a draw.",
      );
      await expect(next).toHaveText("Skip");
      await page.locator("#wizard-victory").fill('Hold the "Obelisk" for 2 Rounds.\n\nOr take 100% of the Towns.');
      await expect(next).toHaveText("Next");
      await expect(next).toHaveClass(/\bprimary\b/);
    },
  });
  const text = await editorValue(page);
  expect(text).toContain(
    "\\subsection*{\\MakeUppercase{Victory Conditions}}\nHold the ``Obelisk'' for 2 Rounds.\n\nOr take 100\\% of the Towns.\n",
  );
  expect(text, "an empty defeat field changed its placeholder").toContain(
    "\\subsection*{\\MakeUppercase{Defeat Conditions}}\n...\n",
  );

  expect(errors, "the page reported errors on the victory and defeat pane").toEqual([]);
});

test("timed events list Rounds 2 to the chosen length, and only picked Rounds are written, in order", async ({
  app,
}) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  await openWizard(page);
  await answerBasics(page);
  await page.locator("#wizard-next").click(); // Skip the lore
  await page.locator("#wizard-rounds button[data-value='6']").click();
  await page.locator("#wizard-next").click();
  await runSetup(page, {
    events: async () => {
      const roundButtons = page.locator("#wizard-event-rounds button");
      await expect(roundButtons).toHaveCount(5);
      expect(await roundButtons.evaluateAll((buttons) => buttons.map((b) => b.textContent))).toEqual([
        "Round 2",
        "Round 3",
        "Round 4",
        "Round 5",
        "Round 6",
      ]);
      // Nothing is picked yet, so no field shows.
      await expect(page.locator("#wizard-events .wizard-event")).toHaveCount(0);
      await expect(next).toHaveText("Skip");

      // Picking a Round shows its field; a picked but empty field is no answer.
      const round = (n) =>
        page.locator("#wizard-event-rounds").getByRole("button", { name: `Round ${n}`, exact: true });
      const events = (n) => page.getByLabel(`Round ${n} events, one per line`);
      await round(5).click();
      await expect(events(5)).toBeVisible();
      await expect(next).toHaveText("Skip");
      await events(5).fill("Each player gains 1 \\svg{gold} & 2 \\svg{building_materials}\n\nThe Obelisk opens");
      await expect(next).toHaveText("Next");
      // From the keyboard, and the field lands before Round 5's, in order.
      await round(3).focus();
      await page.keyboard.press("Enter");
      await expect(round(3)).toHaveAttribute("aria-pressed", "true");
      await events(3).fill("Neutral Units move");
      expect(
        await page.locator("#wizard-events .wizard-event").evaluateAll((rows) => rows.map((r) => r.dataset.round)),
      ).toEqual(["3", "5"]);
      // Picked, typed into, then deselected: the field and its text are gone.
      await round(4).click();
      await events(4).fill("Never written");
      await round(4).click();
      await expect(events(4)).toHaveCount(0);
    },
  });
  const text = await editorValue(page);
  expect(text).toContain(
    [
      String.raw`\subsection*{\MakeUppercase{Timed Events}}`,
      "",
      String.raw`\textbf{\nth{3} Round:}`,
      String.raw`\begin{itemize}`,
      String.raw`  \item Neutral Units move`,
      String.raw`\end{itemize}`,
      "",
      String.raw`\textbf{\nth{5} Round:}`,
      String.raw`\begin{itemize}`,
      String.raw`  \item Each player gains 1 \svg{gold} \& 2 \svg{building_materials}`,
      String.raw`  \item The Obelisk opens`,
      String.raw`\end{itemize}`,
    ].join("\n"),
  );
  expect(text).not.toContain("Never written");
  expect(text).not.toContain(String.raw`\nth{2} Round`);

  expect(errors, "the page reported errors on the timed events pane").toEqual([]);
});

test("lowering the length drops Timed Events rounds above it, together with their text", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page); // 12 Rounds
  await moveTo(page, "events");
  const round = (n) => page.locator("#wizard-event-rounds").getByRole("button", { name: `Round ${n}`, exact: true });
  const fields = page.locator("#wizard-events .wizard-event");
  await expect(page.locator("#wizard-event-rounds button")).toHaveCount(11);
  await round(3).click();
  await page.getByLabel("Round 3 events, one per line").fill("Kept");
  await round(10).click();
  await page.getByLabel("Round 10 events, one per line").fill("Dropped");
  await expect(fields).toHaveCount(2);

  await moveTo(page, "length", "back");
  await page.locator("#wizard-rounds button[data-value='8']").click();
  await moveTo(page, "events");
  await expect(page.locator("#wizard-event-rounds button")).toHaveCount(7);
  // Round 10 is gone entirely, with its text; Round 3 keeps its answer.
  await expect(round(10)).toHaveCount(0);
  await expect(fields).toHaveCount(1);
  await expect(page.getByLabel("Round 3 events, one per line")).toHaveValue("Kept");

  // Raised again, Round 10 comes back available but unpicked and empty.
  await moveTo(page, "length", "back");
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await moveTo(page, "events");
  await expect(page.locator("#wizard-event-rounds button")).toHaveCount(11);
  await expect(round(10)).toHaveAttribute("aria-pressed", "false");
  await expect(fields).toHaveCount(1);
  await expect(page.getByLabel("Round 3 events, one per line")).toHaveValue("Kept");

  await moveTo(page, "maps");
  await page.locator("#wizard-next").click();
  await expect(page.locator("#workspace")).toBeVisible();
  const text = await editorValue(page);
  expect(text).toContain("\\textbf{\\nth{3} Round:}\n\\begin{itemize}\n  \\item Kept\n\\end{itemize}");
  expect(text).not.toContain("Dropped");

  expect(errors, "the page reported errors while changing the length").toEqual([]);
});

test("an inspiration chip clicked lands in the last-focused Round, and needs a Round picked first", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page); // 12 Rounds
  await moveTo(page, "events");
  const chip = page.locator("#wizard-chips .wizard-chip").first();
  const hint = page.locator("#wizard-chips-hint");
  const round = (n) => page.locator("#wizard-event-rounds").getByRole("button", { name: `Round ${n}`, exact: true });

  await expect(page.locator("#wizard-chips .wizard-chip")).toHaveCount(3);
  await chip.click();
  await expect(hint).toHaveText("Pick a Round first.");

  await round(3).click();
  await round(5).click();
  await page.getByLabel("Round 5 events, one per line").fill("Existing line");
  await page.getByLabel("Round 5 events, one per line").focus();
  await chip.click();
  await expect(page.getByLabel("Round 5 events, one per line")).toHaveValue(
    "Existing line\nRemove all Black Cubes from the map.",
  );
  await expect(page.getByLabel("Round 3 events, one per line")).toHaveValue("");

  // Focusing a different Round's field changes the click's target.
  await page.getByLabel("Round 3 events, one per line").focus();
  const chip2 = page.locator("#wizard-chips .wizard-chip").nth(1);
  await chip2.click();
  await expect(page.getByLabel("Round 3 events, one per line")).toHaveValue(
    String.raw`All Heroes gain +1 \svg{movement}.`,
  );
  await expect(page.getByLabel("Round 5 events, one per line")).toHaveValue(
    "Existing line\nRemove all Black Cubes from the map.",
  );

  expect(errors, "the page reported errors clicking a chip").toEqual([]);
});

test("dragging a chip onto two Rounds' fields lands it in both, without consuming it", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page); // 12 Rounds
  await moveTo(page, "events");
  const round = (n) => page.locator("#wizard-event-rounds").getByRole("button", { name: `Round ${n}`, exact: true });
  await round(2).click();
  await round(4).click();

  /**
   * Simulates a native HTML5 drag-and-drop of a chip onto a textarea:
   * Playwright's mouse-based drag does not fire the DragEvents the chips
   * rely on, so the events are dispatched directly with a real DataTransfer.
   *
   * @param {import("@playwright/test").Page} p
   * @param {number} chipIndex
   * @param {string} targetSelector
   * @returns {Promise<void>}
   */
  async function dragChip(p, chipIndex, targetSelector) {
    await p.evaluate(
      ({ chipIndex, targetSelector }) => {
        const chip = document.querySelectorAll(".wizard-chip")[chipIndex];
        const target = document.querySelector(targetSelector);
        const dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
        target.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
        target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      },
      { chipIndex, targetSelector },
    );
  }

  await dragChip(page, 2, "#wizard-event-2");
  await dragChip(page, 2, "#wizard-event-4");
  await expect(page.locator("#wizard-event-2")).toHaveValue(String.raw`Each player may Search (2) \svg{artifact}.`);
  await expect(page.locator("#wizard-event-4")).toHaveValue(String.raw`Each player may Search (2) \svg{artifact}.`);
  // The chip itself is still there, ready to be dragged again.
  await expect(page.locator("#wizard-chips .wizard-chip").nth(2)).toBeVisible();

  expect(errors, "the page reported errors dragging a chip").toEqual([]);
});

test("additional rules start at three fields, grow to eight, then show the limit note", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  const add = page.locator("#wizard-rules-add");
  await reachSetup(page);
  await runSetup(page, {
    rules: async () => {
      const fields = page.locator("#wizard-rules textarea");
      await expect(fields).toHaveCount(3);
      await expect(page.getByLabel("Rule 1", { exact: true })).toBeVisible();
      await expect(page.locator("#wizard-pane-rules .hint").first()).toHaveText(/One rule per field\./);
      await expect(page.locator("#wizard-rules-limit")).toBeHidden();
      await expect(next).toHaveText("Skip");

      for (let n = 4; n <= 8; n++) {
        await add.click();
        await expect(fields).toHaveCount(n);
        await expect(page.getByLabel(`Rule ${n}`, { exact: true })).toBeFocused();
      }
      await expect(add).toBeHidden();
      await expect(page.locator("#wizard-rules-limit")).toBeVisible();
      await expect(page.locator("#wizard-rules-limit")).toHaveText(
        "That's the limit here. You can add more rules in the editor.",
      );

      await page.getByLabel("Rule 2", { exact: true }).fill("Heroes cannot enter the \\svg{gold} Mine & its Field");
      await page.getByLabel("Rule 8", { exact: true }).fill("The last rule");
      await expect(next).toHaveText("Next");
    },
  });
  expect(await editorValue(page)).toContain(
    [
      String.raw`\subsection*{\MakeUppercase{Additional Rules}}`,
      "",
      String.raw`\begin{itemize}`,
      String.raw`    \item Heroes cannot enter the \svg{gold} Mine \& its Field`,
      String.raw`    \item The last rule`,
      String.raw`\end{itemize}`,
    ].join("\n"),
  );

  expect(errors, "the page reported errors on the additional rules pane").toEqual([]);
});

test("rule chips fill the next empty rule field on click, or the field they are dropped on", async ({ app }) => {
  const { page, errors } = app;
  const chips = page.locator("#wizard-rule-chips .wizard-chip");
  const hint = page.locator("#wizard-rule-chips-hint");
  await reachSetup(page);
  await runSetup(page, {
    rules: async () => {
      await expect(chips).toHaveCount(3);
      await expect(chips.first()).toHaveText("Level VII Neutral Combats cannot be skipped.");
      await expect(hint).toHaveText("Drag a chip onto a rule field, or click one to fill the next empty field.");

      await page.getByLabel("Rule 1", { exact: true }).fill("My own rule");
      await chips.nth(0).click();
      await expect(page.getByLabel("Rule 2", { exact: true })).toHaveValue(
        "Level VII Neutral Combats cannot be skipped.",
      );
      await chips.nth(1).click();
      await chips.nth(2).click();
      // Three fields were full, so a fourth one opens for the chip.
      await expect(page.locator("#wizard-rules textarea")).toHaveCount(4);
      await expect(page.getByLabel("Rule 4", { exact: true })).toHaveValue(
        String.raw`\textbf{Obelisk:} Roll 1 \svg{resource} or \svg{treasure}.`,
      );

      // Dropped on a field, a chip joins it.
      await page.evaluate(() => {
        const chip = document.querySelectorAll("#wizard-rule-chips .wizard-chip")[1];
        const target = /** @type {HTMLElement} */ (document.querySelector("#wizard-rule-1"));
        const dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
        target.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
        target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      });
      await expect(page.getByLabel("Rule 1", { exact: true })).toHaveValue(
        "My own rule You cannot recruit a Secondary Hero.",
      );

      // With all eight fields full, a click has nowhere to go.
      for (let n = 5; n <= 8; n++) await chips.nth(0).click();
      await expect(page.locator("#wizard-rules textarea")).toHaveCount(8);
      await chips.nth(1).click();
      await expect(hint).toHaveText("Every field holds a rule. Clear one, or add the rest in the editor.");
      await expect(page.locator("#wizard-next")).toHaveText("Next");
    },
  });
  expect(await editorValue(page)).toContain(
    String.raw`    \item \textbf{Obelisk:} Roll 1 \svg{resource} or \svg{treasure}.`,
  );

  expect(errors, "the page reported errors using the rule chips").toEqual([]);
});

test("the map editor link reads as a themed link, not the browser default", async ({ app }) => {
  const { page } = app;
  await openWizard(page);
  const color = await page.locator("#wizard-pane-maps .hint a").evaluate((a) => getComputedStyle(a).color);
  expect(color, "the link keeps the browser's default blue").not.toBe("rgb(0, 0, 238)");
});

test("uploaded maps appear in the wizard, the popover, and as captioned \\includegraphics blocks", async ({ app }) => {
  const { page, errors } = app;
  const next = page.locator("#wizard-next");
  const rows = page.locator("#wizard-maps-names .upload-map");
  await reachSetup(page);
  await runSetup(page, {
    maps: async () => {
      await expect(next).toHaveText("Skip and create");
      await page
        .locator("#wizard-maps")
        .setInputFiles([fakeFile("Layout_2p.png"), fakeFile("layout-3-4p.png"), fakeFile("spare_6p.png")]);
      await expect(rows).toHaveCount(3);
      // The wizard's maps field gives the popover's own experience: preview,
      // the staged filename (renamable) and the player-count ticks.
      await expect(rows.first().locator("img.upload-preview")).toHaveAttribute("src", /^blob:/);
      await expect(rows.nth(0).locator(".upload-rename")).toHaveValue(`${SLUG}_2p.png`);
      await expect(rows.nth(1).locator(".upload-rename")).toHaveValue(`${SLUG}_3-4p.png`);
      await expect(rows.nth(0).locator(".upload-player:checked")).toHaveCount(1);
      await expect(rows.nth(1).locator(".upload-player:checked")).toHaveCount(2);
      await expect(next).toHaveText("Create scenario");
      await expect(next).toHaveClass(/\bprimary\b/);

      await page.getByRole("button", { name: "Remove layout 3" }).click();
      await expect(rows).toHaveCount(2);
    },
  });

  const expected = fillScenarioTemplate(await repoFile(page, WIZARD_TEMPLATE_PATH), {
    name: NAME,
    category: "clash",
    rounds: 12,
    buildings: [],
    // Pane 4 is prefilled with actual values, so it is answered by default.
    income: { gold: 10, building_materials: 0, valuables: 0 },
    resources: { gold: 10, building_materials: 0, valuables: 0 },
    maps: [
      { path: `assets/maps/${SLUG}_2p.png`, counts: [2] },
      { path: `assets/maps/${SLUG}_3-4p.png`, counts: [3, 4] },
    ],
  });
  await expect.poll(() => editorValue(page)).toBe(expected);
  const text = await editorValue(page);
  expect(
    text.endsWith(
      [
        String.raw`\end{multicols*}`,
        "",
        String.raw`\vspace{3em}`,
        String.raw`\begin{center}`,
        String.raw`  \includegraphics[width=0.6\paperwidth]{\maps/${SLUG}_2p.png}`,
        String.raw`  \captionof{figure}{\textbf{2-PLAYER SCENARIO}}`,
        String.raw`\end{center}`,
        "",
        String.raw`\vspace{3em}`,
        String.raw`\begin{center}`,
        String.raw`  \includegraphics[width=0.6\paperwidth]{\maps/${SLUG}_3-4p.png}`,
        String.raw`  \captionof{figure}{\textbf{3/4-PLAYER SCENARIO}}`,
        String.raw`\end{center}`,
        "",
      ].join("\n"),
    ),
    "the map blocks are not at the end of the file",
  ).toBe(true);

  // The popover stages each map under the name the file references.
  await page.locator("#upload-open").click();
  const popoverRows = page.locator("#upload-maps-names .upload-map");
  await expect(popoverRows).toHaveCount(2);
  await expect(popoverRows.nth(0).locator(".upload-rename")).toHaveValue(`${SLUG}_2p.png`);
  await expect(popoverRows.nth(1).locator(".upload-rename")).toHaveValue(`${SLUG}_3-4p.png`);
  await expect(popoverRows.nth(1).locator(".upload-player:checked")).toHaveCount(2);
  await expect(page.locator("#upload-maps-status")).not.toHaveClass(/bad/);

  expect(errors, "the page reported errors while staging the maps").toEqual([]);
});

test("a seventh map is refused", async ({ app }) => {
  const { page, errors } = app;
  const rows = page.locator("#wizard-maps-names .upload-map");
  const status = page.locator("#wizard-maps-status");
  await reachSetup(page);
  await moveTo(page, "maps");
  await page.locator("#wizard-maps").setInputFiles([1, 2, 3, 4].map((n) => fakeFile(`map_${n}p.png`)));
  await expect(rows).toHaveCount(4);
  await page.locator("#wizard-maps").setInputFiles([fakeFile("map_5p.png"), fakeFile("map_6p.png")]);
  await expect(rows).toHaveCount(6);
  await expect(status).not.toHaveClass(/bad/);

  await page.locator("#wizard-maps").setInputFiles(fakeFile("map.png"));
  await expect(status).toHaveClass(/bad/);
  await expect(status).toHaveText("That makes 7 layouts, more than the 6-player limit. None were added.");
  await expect(rows).toHaveCount(6);

  // A file that is not PNG is refused too.
  await page.getByRole("button", { name: "Remove layout 6" }).click();
  await page.locator("#wizard-maps").setInputFiles(fakeFile("map.jpg", "image/jpeg"));
  await expect(status).toHaveClass(/bad/);
  await expect(rows).toHaveCount(5);

  expect(errors, "the page reported errors while refusing maps").toEqual([]);
});

test("a full run through all twelve panes produces a file with no answered placeholder left", async ({ app }) => {
  const { page, errors } = app;
  await openWizard(page);
  await answerBasics(page, { author: "Full Run", header: fakeFile("cover.png") });
  await page.locator("#wizard-lore").fill("A long night falls.");
  await page.locator("#wizard-next").click();
  await page.locator("#wizard-rounds button[data-value='5']").click();
  await page.locator("#wizard-players button[data-value='2']").click();
  await page.locator("#wizard-next").click();
  await runSetup(page, {
    resources: async () => {
      await page.getByLabel("Starting Gold", { exact: true }).fill("20");
    },
    units: async () => {},
    buildings: async () => {
      await page.getByLabel("Citadel").check();
    },
    pool: async () => {
      await page.locator("#wizard-pool").getByLabel("Yes").check();
      await page.locator("#wizard-pool-near").fill("1");
    },
    map: async () => {
      await page
        .locator('.wizard-count[data-tile="starting"] .wizard-tile-mode')
        .getByRole("button", { name: "× Players" })
        .click();
      await page.locator("#wizard-map-center").fill("1");
    },
    conditions: async () => {
      await page.locator("#wizard-victory").fill("Take the enemy Town.");
      await page.locator("#wizard-defeat").fill("Lose your Town.");
    },
    events: async () => {
      await page.locator("#wizard-event-rounds").getByRole("button", { name: "Round 4", exact: true }).click();
      await page.getByLabel("Round 4 events, one per line").fill("Reinforcements arrive");
    },
    rules: async () => {
      await page.getByLabel("Rule 1", { exact: true }).fill("No Spells");
    },
    maps: async () => {
      await page.locator("#wizard-maps").setInputFiles([fakeFile("a_2p.png")]);
      await expect(page.locator("#wizard-next")).toHaveText("Create scenario");
    },
  });

  const expected = fillScenarioTemplate(await repoFile(page, WIZARD_TEMPLATE_PATH), {
    name: NAME,
    category: "clash",
    author: "Full Run",
    headerImage: `assets/images/${SLUG}.png`,
    lore: "A long night falls.",
    rounds: 5,
    playerCounts: [2],
    income: { gold: 10, building_materials: 0, valuables: 0 },
    resources: { gold: 20, building_materials: 0, valuables: 0 },
    startingUnits: [
      String.raw`A "Pack" of the cheapest \svg{bronze} Units`,
      String.raw`A "Few" of the most expensive \svg{bronze} Units`,
    ].join("\n"),
    buildings: ["citadel"],
    tilePool: { far: 0, near: 1 },
    mapSetup: { starting: { perPlayer: 1 }, far: 0, near: 0, center: 1 },
    victory: "Take the enemy Town.",
    defeat: "Lose your Town.",
    timedEvents: [{ round: 4, text: "Reinforcements arrive" }],
    rules: ["No Spells"],
    maps: [{ path: `assets/maps/${SLUG}_2p.png`, counts: [2] }],
  });
  await expect.poll(() => editorValue(page)).toBe(expected);
  const text = await editorValue(page);
  expect(text, "an answered placeholder is left").not.toContain("...");
  for (const placeholder of [
    "X \\svg{gold}",
    "A \\svg{gold}",
    "Near/Far",
    "W ×",
    "your_map.png",
    "\\images/title.png",
  ]) {
    expect(text, `${placeholder} is left`).not.toContain(placeholder);
  }
  const draft = await page.evaluate(
    (path) => localStorage.getItem(`wasm-scenario-builder:draft:${path}`),
    `draft-scenarios/clash/${SLUG}.tex`,
  );
  expect(draft).toBe(expected);

  await page.locator("#upload-open").click();
  await expect(page.locator("#upload-header-name")).toHaveValue(`${SLUG}.png`);
  await expect(page.locator("#upload-maps-names .upload-map")).toHaveCount(1);

  expect(errors, "the page reported errors in the full run").toEqual([]);
});

/**
 * Simulates dropping files onto a drop zone, the way a browser would fire
 * dragenter/dragover/drop with a real DataTransfer carrying Files —
 * Playwright's mouse-based drag does not produce these on its own.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} zoneSelector
 * @param {{name: string, mimeType?: string}[]} files
 * @returns {Promise<void>}
 */
async function dropFiles(page, zoneSelector, files) {
  await page.evaluate(
    ({ zoneSelector, files }) => {
      const zone = document.querySelector(zoneSelector);
      const dt = new DataTransfer();
      for (const f of files)
        dt.items.add(new File(["not really an image"], f.name, { type: f.mimeType ?? "image/png" }));
      const opts = { dataTransfer: dt, bubbles: true, cancelable: true };
      zone.dispatchEvent(new DragEvent("dragenter", opts));
      zone.dispatchEvent(new DragEvent("dragover", opts));
      zone.dispatchEvent(new DragEvent("drop", opts));
    },
    { zoneSelector, files },
  );
}

test("a file dropped on the wizard's header field and maps field stages it, the same as picking it", async ({
  app,
}) => {
  const { page, errors } = app;
  await openWizard(page);
  // Filled without clicking Next, so pane 1 (and its header field) stays visible.
  await page.locator("#wizard-name").fill(NAME);
  await page.locator("#wizard-category").getByLabel("Clash").check();
  await dropFiles(page, "#wizard-header-field", [{ name: "Dropped Header.png" }]);
  await expect(page.locator("#wizard-header-card")).toBeVisible();
  await expect(page.locator("#wizard-header-preview")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("#wizard-header-name")).toHaveValue(`${SLUG}.png`);

  await page.locator("#wizard-next").click();
  await page.locator("#wizard-next").click(); // Skip the lore
  await page.locator("#wizard-rounds button[data-value='12']").click();
  await page.locator("#wizard-next").click();
  await moveTo(page, "maps");
  await dropFiles(page, "#wizard-maps-field", [{ name: "dropped_2p.png" }]);
  const rows = page.locator("#wizard-maps-names .upload-map");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".upload-rename")).toHaveValue(`${SLUG}_2p.png`);
  await expect(rows.first().locator(".upload-player:checked")).toHaveCount(1);

  expect(errors, "the page reported errors dropping files on the wizard").toEqual([]);
});

test("a file dropped on the upload popover's own header and map fields stages it", async ({ app }) => {
  const { page, errors } = app;
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill("Drop Probe");
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await page.locator("#upload-open").click();
  await expect(page.locator("#upload-dialog")).toBeVisible();

  await dropFiles(page, "#upload-header-field", [{ name: "Cover.png" }]);
  await expect(page.locator("#upload-header-card")).toBeVisible();
  await expect(page.locator("#upload-header-preview")).toHaveAttribute("src", /^blob:/);

  await dropFiles(page, "#upload-maps-field", [{ name: "layout_3p.png" }]);
  const rows = page.locator("#upload-maps-names .upload-map");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".upload-player:checked")).toHaveCount(1);

  expect(errors, "the page reported errors dropping files on the popover").toEqual([]);
});

test("map captions: a layout for every player count gets the Scenario layout caption, others the N-PLAYER caption", async ({
  app,
}) => {
  const { page, errors } = app;
  await reachSetup(page);
  await runSetup(page, {
    maps: async () => {
      await page.locator("#wizard-maps").setInputFiles([fakeFile("whole_map.png"), fakeFile("split_2-3p.png")]);
    },
  });
  const text = await editorValue(page);
  expect(text).toContain(
    [
      String.raw`  \includegraphics[width=0.6\paperwidth]{\maps/${SLUG}.png}`,
      String.raw`  \captionof{figure}{\textbf{SCENARIO MAP LAYOUT}}`,
    ].join("\n"),
  );
  expect(text).toContain(
    [
      String.raw`  \includegraphics[width=0.6\paperwidth]{\maps/${SLUG}_2-3p.png}`,
      String.raw`  \captionof{figure}{\textbf{2/3-PLAYER SCENARIO}}`,
    ].join("\n"),
  );

  expect(errors, "the page reported errors on map captions").toEqual([]);
});

test("the map editor link opens in a new tab from the wizard's hint and the popover's hint", async ({ app }) => {
  const { page, errors } = app;
  await reachSetup(page);
  await moveTo(page, "maps");
  const wizardLink = page.locator("#wizard-pane-maps .hint a");
  await expect(wizardLink).toHaveAttribute("href", MAP_EDITOR);
  await expect(wizardLink).toHaveAttribute("target", "_blank");
  await expect(wizardLink).toHaveAttribute("rel", "noopener");

  await page.locator("#wizard-next").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await page.locator("#upload-open").click();
  const popoverLink = page.locator("#upload-maps-status a");
  await expect(popoverLink).toHaveAttribute("href", MAP_EDITOR);
  await expect(popoverLink).toHaveAttribute("target", "_blank");
  await expect(popoverLink).toHaveAttribute("rel", "noopener");
  // Drawn in the accent, like the wizard's link, not the browser's default link blue.
  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(popoverLink).toHaveCSS("color", accent);

  expect(errors, "the page reported errors checking the map editor link").toEqual([]);
});

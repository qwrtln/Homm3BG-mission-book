// Tier 1 check of the welcome screen's name rule.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DRAFT_GROUP_FILES } from "../../shared/build-plan.ts";
import {
  categoryOfPath,
  DRAFT_CATEGORIES,
  MAX_SCENARIO_NAME_LENGTH,
  MIN_SCENARIO_NAME_LENGTH,
  newScenarioDir,
  SCENARIO_KINDS,
  scenarioTitle,
  validateScenarioName,
  withCategory,
  withScenarioKind,
} from "../../shared/scenario-name.ts";
import { readRepoFile, repoRoot } from "../helpers/repo.ts";

test("a title of letters, digits, spaces, hyphens and apostrophes is valid", () => {
  for (const name of ["The Queen's Gambit", "Bloody Grail 2", "Half-Way House", "Zażółć gęślą jaźń"]) {
    assert.deepEqual(validateScenarioName(name), { valid: true, message: "" }, name);
  }
});

test("surrounding spaces do not count towards the length", () => {
  assert.equal(validateScenarioName("  ab  ").valid, false);
  assert.equal(validateScenarioName(`  ${"a".repeat(MIN_SCENARIO_NAME_LENGTH)}  `).valid, true);
});

test("an empty name asks for one rather than complaining about its length", () => {
  const check = validateScenarioName("   ");
  assert.equal(check.valid, false);
  assert.match(check.message, /Name your scenario/);
});

test("a name past the field's own maxlength is rejected", () => {
  assert.equal(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH)).valid, true);
  assert.equal(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH + 1)).valid, false);
});

test("punctuation a file name or a branch would swallow is rejected", () => {
  // sanitizeFilename() and slugify() would fold all of these away, leaving a
  // name the contributor never typed.
  for (const name of ["bad/name", "name?", "name.tex", "name_two", "a@b", "#hash", "<tag>"]) {
    const check = validateScenarioName(name);
    assert.equal(check.valid, false, name);
    assert.match(check.message, /letters, digits, spaces/);
  }
});

test('the name "Updates" is reserved, whatever its case, because its branch would block every in-place edit branch', () => {
  for (const name of ["Updates", "updates", "  UPDATES "]) {
    assert.equal(validateScenarioName(name).valid, false, name);
  }
  assert.equal(validateScenarioName("Updates to the Valley").valid, true);
});

test("the draft categories are exactly the draft book's group directories", () => {
  const dirs = DRAFT_GROUP_FILES.map((group) => group.dir.replace(/^draft-scenarios\//, ""));
  assert.deepEqual(new Set(DRAFT_CATEGORIES), new Set(dirs));
  assert.equal(DRAFT_CATEGORIES.length, dirs.length);
});

test("the welcome screen offers the draft categories, in order, under their labels", () => {
  // The category radios are a RadioGroup (components/welcome/PickerMain.tsx), fed
  // by mapping DRAFT_CATEGORIES and reading CATEGORY_LABELS, rather than typed out
  // by hand — so there is no literal markup left to regex for each category and
  // label. This checks that the mapping itself is still there, order and all.
  const tsx = readRepoFile("web/app/components/welcome/PickerMain.tsx");
  assert.match(
    tsx,
    /DRAFT_CATEGORIES\.map\(\(category\) => /,
    "the category radios are not driven by DRAFT_CATEGORIES, in order",
  );
  assert.match(tsx, /value: category\b/, "a radio's value is not the mapped category");
  assert.match(tsx, /CATEGORY_LABELS\[category\]/, "a radio's label is not read from CATEGORY_LABELS");
});

test("a published or draft scenario's path names its category", () => {
  assert.equal(categoryOfPath("clash/x.tex"), "clash");
  assert.equal(categoryOfPath("coops/wandering_pretzels.tex"), "coops");
  assert.equal(categoryOfPath("campaigns/inferno_devilish_plan.tex"), "campaigns");
  for (const category of DRAFT_CATEGORIES) {
    assert.equal(categoryOfPath(`draft-scenarios/${category}/x.tex`), category);
  }
});

test("a path outside every category has none", () => {
  for (const path of ["templates/scenario.tex", "sections/credits.tex", "draft-scenarios/x.tex", "structure.tex"]) {
    assert.equal(categoryOfPath(path), null, path);
  }
});

test("a new scenario always lands under draft-scenarios, in the category chosen", () => {
  for (const category of DRAFT_CATEGORIES) {
    assert.equal(newScenarioDir(category), `draft-scenarios/${category}`);
  }
  assert.throws(() => newScenarioDir("templates"), /Unknown scenario category/);
});

test("a draft moves between categories and back, keeping its file name", () => {
  const path = "draft-scenarios/clash/my_scenario.tex";
  const moved = withCategory(path, "campaigns");
  assert.equal(moved, "draft-scenarios/campaigns/my_scenario.tex");
  assert.equal(withCategory(moved, "clash"), path);
  assert.throws(() => withCategory("clash/my_scenario.tex", "coops"), /not a draft scenario path/);
  assert.throws(() => withCategory(path, "templates"), /Unknown scenario category/);
});

test("a heading's standard kind follows the category it is filed under", () => {
  const coop = "\\addscenariosection{1}{Cooperative Scenario}{Emerald Island}{\\images/logistics.png}\n";
  assert.equal(
    withScenarioKind(coop, "clash"),
    "\\addscenariosection{1}{Clash Scenario}{Emerald Island}{\\images/logistics.png}\n",
  );
  assert.equal(withScenarioKind(coop, "alliances"), coop.replace("Cooperative Scenario", "Alliance Scenario"));
  assert.equal(withScenarioKind(coop, "coops"), coop);
  for (const category of Object.keys(SCENARIO_KINDS)) {
    assert.ok(DRAFT_CATEGORIES.includes(category), category);
  }
});

test("a hand-written kind, a campaign heading and a move into campaigns keep the heading as it is", () => {
  const custom = "\\addscenariosection{1}{Clash/Alliance Scenario}{Gold Rush}{\\images/gold-mine.png}";
  assert.equal(withScenarioKind(custom, "coops"), custom);
  const campaign = "\\addscenariosection[subsection]{1}{Castle Campaign $-$ The Queen's Gambit}{1. Greek Gift}{x}";
  assert.equal(withScenarioKind(campaign, "clash"), campaign);
  const clash = "\\addscenariosection{1}{Clash Scenario}{Chain Link}{x}";
  assert.equal(withScenarioKind(clash, "campaigns"), clash);
  assert.equal(withScenarioKind("no heading here", "clash"), "no heading here");
});

test("scenarioTitle reads the heading's third argument", () => {
  const source =
    "% !TeX spellcheck = en_US\n\\addscenariosection{1}{Alliance Scenario}{Wur}{\\images/shackles_of_war.png}\n";
  assert.equal(scenarioTitle(source), "Wur");
});

test("scenarioTitle skips the optional argument and a commented-out heading", () => {
  const source = "% \\addscenariosection{1}{Old}{Gone}{x}\n\\addscenariosection[subsection]{1}{Kind}{Kept}{x}";
  assert.equal(scenarioTitle(source), "Kept");
});

test("scenarioTitle prints accents, dashes and line breaks as text", () => {
  assert.equal(scenarioTitle("\\addscenariosection{1}{K}{S\\'{i}la V\\r{u}le}{x}"), "Síla Vůle");
  assert.equal(
    scenarioTitle("\\addscenariosection{1}{K}{Kampa\\v{n} Hradu $-$ Dámský\n  Gambit}{x}"),
    "Kampaň Hradu – Dámský Gambit",
  );
  assert.equal(scenarioTitle("\\addscenariosection{1}{K}{Fire \\& {\\textit{Ice}}}{x}"), "Fire & Ice");
});

test("scenarioTitle is null with no heading, an unfinished one or an empty title", () => {
  assert.equal(scenarioTitle("\\section{Rules}"), null);
  assert.equal(scenarioTitle("\\addscenariosection{1}{K}{Unfinished"), null);
  assert.equal(scenarioTitle("\\addscenariosection{1}{K}{ }{x}"), null);
});

test("scenarioTitle reads a plain title from every scenario in the book", () => {
  for (const dir of ["clash", "coops", "campaigns"]) {
    for (const file of readdirSync(join(repoRoot, dir)).filter(
      (name) => name.endsWith(".tex") && name !== "main.tex",
    )) {
      const title = scenarioTitle(readRepoFile(`${dir}/${file}`));
      if (title === null) continue; // a campaign part file may carry no heading of its own
      assert.doesNotMatch(title, /[\\{}$~%]/, `${dir}/${file}: ${title}`);
    }
  }
});

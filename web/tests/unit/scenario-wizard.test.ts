// Tier 1 check of the start wizard's generator: the escaping, the Player
// Count wording, and filling the real templates/wizard.tex.
//
// To see the fully answered scenario, e.g. to paste it into the editor:
//   PRINT_SCENARIO=1 node --test --test-name-pattern "every field" "web/tests/unit/scenario-wizard.test.ts"

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { withScenarioTitle } from "../../shared/build-plan.ts";
import { DRAFT_CATEGORIES, withScenarioKind } from "../../shared/scenario-name.ts";
import {
  BUILDINGS,
  escapeLatex,
  fillScenarioTemplate,
  formatPlayerCount,
  INCOME_TRACK,
  MAX_PER_PLAYER,
  mapCaption,
  TemplateAnchorError,
  WIZARD_CATEGORIES,
  WIZARD_TEMPLATE_PATH,
} from "../../shared/scenario-wizard.ts";
import { readRepoFile, repoRoot } from "../helpers/repo.ts";

const template = readRepoFile(WIZARD_TEMPLATE_PATH);

// --- constants ------------------------------------------------------------------

test("the wizard offers every draft category except campaigns", () => {
  assert.deepEqual(
    WIZARD_CATEGORIES,
    DRAFT_CATEGORIES.filter((category) => category !== "campaigns"),
  );
});

test("the income track holds the board's values", () => {
  assert.deepEqual(INCOME_TRACK.gold, [10, 15, 20, 25, 30, 35, 40, 45]);
  assert.deepEqual(INCOME_TRACK.building_materials, [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(INCOME_TRACK.valuables, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("the buildings come in their fixed order", () => {
  assert.deepEqual(
    BUILDINGS.map((building) => building.key),
    [
      "bronze",
      "silver",
      "golden",
      "city_hall",
      "citadel",
      "mage_guild",
      "building_special_tent",
      "building_special_gears",
    ],
  );
});

test("a building has a dark glyph exactly when its -yellow file exists", () => {
  for (const building of BUILDINGS) {
    const yellow = `${building.glyph}-yellow`;
    const exists = existsSync(join(repoRoot, "assets", "glyphs", `${yellow}.svg`));
    assert.equal(building.darkGlyph, exists ? yellow : null, building.key);
  }
});

test("a Dwelling glyph keeps the default size, a faction building glyph is drawn at 12 points, both joined by a hard space", () => {
  for (const building of BUILDINGS) {
    if (building.output.endsWith("~Dwelling")) {
      assert.match(building.output, /^\\svg\{[a-z_]+\}~Dwelling$/, building.key);
    } else if (building.output.startsWith("\\svg")) {
      assert.match(building.output, /^\\svg\[12\]\{[a-z_]+\}~Building$/, building.key);
    }
  }
});

// --- escapeLatex ----------------------------------------------------------------

test("full mode escapes each special character", () => {
  assert.equal(escapeLatex("\\", "full"), "\\textbackslash{}");
  assert.equal(escapeLatex("{", "full"), "\\{");
  assert.equal(escapeLatex("}", "full"), "\\}");
  assert.equal(escapeLatex("&", "full"), "\\&");
  assert.equal(escapeLatex("%", "full"), "\\%");
  assert.equal(escapeLatex("#", "full"), "\\#");
  assert.equal(escapeLatex("$", "full"), "\\$");
  assert.equal(escapeLatex("_", "full"), "\\_");
  assert.equal(escapeLatex("~", "full"), "\\textasciitilde{}");
  assert.equal(escapeLatex("^", "full"), "\\textasciicircum{}");
  assert.equal(escapeLatex("Fish & chips, 50% off #1", "full"), "Fish \\& chips, 50\\% off \\#1");
});

test("full mode escapes a command it is given", () => {
  assert.equal(escapeLatex("\\svg{gold}", "full"), "\\textbackslash{}svg\\{gold\\}");
});

test("both modes turn straight double quotes into pairs", () => {
  for (const mode of ["full", "keep-commands"] as const) {
    assert.equal(escapeLatex('say "hi" now', mode), "say ``hi'' now");
    assert.equal(escapeLatex('"Start" and ("inner")', mode), "``Start'' and (``inner'')");
  }
});

test("both modes keep the em dash and the curly apostrophe", () => {
  for (const mode of ["full", "keep-commands"] as const) {
    assert.equal(escapeLatex("Heroes’ march — onward", mode), "Heroes’ march — onward");
  }
});

test("keep-commands mode passes a command and its groups through", () => {
  assert.equal(escapeLatex("\\svg{building_materials}", "keep-commands"), "\\svg{building_materials}");
  assert.equal(escapeLatex("gain 1~\\svg[12]{movement}", "keep-commands"), "gain 1~\\svg[12]{movement}");
  assert.equal(escapeLatex("\\textbf{a_b {c}} d_e", "keep-commands"), "\\textbf{a_b {c}} d\\_e");
});

test("keep-commands mode escapes & % # $ _ ^ outside commands", () => {
  assert.equal(
    escapeLatex("gains 1 \\svg{movement} & 2 \\svg{gold}", "keep-commands"),
    "gains 1 \\svg{movement} \\& 2 \\svg{gold}",
  );
  assert.equal(escapeLatex("50% #1 $2 a_b x^2", "keep-commands"), "50\\% \\#1 \\$2 a\\_b x\\^2");
});

test("keep-commands mode converts quotes around a kept command", () => {
  assert.equal(
    escapeLatex('A "Pack" of the cheapest \\svg{bronze} Units', "keep-commands"),
    "A ``Pack'' of the cheapest \\svg{bronze} Units",
  );
});

// --- formatPlayerCount ----------------------------------------------------------

test("player counts read as a number, a range or a list", () => {
  assert.equal(formatPlayerCount([2]), "2");
  assert.equal(formatPlayerCount([2, 3, 4]), "2--4");
  assert.equal(formatPlayerCount([2, 3]), "2 or 3");
  assert.equal(formatPlayerCount([1, 2, 4]), "1, 2 or 4");
  assert.equal(formatPlayerCount([1, 2, 3, 4, 6]), "1--4 or 6");
});

test("player counts are sorted and deduplicated", () => {
  assert.equal(formatPlayerCount([4, 2, 3, 2]), "2--4");
});

// --- fillScenarioTemplate -------------------------------------------------------

// A skipped Map Tile Pool pane drops the line, as No does, so every other
// comparison starts from the template without it.
const POOL_LINE = "\\textbf{Map Tile Pool:} Each player takes X [random] Near/Far Map (A--B) Tiles...\n\n";
const poolless = template.replace(POOL_LINE, "");

/**
 * The template's lines that differ from `output`'s, compared line by line.
 *
 * @param output the filled template
 */
function changedLines(output: string): { before: string; after: string }[] {
  const before = poolless.split("\n");
  const after = output.split("\n");
  assert.equal(after.length, before.length, "the line count changed");
  return before.flatMap((line, i) => (line === after[i] ? [] : [{ before: line, after: after[i]! }]));
}

test("with only a name and category, only the title and kind change, and the Map Tile Pool line goes", () => {
  const output = fillScenarioTemplate(template, { name: "Iron Pass", category: "clash" });
  assert.ok(template.includes(POOL_LINE));
  assert.equal(output, withScenarioKind(withScenarioTitle(poolless, "Iron Pass"), "clash"));
  assert.deepEqual(changedLines(output), [
    {
      before: "\\addscenariosection{1}{Cooperative Scenario}{...}{\\images/title.png}",
      after: "\\addscenariosection{1}{Clash Scenario}{Iron Pass}{\\images/title.png}",
    },
  ]);
});

test("with rounds as well, only the length line changes besides", () => {
  const output = fillScenarioTemplate(template, { name: "Iron Pass", category: "coops", rounds: 12 });
  assert.deepEqual(
    changedLines(output).map((line) => line.after),
    ["\\addscenariosection{1}{Cooperative Scenario}{Iron Pass}{\\images/title.png}", "12 Rounds"],
  );
});

/** Every field answered. Printed by PRINT_SCENARIO=1, see the header. */
const FULL_ANSWERS = {
  name: "Iron Pass",
  category: "clash",
  author: "Jan & Ann_B",
  headerImage: "assets/images/iron_pass.png",
  lore: 'The "pass" is closed.\nOnly the bold 100% cross it.\n\nWinter — comes.',
  rounds: 12,
  playerCounts: [2, 3, 4],
  income: { gold: 15, building_materials: null, valuables: 1 },
  resources: { gold: 20, building_materials: 6, valuables: null },
  startingUnits: 'A "Pack" of the cheapest \\svg{bronze} Units\n\nA "Few" of the most expensive \\svg{bronze} Units',
  buildings: ["mage_guild", "bronze", "building_special_tent"],
  tilePool: { far: 2, near: 1 },
  mapSetup: { starting: 2, far: 4, near: 0, center: 1 },
  victory: "Take control of the enemy Town.\nAny Town counts.\n\nOr defeat every Hero.",
  defeat: "At end of Round 12 the game ends in a draw.",
  timedEvents: [
    { round: 6, text: "Each player gains 2 \\svg{gold} & 1 \\svg{valuables}" },
    { round: 2, text: "The \\nth{2} player gains 1~\\svg{movement}\nReveal a Field" },
  ],
  rules: [
    "You may pay 2 \\svg{building_materials} instead of 1 \\svg{valuables}.",
    "",
    "Heroes cannot enter the Grail Field.\n\nThis lasts all game.",
  ],
  maps: [
    { path: "assets/maps/iron_pass_2p.png", counts: [2] },
    { path: "assets/maps/iron_pass_3-4p.png", counts: [4, 3] },
  ],
};

/**
 * The text between one heading line and the next \subsection*.
 *
 * @param source the template text
 * @param heading the section heading
 */
function section(source: string, heading: string): string {
  const start = source.indexOf(`\\subsection*{\\MakeUppercase{${heading}}}`);
  assert.ok(start >= 0, `no ${heading} section`);
  const next = source.indexOf("\\subsection*", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/**
 * Whether every brace outside comments closes, ignoring escaped ones.
 *
 * @param source the text to check
 */
function balancedBraces(source: string): boolean {
  let depth = 0;
  for (const line of source.split("\n")) {
    const code = line.replace(/(^|[^\\])%.*$/, "$1");
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "\\") {
        i++;
        continue;
      }
      if (code[i] === "{") depth++;
      if (code[i] === "}" && --depth < 0) return false;
    }
  }
  return depth === 0;
}

test("with every field answered, each answer lands in its section", () => {
  const output = fillScenarioTemplate(template, FULL_ANSWERS);
  if (process.env.PRINT_SCENARIO) console.log(output);

  assert.ok(balancedBraces(output), "braces are unbalanced outside comments");
  for (const placeholder of [
    "\\textbf{Author:} ...",
    "1--2 two paragraphs",
    "... Rounds",
    "\\textbf{Player Count:} ...",
    "X \\svg{gold}",
    "A \\svg{gold}",
    "A Few \\svg{bronze}...",
    "Dwelling...",
    "Near/Far",
    "W × Starting",
    "\\nth{2} Round:}\n\\begin{itemize}\n  \\item ...",
    "your_map.png",
  ]) {
    assert.ok(!output.includes(placeholder), `${JSON.stringify(placeholder)} is still in the output`);
  }

  assert.ok(
    output.startsWith(
      "% !TeX spellcheck = en_US\n\\addscenariosection{1}{Clash Scenario}{Iron Pass}{\\images/iron_pass.png}\n",
    ),
  );
  assert.ok(output.includes("\\textbf{Author:} Jan \\& Ann\\_B\n"));
  assert.ok(output.includes("\\textit{The ``pass'' is closed. Only the bold 100\\% cross it. Winter — comes.}\n"));

  assert.equal(section(output, "Scenario Length").trim().split("\n").at(-1), "12 Rounds");

  const setup = section(output, "Player Setup");
  assert.ok(setup.includes("\\textbf{Player Count:} 2--4\n"));
  assert.ok(setup.includes("\\textbf{Starting Resources:} 20 \\svg{gold}, 6 \\svg{building_materials}\n"));
  assert.ok(
    setup.includes("\\textbf{Starting Income:} 15 \\svg{gold}, 0 \\svg{building_materials}, 1 \\svg{valuables}\n"),
  );
  assert.ok(
    setup.includes(
      [
        "\\textbf{Starting Units:}",
        "\\begin{itemize}",
        "  \\item A ``Pack'' of the cheapest \\svg{bronze} Units",
        "  \\item A ``Few'' of the most expensive \\svg{bronze} Units",
        "\\end{itemize}",
      ].join("\n"),
    ),
  );
  assert.ok(
    setup.includes(
      "\\textbf{Town Buildings:} \\svg{bronze}~Dwelling, Mage Guild, \\svg[12]{building_special_tent}~Building\n",
    ),
  );
  assert.ok(
    setup.includes(
      "\\textbf{Map Tile Pool:} Each player takes 2 random Far (II--III) Map Tiles and 1 random Near (IV--V) Map Tile\n",
    ),
  );

  assert.ok(
    section(output, "Map Setup").includes(
      [
        "Take the following Map Tiles and arrange them as shown in the Scenario map layout:",
        "\\begin{itemize}",
        "  \\item 2 × Starting (I) Map Tiles",
        "  \\item 4 × Far (II--III) Map Tiles",
        "  \\item 1 × Center (VI--VII) Map Tile",
        "\\end{itemize}",
      ].join("\n"),
    ),
  );

  assert.equal(
    section(output, "Victory Conditions"),
    "\\subsection*{\\MakeUppercase{Victory Conditions}}\nTake control of the enemy Town. Any Town counts.\n\nOr defeat every Hero.\n\n",
  );
  assert.equal(
    section(output, "Defeat Conditions"),
    "\\subsection*{\\MakeUppercase{Defeat Conditions}}\nAt end of Round 12 the game ends in a draw.\n\n",
  );

  const events = section(output, "Timed Events");
  assert.equal(
    events,
    [
      "\\subsection*{\\MakeUppercase{Timed Events}}",
      "",
      "\\textbf{\\nth{2} Round:}",
      "\\begin{itemize}",
      "  \\item The \\nth{2} player gains 1~\\svg{movement}",
      "  \\item Reveal a Field",
      "\\end{itemize}",
      "",
      "\\textbf{\\nth{6} Round:}",
      "\\begin{itemize}",
      "  \\item Each player gains 2 \\svg{gold} \\& 1 \\svg{valuables}",
      "\\end{itemize}",
      "",
      "",
    ].join("\n"),
  );

  assert.ok(
    section(output, "Additional Rules").startsWith(
      [
        "\\subsection*{\\MakeUppercase{Additional Rules}}",
        "",
        "\\begin{itemize}",
        "    \\item You may pay 2 \\svg{building_materials} instead of 1 \\svg{valuables}.",
        "    \\item Heroes cannot enter the Grail Field.",
        "",
        "This lasts all game.",
        "\\end{itemize}",
      ].join("\n"),
    ),
  );

  assert.ok(
    output.endsWith(
      [
        "\\vspace{3em}",
        "\\begin{center}",
        "  \\includegraphics[width=0.6\\paperwidth]{\\maps/iron_pass_2p.png}",
        "  \\captionof{figure}{\\textbf{2-PLAYER SCENARIO}}",
        "\\end{center}",
        "",
        "\\vspace{3em}",
        "\\begin{center}",
        "  \\includegraphics[width=0.6\\paperwidth]{\\maps/iron_pass_3-4p.png}",
        "  \\captionof{figure}{\\textbf{3/4-PLAYER SCENARIO}}",
        "\\end{center}",
        "",
      ].join("\n"),
    ),
  );
  assert.ok(!output.includes("% Uncomment and link a map image"));
});

test("a lore text with a blank line becomes one single-line \\textit", () => {
  const output = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    lore: "First paragraph.\n\nSecond paragraph.\r\nStill second.",
  });
  const lines = output.split("\n").filter((line) => line.startsWith("\\textit{"));
  assert.deepEqual(lines, ["\\textit{First paragraph. Second paragraph. Still second.}"]);
});

test("a Starting Resource of 0 is left out, while a 0 Starting Income is written", () => {
  const output = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    resources: { gold: 10, building_materials: 0, valuables: 2 },
    income: { gold: 10, building_materials: 0, valuables: 0 },
  });
  assert.ok(output.includes("\\textbf{Starting Resources:} 10 \\svg{gold}, 2 \\svg{valuables}\n"));
  assert.ok(
    output.includes("\\textbf{Starting Income:} 10 \\svg{gold}, 0 \\svg{building_materials}, 0 \\svg{valuables}\n"),
  );
});

test("Starting Resources of all 0 write None", () => {
  const output = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    resources: { gold: 0, building_materials: 0, valuables: null },
  });
  assert.ok(output.includes("\\textbf{Starting Resources:} None\n"));
});

test("tilePool false or skipped removes the Map Tile Pool line and keeps one blank line", () => {
  const output = fillScenarioTemplate(template, { name: "Iron Pass", category: "clash", tilePool: false });
  assert.equal(fillScenarioTemplate(template, { name: "Iron Pass", category: "clash" }), output);
  assert.ok(!output.includes("Map Tile Pool"));
  assert.ok(
    output.includes("\\textbf{Town Buildings:} \\svg{bronze} Dwelling...\n\n\\subsection*{\\MakeUppercase{Map Setup}}"),
  );
});

test("the template has no Additional Bonus, and one blank line before Map Setup", () => {
  assert.ok(!template.includes("Additional Bonus"));
  assert.ok(template.includes("Tiles...\n\n\\subsection*{\\MakeUppercase{Map Setup}}"));
});

test("a per-player map setup count writes $P$ or $kP$, always plural, and the intro explains P", () => {
  const output = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    mapSetup: { starting: { perPlayer: 1 }, far: { perPlayer: 2 }, near: 1, center: { perPlayer: MAX_PER_PLAYER } },
  });
  assert.ok(
    section(output, "Map Setup").includes(
      [
        "Take the following Map Tiles and arrange them as shown in the Scenario map layout ($P$ stands for the number of players):",
        "\\begin{itemize}",
        "  \\item $P$ × Starting (I) Map Tiles",
        "  \\item $2P$ × Far (II--III) Map Tiles",
        "  \\item 1 × Near (IV--V) Map Tile",
        "  \\item $6P$ × Center (VI--VII) Map Tiles",
        "\\end{itemize}",
      ].join("\n"),
    ),
  );
});

test("a map setup with only per-player counts is answered, and one without P keeps the plain intro", () => {
  const onlyP = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    mapSetup: { starting: 0, far: 0, near: 0, center: { perPlayer: 1 } },
  });
  assert.ok(onlyP.includes("\n  \\item $P$ × Center (VI--VII) Map Tiles\n"));
  assert.ok(!onlyP.includes("W × Starting"));

  const plain = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    mapSetup: { starting: 2, far: 0, near: 0, center: 0 },
  });
  assert.ok(plain.includes("in the Scenario map layout:\n"));
  assert.ok(!plain.includes("$P$"));
});

test("a map caption names the layout for every player count, or the counts it is for", () => {
  assert.equal(mapCaption([]), "\\textbf{SCENARIO MAP LAYOUT}");
  assert.equal(mapCaption([3]), "\\textbf{3-PLAYER SCENARIO}");
  assert.equal(mapCaption([4, 2]), "\\textbf{2/4-PLAYER SCENARIO}");
  assert.equal(mapCaption([2, 3, 4, 3]), "\\textbf{2/3/4-PLAYER SCENARIO}");
});

test("a map for every player count is captioned as the Scenario map layout", () => {
  const output = fillScenarioTemplate(template, {
    name: "Iron Pass",
    category: "clash",
    maps: [{ path: "assets/maps/iron_pass.png", counts: [] }],
  });
  assert.ok(
    output.endsWith(
      [
        "\\end{multicols*}",
        "",
        "\\vspace{3em}",
        "\\begin{center}",
        "  \\includegraphics[width=0.6\\paperwidth]{\\maps/iron_pass.png}",
        "  \\captionof{figure}{\\textbf{SCENARIO MAP LAYOUT}}",
        "\\end{center}",
        "",
      ].join("\n"),
    ),
  );
});

test("no buildings ticked writes None", () => {
  const output = fillScenarioTemplate(template, { name: "Iron Pass", category: "clash", buildings: [] });
  assert.ok(output.includes("\\textbf{Town Buildings:} None\n"));
});

test("a missing anchor throws a TemplateAnchorError", () => {
  const broken = template.replace("\\textbf{Player Count:} ...", "\\textbf{Player Count:} TBD");
  assert.throws(
    () => fillScenarioTemplate(broken, { name: "Iron Pass", category: "clash", playerCounts: [2] }),
    (error) => error instanceof TemplateAnchorError && error.name === "TemplateAnchorError",
  );
  // A skipped field needs no anchor.
  assert.doesNotThrow(() => fillScenarioTemplate(broken, { name: "Iron Pass", category: "clash" }));
});

test("a campaign is refused", () => {
  assert.throws(() => fillScenarioTemplate(template, { name: "Iron Pass", category: "campaigns" }));
});

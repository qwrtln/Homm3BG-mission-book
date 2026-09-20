// Tier 1 unit tests for web/shared/build-plan.js, the app's only piece of
// substantial logic with no DOM and no network in it.
import test from "node:test";
import assert from "node:assert/strict";

import {
  ALWAYS_PRELOAD,
  CARRIED_TEXMF,
  CORE_GLYPHS,
  DRAFT_GROUP_FILES,
  GROUP_FILES,
  MAIN_EN,
  PATH_MACROS,
  collectReferencedAssets,
  collectReferencedGlyphs,
  firstError,
  glyphFilesFor,
  missingFiles,
  newMissingPaths,
  pageCount,
  parseScenarioIndex,
  planScenarioBuild,
  resolveMacroPath,
  scenarioHeading,
} from "../../shared/build-plan.js";

test("glyphFilesFor asks for the source svg and the precompiled pair", () => {
  assert.deepEqual(glyphFilesFor(["gold"]), [
    "assets/glyphs/gold.svg",
    "assets/glyphs-inkscape/gold_svg-tex.pdf",
    "assets/glyphs-inkscape/gold_svg-tex.pdf_tex",
  ]);
  assert.equal(glyphFilesFor(["gold", "bronze"]).length, 6);
});

test("collectReferencedGlyphs reads the source's own svg calls", () => {
  const source = String.raw`\svg{gold} \svg[width=2em]{ azure } \svg{gold}`;
  assert.deepEqual(collectReferencedGlyphs(source), ["azure", "gold"]);
  assert.deepEqual(collectReferencedGlyphs("no glyphs here"), []);
});

test("resolveMacroPath expands a known macro and drops what is not a file", () => {
  assert.equal(resolveMacroPath(String.raw`\images/astral.png`), "assets/images/astral.png");
  assert.equal(resolveMacroPath(String.raw`\qr/link.png`), "assets/qr-codes/link.png");
  assert.equal(resolveMacroPath(String.raw`\nosuchmacro/x.png`), null);
  assert.equal(resolveMacroPath("#1"), null, "macro parameters are not files");
  assert.equal(resolveMacroPath(" plain/path.png "), "plain/path.png");
});

test("collectReferencedAssets finds both the includegraphics and the braced form", () => {
  const source = String.raw`
    \includegraphics[width=\linewidth]{\images/astral.png}
    \includesvg{\svgs/gold.svg}
    \addscenariosection{1}{Clash}{Astral Run}{\layout/clash.png}
    \addscenariosection{1}{Clash}{Macro}{\images/#1.png}
    \renewcommand{\thing}{\images/\something.png}
    {\cards/deck.tex}
  `;
  assert.deepEqual(collectReferencedAssets(source), [
    "assets/glyphs/gold.svg",
    "assets/images/astral.png",
    "assets/layout/clash.png",
  ]);
});

test("collectReferencedAssets drops macro parameters, unresolved macros, and non-pictures", () => {
  const found = collectReferencedAssets(String.raw`
    \addscenariosection{1}{Clash}{Macro}{\images/#1.png}
    {\images/\something.png}
    {\cards/deck.tex}
    {\nosuch/real.png}
  `);
  assert.deepEqual(found, [], "nothing here names a real picture file");
});

test("scenarioHeading reads the kind and the title, cleaned of TeX", () => {
  const plain = String.raw`\addscenariosection{1}{Clash}{Astral Run}{\layout/clash.png}`;
  assert.deepEqual(scenarioHeading(plain), { kind: "Clash", title: "Astral Run" });

  const campaign = String.raw`\addscenariosection[subsection]{2}{Campaign}{Rise $-$ Exile}{\layout/x.png}`;
  assert.deepEqual(scenarioHeading(campaign), { kind: "Campaign", title: "Rise — Exile" });

  assert.equal(scenarioHeading("a scenario with no heading"), null);
});

test("parseScenarioIndex follows the group files' input lines, in book order", () => {
  const sources = [
    {
      path: "clash/main.tex",
      source: String.raw`\input{\clashpath/bloody_grail.tex}
\input{\clashpath/astral_run.tex}`,
    },
    { path: "coops/main.tex", source: String.raw`\input{\coopspath/gold_rush.tex}` },
  ];
  assert.deepEqual(parseScenarioIndex(sources), [
    { path: "clash/bloody_grail.tex", dir: "clash" },
    { path: "clash/astral_run.tex", dir: "clash" },
    { path: "coops/gold_rush.tex", dir: "coops" },
  ]);
});

test("parseScenarioIndex ignores a group file the table does not list", () => {
  const sources = [{ path: "not-a-group/main.tex", source: String.raw`\input{\clashpath/x.tex}` }];
  assert.deepEqual(parseScenarioIndex(sources), []);
});

test("parseScenarioIndex reads the draft book from the draft table", () => {
  const sources = [
    { path: "draft-scenarios/alliances/main.tex", source: String.raw`\input{\alliancespath/pact.tex}` },
  ];
  assert.deepEqual(parseScenarioIndex(sources, DRAFT_GROUP_FILES), [
    { path: "draft-scenarios/alliances/pact.tex", dir: "draft-scenarios/alliances" },
  ]);
  assert.deepEqual(parseScenarioIndex(sources), [], "the published table has no alliances group");
});

test("planScenarioBuild refuses a plan with no scenario", () => {
  assert.throws(() => planScenarioBuild({}), /needs a scenario/);
  assert.throws(() => planScenarioBuild(null), /needs a scenario/);
});

test("planScenarioBuild writes one include into structure.tex", () => {
  const plan = planScenarioBuild({ metadata: "", scenario: { path: "clash/astral_run.tex", source: "" } });
  assert.equal(plan.generated["structure.tex"], "\\include{clash/astral_run.tex}\n");
  assert.equal(plan.engine, "lualatex");
  assert.equal(plan.input, MAIN_EN);
  assert.equal(plan.dataPackage, "texlive-extra");
  assert.deepEqual(plan.carriedTexmf, CARRIED_TEXMF);
  assert.notEqual(plan.carriedTexmf, CARRIED_TEXMF, "carriedTexmf is a copy, not the shared array");
});

test("planScenarioBuild stages the preloads, the scenario, its pictures, and its glyphs", () => {
  const plan = planScenarioBuild({
    metadata: String.raw`\includegraphics{\layout/cover.png}`,
    scenario: {
      path: "clash/astral_run.tex",
      source: String.raw`\svg{artifact} \includegraphics{\images/astral.png}`,
    },
  });

  for (const path of ALWAYS_PRELOAD) assert.ok(plan.repoFiles.includes(path), `missing ${path}`);
  assert.ok(plan.repoFiles.includes("clash/astral_run.tex"));
  assert.ok(plan.repoFiles.includes("assets/layout/cover.png"), "metadata's own pictures are staged too");
  assert.ok(plan.repoFiles.includes("assets/images/astral.png"));
  for (const glyph of CORE_GLYPHS) {
    assert.ok(plan.repoFiles.includes(`assets/glyphs-inkscape/${glyph}_svg-tex.pdf`), `missing core glyph ${glyph}`);
  }
  assert.ok(plan.repoFiles.includes("assets/glyphs-inkscape/artifact_svg-tex.pdf"), "the source's own glyph");
});

test("planScenarioBuild never stages a core glyph twice", () => {
  const plan = planScenarioBuild({
    scenario: { path: "clash/x.tex", source: String.raw`\svg{gold}\svg{gold}` },
  });
  const gold = plan.repoFiles.filter((path) => path === "assets/glyphs-inkscape/gold_svg-tex.pdf");
  assert.equal(gold.length, 1);
});

test("firstError pulls out the first real error line and nothing else", () => {
  const log = ["This is chatter", "! Undefined control sequence.", "! Second error"].join("\n");
  assert.equal(firstError(log), "! Undefined control sequence.");
  assert.equal(firstError("./clash/x.tex:42: Missing $ inserted."), "./clash/x.tex:42: Missing $ inserted.");
  assert.equal(firstError("nothing wrong here"), null);
  assert.equal(firstError(""), null);
  assert.equal(firstError(null), null);
});

test("pageCount takes the last Output-written line, not the first", () => {
  const log = [
    "Output written on scenario.pdf (5 pages, 100 bytes).",
    "rerunning to settle cross-references",
    "Output written on scenario.pdf (4 pages, 120 bytes).",
  ].join("\n");
  assert.equal(pageCount(log), 4, "an early pass reports a stale count; only the last pass matches the PDF");
  assert.equal(pageCount("Output written on x.pdf (1 page, 9 bytes)."), 1, "the singular 'page' still matches");
  assert.equal(pageCount("no output line"), 0);
  assert.equal(pageCount(null), 0);
});

test("missingFiles reports every not-found path once, sorted", () => {
  const log = [
    "! LaTeX Error: File `zebra.sty' not found.",
    "File `assets/images/astral.png' not found",
    "File `assets/images/astral.png' not found",
  ].join("\n");
  assert.deepEqual(missingFiles(log), ["assets/images/astral.png", "zebra.sty"]);
  assert.deepEqual(missingFiles(""), []);
  assert.deepEqual(missingFiles(null), []);
});

test("newMissingPaths only returns what no round has reached for yet", () => {
  const missing = ["a.png", "b.png"];
  assert.deepEqual(newMissingPaths(missing, new Set()), ["a.png", "b.png"]);
  assert.deepEqual(newMissingPaths(missing, new Set(["a.png"])), ["b.png"]);
  assert.deepEqual(newMissingPaths(missing, new Set(["a.png", "b.png"])), [], "a repeat is a genuine miss: stop");
});

test("the path macro table matches metadata.tex's own declarations", () => {
  assert.equal(PATH_MACROS.svgs, "assets/glyphs", "the svgs macro does not point at assets/svgs");
  assert.equal(PATH_MACROS.qr, "assets/qr-codes");
  assert.equal(PATH_MACROS.sections, "sections");
  assert.deepEqual(GROUP_FILES.map((group) => group.dir), ["coops", "clash", "campaigns"]);
});

test("withScenarioTitle swaps only the title slot", async () => {
  const { withScenarioTitle } = await import("../../shared/build-plan.js");
  assert.equal(
    withScenarioTitle("\\addscenariosection{1}{Clash}{Old Name}{\\images/a.png}\nOld Name", "New $& Name"),
    "\\addscenariosection{1}{Clash}{New $& Name}{\\images/a.png}\nOld Name",
  );
  assert.equal(
    withScenarioTitle("\\addscenariosection[Sub]{1}{Camp}{Old}{\\images/a.png}", "New"),
    "\\addscenariosection[Sub]{1}{Camp}{New}{\\images/a.png}",
  );
  assert.equal(withScenarioTitle("no heading", "New"), "no heading");
});

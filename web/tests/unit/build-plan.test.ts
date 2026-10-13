// Tier 1 unit tests for web/shared/build-plan.ts, the app's only piece of
// substantial logic with no DOM and no network in it.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ALWAYS_PRELOAD,
  auxState,
  builtStatus,
  CARRIED_TEXMF_BUNDLE,
  CORE_GLYPHS,
  collectReferencedAssets,
  collectReferencedGlyphs,
  DRAFT_GROUP_FILES,
  errorInAuxState,
  errorSpot,
  firstError,
  GROUP_FILES,
  glyphFilesFor,
  MAIN_EN,
  missingFiles,
  needsRerun,
  newMissingPaths,
  PATH_MACROS,
  pageCount,
  parseScenarioIndex,
  planScenarioBuild,
  resolveMacroPath,
  scenarioHeading,
} from "../../shared/build-plan.ts";

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
  const sources = [{ path: "draft-scenarios/alliances/main.tex", source: String.raw`\input{\alliancespath/pact.tex}` }];
  assert.deepEqual(parseScenarioIndex(sources, DRAFT_GROUP_FILES), [
    { path: "draft-scenarios/alliances/pact.tex", dir: "draft-scenarios/alliances" },
  ]);
  assert.deepEqual(parseScenarioIndex(sources), [], "the published table has no alliances group");
});

test("planScenarioBuild refuses a plan with no scenario", () => {
  assert.throws(() => planScenarioBuild({} as Parameters<typeof planScenarioBuild>[0]), /needs a scenario/);
  assert.throws(() => planScenarioBuild(null as never), /needs a scenario/);
});

test("planScenarioBuild writes one include into structure.tex", () => {
  const plan = planScenarioBuild({ metadata: "", scenario: { path: "clash/astral_run.tex", source: "" } });
  assert.equal(plan.generated["structure.tex"], "\\include{clash/astral_run.tex}\n");
  assert.equal(plan.engine, "lualatex");
  assert.equal(plan.input, MAIN_EN);
  assert.equal(plan.dataPackage, "texlive-basic");
  assert.equal(plan.carriedBundle, CARRIED_TEXMF_BUNDLE);
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

// A LuaLaTeX log as the engine writes it: no -file-line-error, so the error
// names no file. The open-file parentheses say which file TeX was reading.
const LOG_HEAD = [
  "This is LuaHBTeX, Version 1.18.0 (TeX Live 2024)  (INITEX)",
  " restricted system commands enabled.",
  "(./main_en.tex",
  "LaTeX2e <2023-11-01> patch level 1",
  "(/texlive/texmf-dist/tex/latex/base/book.cls",
  "Document Class: book 2023/05/17 v1.4n Standard LaTeX document class",
  "(/texlive/texmf-dist/tex/latex/base/bk10.clo",
  "File: bk10.clo 2023/05/17 v1.4n Standard LaTeX file (size option)",
  "))",
  "(./metadata.tex) (./main_en.aux) (./structure.tex",
];

/**
 * A scenario source of `count` lines, each "text N", with the given lines
 * (1-based) replaced.
 */
function sourceOf(count: number, lines: Record<number, string> = {}): string {
  return Array.from({ length: count }, (_, i) => lines[i + 1] ?? `text ${i + 1}`).join("\n");
}

/** A log whose first error is TeX's usual `!` line plus `l.N <context>`, with the scenario open. */
function contextLog(line: number, context: string): string {
  return [
    ...LOG_HEAD,
    "(./clash/x.tex",
    "! Undefined control sequence.",
    `l.${line} ${context}`,
    "         {bar}",
  ].join("\n");
}

test("errorSpot reads l.<n> when the scenario is the file TeX was reading", () => {
  const log = [
    ...LOG_HEAD,
    "(./clash/x.tex (/texlive/texmf-dist/tex/latex/lm/t1lmr.fd)",
    "! Undefined control sequence.",
    "l.12 \\foo",
    "         {bar}",
    "The control sequence at the end of the top line",
  ].join("\n");
  const source = sourceOf(40, { 12: "  \\foo{bar}" });
  assert.deepEqual(errorSpot(log, "clash/x.tex", source), { line: 12, from: 2, to: 6 });
  assert.deepEqual(errorSpot(log, "./clash/x.tex", source), { line: 12, from: 2, to: 6 });
});

test("errorSpot marks the last token before the error point", () => {
  // A control symbol.
  const symbol = sourceOf(5, { 3: "a \\# b" });
  assert.deepEqual(errorSpot(contextLog(3, "a \\#"), "clash/x.tex", symbol), { line: 3, from: 2, to: 4 });
  // No control sequence there: the last run of non-spaces.
  const plain = sourceOf(5, { 3: "one two} three" });
  assert.deepEqual(errorSpot(contextLog(3, "one two}"), "clash/x.tex", plain), { line: 3, from: 4, to: 8 });
  // The first place the printed text ends, as TeX stops at the first error.
  const twice = sourceOf(5, { 3: "\\foo and \\foo" });
  assert.deepEqual(errorSpot(contextLog(3, "\\foo"), "clash/x.tex", twice), { line: 3, from: 0, to: 4 });
});

test("errorSpot finds the token when TeX cut the context short with ...", () => {
  const long = `${"word ".repeat(20)}\\undefinedthing{x}`;
  const source = sourceOf(5, { 4: long });
  const from = long.indexOf("\\undefinedthing");
  assert.deepEqual(errorSpot(contextLog(4, "...word word \\undefinedthing"), "clash/x.tex", source), {
    line: 4,
    from,
    to: from + "\\undefinedthing".length,
  });
  // A cut context that fits twice: the error point is unknown, so the whole line.
  const twice = sourceOf(5, { 3: " \\foo and \\foo " });
  assert.deepEqual(errorSpot(contextLog(3, "...\\foo"), "clash/x.tex", twice), { line: 3, from: 1, to: 14 });
});

test("errorSpot marks the whole trimmed line when the context does not match the source", () => {
  const source = sourceOf(5, { 3: "  \\bar{baz}  " });
  assert.deepEqual(errorSpot(contextLog(3, "\\foo"), "clash/x.tex", source), { line: 3, from: 2, to: 11 });
  // Nothing printed after l.N: the error point is the start of the line.
  assert.deepEqual(errorSpot(contextLog(3, ""), "clash/x.tex", source), { line: 3, from: 2, to: 11 });
});

test("errorSpot gives no spot for an error in a file the user cannot edit", () => {
  const inMacros = [
    ...LOG_HEAD,
    "(./clash/x.tex (./sections/macros.tex",
    "! Missing $ inserted.",
    "l.3 \\newcommand",
  ].join("\n");
  assert.equal(errorSpot(inMacros, "clash/x.tex", sourceOf(40)), null);

  // The scenario has closed; the error is in main_en.tex after it.
  const afterScenario = [
    ...LOG_HEAD,
    "(./clash/x.tex) (see the transcript file for additional information))",
    "! LaTeX Error: \\begin{document} ended by \\end{foo}.",
    "l.40 \\end{foo}",
  ].join("\n");
  assert.equal(errorSpot(afterScenario, "clash/x.tex", sourceOf(100)), null);
});

test("errorSpot follows only the first error, the one the panel shows", () => {
  const log = [
    ...LOG_HEAD,
    "(./clash/x.tex (./sections/macros.tex",
    "! Missing $ inserted.",
    "l.3 \\newcommand",
    ")",
    "! Undefined control sequence.",
    "l.12 \\foo",
  ].join("\n");
  assert.equal(errorSpot(log, "clash/x.tex", sourceOf(40)), null);
});

test("errorSpot needs a line number inside the document", () => {
  const withLine = (n: number) =>
    [...LOG_HEAD, "(./clash/x.tex", "! Undefined control sequence.", `l.${n} \\foo`].join("\n");
  assert.equal(errorSpot(withLine(12), "clash/x.tex", sourceOf(12))?.line, 12);
  assert.equal(errorSpot(withLine(13), "clash/x.tex", sourceOf(12)), null);
  assert.equal(errorSpot(withLine(0), "clash/x.tex", sourceOf(12)), null);

  const noLine = [...LOG_HEAD, "(./clash/x.tex", "! Emergency stop.", "*** (job aborted, no legal \\end found)"].join(
    "\n",
  );
  assert.equal(errorSpot(noLine, "clash/x.tex", sourceOf(40)), null);
  assert.equal(errorSpot("nothing wrong here", "clash/x.tex", sourceOf(40)), null);
  assert.equal(errorSpot("", "clash/x.tex", sourceOf(40)), null);
  assert.equal(errorSpot(null, "clash/x.tex", sourceOf(40)), null);
});

test("errorSpot rejoins a file path TeX wrapped at 79 characters", () => {
  const path = "campaigns/the_queens_gambit/a_rather_long_scenario_file_name_for_wrapping.tex";
  const opened = `(./structure.tex (./${path}`;
  const cut = 79;
  assert.ok(opened.length > cut, "the fixture must actually wrap");
  const log = [
    ...LOG_HEAD.slice(0, -1),
    opened.slice(0, cut),
    opened.slice(cut),
    "! Undefined control sequence.",
    "l.7 \\foo",
  ].join("\n");
  assert.equal(errorSpot(log, path, sourceOf(40))?.line, 7);
});

test("errorSpot reads the file:line: form too, marking the whole trimmed line", () => {
  const source = sourceOf(40, { 7: "    \\foo{bar} " });
  assert.deepEqual(errorSpot("./clash/x.tex:7: Undefined control sequence.", "clash/x.tex", source), {
    line: 7,
    from: 4,
    to: 13,
  });
  assert.equal(errorSpot("./sections/macros.tex:7: Undefined control sequence.", "clash/x.tex", source), null);
});

/** A log whose first error is a runaway argument of `\name`, printed as `runaway`. */
function runawayLog(name: string, runaway: string): string {
  return [
    ...LOG_HEAD,
    "(./clash/x.tex)",
    "Runaway argument?",
    runaway,
    `! File ended while scanning use of \\${name} .`,
    "<inserted text> ",
    "                \\par ",
    // The scenario has closed: this is the \include line in structure.tex.
    "l.1 \\include{clash/x.tex}",
  ].join("\n");
}

test("errorSpot finds the runaway \\textbf in a real engine log", () => {
  const log = [
    "(./mt-cmr.cfg) (./structure.tex (./draft-scenarios/clash/kyrre_link.tex)",
    "Runaway argument?",
    "{Player Count: 23 \\par \\textbf {Starting Resources:} 20 \\svg {gold}, \\ETC.",
    "! File ended while scanning use of \\textbf .",
    "<inserted text> ",
    "                \\par ",
    "l.1 \\include{draft-scenarios/clash/kyrre_link.tex}",
  ].join("\n");
  const source = [
    "\\subsection*{\\MakeUppercase{Player Setup}}",
    "\\textbf{Player Count: 23",
    "",
    "\\textbf{Starting Resources:} 20 \\svg{gold}, 6 \\svg{building_materials}, 1 \\svg{valuables}",
  ].join("\n");
  assert.deepEqual(errorSpot(log, "draft-scenarios/clash/kyrre_link.tex", source), { line: 2, from: 0, to: 7 });
});

test("errorSpot finds the unclosed \\textbf of a runaway argument", () => {
  const source = ["\\section{Setup}", "", "Players \\textbf{take turns and", "  never stop", ""].join("\n");
  const log = runawayLog("textbf", "{take turns and never stop \\par ");
  assert.deepEqual(errorSpot(log, "clash/x.tex", source), { line: 3, from: 8, to: 15 });
});

test("errorSpot gives no spot when the runaway text is in the source twice, or not at all", () => {
  const twice = ["\\textbf{same", "words}", "\\textbf{same words"].join("\n");
  assert.equal(errorSpot(runawayLog("textbf", "{same words \\par "), "clash/x.tex", twice), null);
  const absent = "\\textbf{other words";
  assert.equal(errorSpot(runawayLog("textbf", "{same words \\par "), "clash/x.tex", absent), null);
});

test("errorSpot matches runaway text cut at \\par or \\ETC. across a line break", () => {
  const source = ["Intro.", "\\textit{one", "two", "", "three"].join("\n");
  assert.deepEqual(errorSpot(runawayLog("textit", "{one two \\par three"), "clash/x.tex", source), {
    line: 2,
    from: 0,
    to: 7,
  });
  assert.deepEqual(errorSpot(runawayLog("textit", "{one two\\ETC."), "clash/x.tex", source), {
    line: 2,
    from: 0,
    to: 7,
  });
});

test("errorSpot matches a control word TeX printed with a space after it", () => {
  const source = ["Gain \\textbf{\\svg{gold} and more"].join("\n");
  assert.deepEqual(errorSpot(runawayLog("textbf", "{\\svg {gold} and more\\ETC."), "clash/x.tex", source), {
    line: 1,
    from: 5,
    to: 12,
  });
});

test("errorSpot takes the last \\X before the brace, and the brace's line when there is none", () => {
  // The unclosed argument is the macro's second.
  const second = ["\\twoargs{first}", "{second and on"].join("\n");
  assert.deepEqual(errorSpot(runawayLog("twoargs", "{second and on \\par "), "clash/x.tex", second), {
    line: 1,
    from: 0,
    to: 8,
  });
  // TeX named an internal macro the source never spells.
  const internal = ["text", "  \\mymacro{dangling words  "].join("\n");
  assert.deepEqual(errorSpot(runawayLog("@internal", "{dangling words \\par "), "clash/x.tex", internal), {
    line: 2,
    from: 2,
    to: 25,
  });
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

// Lines copied from a real LuaLaTeX log of clash/astral_run.tex.
const PACKAGE_LOADED = [
  "(/texlive/texmf-dist/tex/latex/rerunfilecheck/rerunfilecheck.sty",
  "Package: rerunfilecheck 2025-06-21 v1.11 Rerun checks for auxiliary files (HO)",
  "Package uniquecounter Info: New unique counter `rerunfilecheck' on input line 2",
  "Package rerunfilecheck Info: File `main.out' has not changed.",
].join("\n");

test("needsRerun ignores the rerunfilecheck package merely loading", () => {
  assert.equal(needsRerun(PACKAGE_LOADED), false, "every book log names rerunfilecheck; that alone asks for nothing");
  assert.equal(needsRerun(""), false);
  assert.equal(needsRerun(null), false);
});

test("needsRerun answers TeX's own requests for another pass", () => {
  const outlines = [
    "Package rerunfilecheck Warning: File `main.out' has changed.",
    "(rerunfilecheck)                Rerun to get outlines right",
  ].join("\n");
  assert.equal(needsRerun(`${PACKAGE_LOADED}\n${outlines}`), true);
  assert.equal(needsRerun("LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."), true);
  assert.equal(needsRerun("Package rerunfilecheck Warning: File `main.out' has changed."), true);
});

test("auxState keeps the files one pass hands the next, and nothing else", () => {
  const files = [
    { path: "main.aux", content: "a" },
    { path: "main.out", content: "o" },
    { path: "main.toc", content: "t" },
    { path: "clash/astral_run.aux", content: "s" },
    { path: "main.pdf", content: "p" },
    { path: "main.log", content: "l" },
    { path: "main.synctex.gz", content: "z" },
    { path: "clash/astral_run.tex", content: "x" },
    { path: "assets/images/aux.png", content: "i" },
  ];
  assert.deepEqual(
    auxState(files).map((file) => file.path),
    ["main.aux", "main.out", "main.toc", "clash/astral_run.aux"],
  );
});

test("errorInAuxState tells an error read from carried state from one in the source", () => {
  const fromAux = [
    "(./main_en.tex (./metadata.tex) (./main.aux (./clash/x.aux",
    "! Undefined control sequence.",
    "l.3 \\foo",
  ];
  assert.equal(errorInAuxState(fromAux.join("\n")), true);
  const fromToc = ["(./main_en.tex (./main.toc", "! Undefined control sequence."];
  assert.equal(errorInAuxState(fromToc.join("\n")), true);
  const fromSource = ["(./main_en.tex (./main.aux) (./clash/x.tex", "! Undefined control sequence.", "l.7 \\foo"];
  assert.equal(errorInAuxState(fromSource.join("\n")), false, "the aux file closed before the error");
  assert.equal(errorInAuxState("./clash/x.tex:7: Undefined control sequence."), false);
  assert.equal(errorInAuxState("./main.aux:3: Undefined control sequence."), true);
  assert.equal(errorInAuxState("no error at all"), false);
  assert.equal(errorInAuxState(null), false);
});

test("the path macro table matches metadata.tex's own declarations", () => {
  assert.equal(PATH_MACROS.svgs, "assets/glyphs", "the svgs macro does not point at assets/svgs");
  assert.equal(PATH_MACROS.qr, "assets/qr-codes");
  assert.equal(PATH_MACROS.sections, "sections");
  assert.deepEqual(
    GROUP_FILES.map((group) => group.dir),
    ["coops", "clash", "campaigns"],
  );
});

test("withScenarioTitle swaps only the title slot", async () => {
  const { withScenarioTitle } = await import("../../shared/build-plan.ts");
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

test("builtStatus: singular for one page, plural otherwise", () => {
  assert.equal(builtStatus(1, 2.5), "Built 1 page in 2.5s.");
  assert.equal(builtStatus(4, 3), "Built 4 pages in 3s.");
  assert.equal(builtStatus(0, 0.4), "Built 0 pages in 0.4s.");
});

test("build-plan.ts keeps the literal DATA_PACKAGE line the deploy's sed reads", async () => {
  // publish-docs.yaml extracts DATA_PACKAGE with:
  //   sed -n 's/^export const DATA_PACKAGE = "\(.*\)";$/\1/p' web/shared/build-plan.ts
  // A rewrite of this line (a different quote style, a type annotation, a
  // trailing comment) would make that sed print nothing and fail the deploy.
  const { readRepoFile } = await import("../helpers/repo.ts");
  const source = readRepoFile("web/shared/build-plan.ts");
  const match = /^export const DATA_PACKAGE = "(.*)";$/m.exec(source);
  assert.ok(match, "build-plan.ts must have a line matching the deploy's sed regex exactly");
  assert.equal(match[1], "texlive-basic");
});

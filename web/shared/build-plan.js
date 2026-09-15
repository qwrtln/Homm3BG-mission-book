// Shared module. Ticket 13 of the WASM scenario builder map.
//
// Pure logic, with no DOM and no engine calls, moved out of
// web/prototype-engine-check/probe.js so both the probe and the real app in
// web/app/ import one copy instead of forking it. See map.md's "Two homes
// under web/" note.
//
// The local build this mirrors:
//   tools/_find_scenario.sh rewrites structure.tex to one \include{...},
//   then latexmk -pdflua -jobname=<scenario> main_en.tex
// Here, JavaScript writes structure.tex instead.

/** Path macros declared in metadata.tex lines 116-129. */
export const PATH_MACROS = {
  _assets: "assets",
  art: "assets/art",
  cards: "assets/cards",
  examples: "assets/examples",
  images: "assets/images",
  layout: "assets/layout",
  maps: "assets/maps",
  skills: "assets/skills",
  spells: "assets/spells",
  svgs: "assets/glyphs",
  tables: "assets/tables",
  qr: "assets/qr-codes",
  sections: "sections",
};

/** Files every build needs, whatever the step. */
export const ALWAYS_PRELOAD = [
  "metadata.tex",
  "sections/language_metadata.tex",
  "assets/fonts/LiberationSerif-Regular.ttf",
  "assets/fonts/LiberationSerif-Italic.ttf",
  "assets/fonts/LiberationSerif-Bold.ttf",
  "assets/fonts/LiberationSerif-BoldItalic.ttf",
];

/** Where tools/precompile_glyphs.sh writes the list of glyph basenames. */
export const GLYPH_MANIFEST_PATH = "assets/glyphs-inkscape/manifest.json";

/**
 * TeX Live files the book needs that no BusyTeX data package ships. They sit
 * in web/prototype-engine-check/texmf/, put there by fetch-missing-texmf.sh,
 * and are copied flat into the virtual filesystem, where kpathsea looks
 * first.
 *
 * `nth` is loaded by metadata.tex:31. The ccicons font is pulled in by
 * `doclicense`, which metadata.tex:15 loads for the book's licence notice.
 */
export const CARRIED_TEXMF = [
  "nth.sty",
  "ccicons.sty",
  "ccicons.tfm",
  "ccicons.otf",
  "ccicons.pfb",
  "ccicons.map",
  "ccicons-u.enc",
];

/** The published group files that list the mission book's scenarios. */
export const GROUP_FILES = [
  { path: "coops/main.tex", macro: "coopspath", dir: "coops" },
  { path: "clash/main.tex", macro: "clashpath", dir: "clash" },
  { path: "campaigns/main.tex", macro: "campaignspath", dir: "campaigns" },
];

/**
 * The draft book's own group files, one per category, under
 * draft-scenarios/. Each holds real, independent .tex files: despite an
 * earlier note on this map, draft-scenarios/ does not hold symlinks into the
 * published directories. A draft and a published scenario can even share a
 * filename with different content (the draft is the one still being
 * worked on).
 */
export const DRAFT_GROUP_FILES = [
  { path: "draft-scenarios/coops/main.tex", macro: "coopspath", dir: "draft-scenarios/coops" },
  { path: "draft-scenarios/clash/main.tex", macro: "clashpath", dir: "draft-scenarios/clash" },
  { path: "draft-scenarios/campaigns/main.tex", macro: "campaignspath", dir: "draft-scenarios/campaigns" },
  { path: "draft-scenarios/alliances/main.tex", macro: "alliancespath", dir: "draft-scenarios/alliances" },
];

/** The document class line and language setup, copied from main_en.tex. */
export const MAIN_EN = String.raw`% !TeX program = lualatex
\documentclass[12pt]{article}
\usepackage[T1]{fontenc}
\usepackage[english]{babel}
\def\sections{sections}
\input{metadata.tex}
`;

/**
 * Works out which scenarios a group of main.tex files holds, by reading the
 * same files the local build reads. `tools/_find_scenario.sh` greps for
 * `\addscenariosection{`; the browser has no grep, so this reads the group
 * files instead and follows their \input lines.
 *
 * This is the map's "scenario list source of truth" question, answered
 * without generating a manifest: the book's own files stay the only source.
 * Pass `GROUP_FILES` (the default) for the published mission book, or
 * `DRAFT_GROUP_FILES` for the draft book — the app's picker reads both.
 *
 * @param {{path: string, source: string}[]} groupSources the group's main.tex files
 * @param {{path: string, macro: string, dir: string}[]} [groupFiles] which group table `groupSources` was read from
 * @returns {{path: string, dir: string}[]} scenario paths, in book order
 */
export function parseScenarioIndex(groupSources, groupFiles = GROUP_FILES) {
  const scenarios = [];
  for (const { path, source } of groupSources) {
    const group = groupFiles.find((entry) => entry.path === path);
    if (!group) continue;
    const pattern = new RegExp(`\\\\input\\{\\\\${group.macro}/([^}]+)\\}`, "g");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      scenarios.push({ path: `${group.dir}/${match[1]}`, dir: group.dir });
    }
  }
  return scenarios;
}

/**
 * The heading a scenario gives itself. The third mandatory argument of
 * \addscenariosection is the title; the second is the kind of scenario.
 * Campaign entries pass an optional [subsection] first.
 */
export function scenarioHeading(source) {
  const match = /\\addscenariosection(?:\[[^\]]*\])?\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/.exec(source);
  if (!match) return null;
  const clean = (text) => text.replace(/\$-\$/g, "—").replace(/\\[a-zA-Z]+/g, "").trim();
  return { kind: clean(match[1]), title: clean(match[2]) };
}

/**
 * Reads a source file and returns every repository path it draws a picture
 * from. Handles the \macro/name.ext form that metadata.tex uses everywhere.
 */
export function collectReferencedAssets(source) {
  const found = new Set();
  const pattern = /\\(?:includegraphics|includesvg)\s*(?:\[[^\]]*\])?\{([^}]+)\}/g;
  const braced = /\{\\(\w+)\/([^}]+)\}/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const resolved = resolveMacroPath(match[1]);
    if (resolved) found.add(resolved);
  }
  // \addscenariosection{1}{Clash}{Astral Run}{\images/astral.png} and friends
  // pass picture paths as plain arguments, not through \includegraphics.
  while ((match = braced.exec(source)) !== null) {
    const dir = PATH_MACROS[match[1]];
    if (!dir) continue;
    if (!/\.(png|jpg|jpeg|pdf|svg)$/i.test(match[2])) continue;
    if (/[#\\]/.test(match[2])) continue;
    found.add(`${dir}/${match[2]}`);
  }
  return [...found].sort();
}

export function resolveMacroPath(raw) {
  const trimmed = raw.trim();
  const macro = /^\\(\w+)\/(.+)$/.exec(trimmed);
  if (macro) {
    const dir = PATH_MACROS[macro[1]];
    return dir ? `${dir}/${macro[2]}` : null;
  }
  // Macro bodies hold #1 style parameters and unresolved macro names. Neither
  // is a file, so both are dropped rather than fetched and reported missing.
  if (/[#\\]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The whole plan for building one scenario (or one blank-start template,
 * which is \include{}d exactly the same way — templates/default.tex and
 * templates/campaign.tex are themselves scenario-shaped .tex files, using
 * \addscenariosection, \svg, and \includegraphics like any real scenario).
 * Real glyphs throughout: ticket 04 is done, so there is no glyph stub. This
 * is the app's only path; it does not take a step id.
 *
 * @param {{metadata: string, scenario: {path: string, source: string}, glyphNames: string[]}} sources
 * @returns {{engine: string, input: string, generated: object, repoFiles: string[], carriedTexmf: string[], dataPackage: string, notes: string[]}}
 */
export function planScenarioBuild(sources) {
  const { metadata = "", scenario = null, glyphNames = [] } = sources || {};
  if (!scenario) throw new Error("planScenarioBuild needs a scenario");
  if (!glyphNames.length) throw new Error("planScenarioBuild needs the glyph manifest");
  const assets = collectReferencedAssets(scenario.source);
  const glyphFiles = glyphNames.flatMap((name) => [
    `assets/glyphs/${name}.svg`,
    `assets/glyphs-inkscape/${name}_svg-tex.pdf`,
    `assets/glyphs-inkscape/${name}_svg-tex.pdf_tex`,
  ]);
  return {
    engine: "lualatex",
    input: MAIN_EN,
    generated: {
      "structure.tex": `\\include{${scenario.path}}\n`,
    },
    repoFiles: [
      ...ALWAYS_PRELOAD,
      scenario.path,
      ...collectReferencedAssets(metadata),
      ...assets,
      ...glyphFiles,
    ],
    carriedTexmf: [...CARRIED_TEXMF],
    dataPackage: "texlive-extra",
    notes: [
      `structure.tex holds one \\include, for ${scenario.path}.`,
      `${glyphNames.length} glyphs preloaded from the committed assets/glyphs-inkscape/ cache: ticket 04's answer.`,
      `${assets.length} picture files were found by reading the source.`,
    ],
  };
}

/**
 * Pulls the first real error out of a TeX log. Contributors who fear LaTeX
 * cannot read 4000 lines; they can read one.
 */
export function firstError(log) {
  if (!log) return null;
  const lines = log.split("\n");
  for (const line of lines) {
    if (/^!/.test(line)) return line.trim();
    if (/^.+:\d+: /.test(line)) return line.trim();
  }
  return null;
}

/**
 * The page count, taken from the engine's own log line. Counting "/Type /Page"
 * in the PDF bytes does not work: LuaTeX packs the page objects into compressed
 * object streams, so they are not there to count.
 *
 * The engine's own automatic rerun (ticket 06) writes this line once per
 * pass, not once per build: an early pass, before cross-references settle,
 * can report a page count the final pass then corrects. Only the last
 * occurrence matches the PDF actually returned. Taking the first, as this
 * once did, reported a stale, sometimes too-high count from that first
 * pass, off by one on a real scenario checked directly against this fix.
 */
export function pageCount(log) {
  const matches = [...(log || "").matchAll(/Output written on [^(]*\((\d+) pages?,/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : 0;
}

/**
 * Ticket 11: how many extra compile passes the fetch-on-miss layer allows
 * itself before it gives up and lets the engine's own error stand. The
 * engine wrapper exposes no mid-pass kpathsea hook (BaseTool.compile runs
 * one opaque WASM pass to completion), so a "retry" is a whole extra
 * top-level compile() call with the missing files added to the virtual
 * filesystem. A build can miss more than one file at once (a scenario with
 * two macro-split picture paths), so the cap counts fetch *rounds*, not
 * individual files: each round fetches every path missing from that
 * attempt's log in one batch.
 */
export const MAX_FETCH_ON_MISS_ATTEMPTS = 3;

/**
 * Ticket 11's retry decision. `missing` is one attempt's missingFiles(log)
 * list; `tried` is every path a fetch-on-miss round has already reached for
 * (successfully or not). Returns the paths worth fetching this round: never
 * one already in `tried`.
 *
 * A path repeated across rounds is how a genuine miss is told apart from a
 * fetchable one: the first round always tries, since a pre-resolution gap
 * (ticket 09's indirection case) looks identical to a typo until fetched. If
 * the file exists in the repository, the fetch succeeds, the path lands in
 * the virtual filesystem, and it does not reappear in the next log. If it
 * does not exist, the fetch fails and kpathsea reports the same path again;
 * `newMissingPaths` then returns nothing for it, so the caller stops
 * retrying and the engine's own "File not found" becomes `firstError`, read
 * as-is by a contributor.
 */
export function newMissingPaths(missing, tried) {
  return missing.filter((path) => !tried.has(path));
}

/** Every "File ... not found" the engine reported. */
export function missingFiles(log) {
  if (!log) return [];
  const found = new Set();
  const patterns = [
    /File `([^']+)' not found/g,
    /! LaTeX Error: File `([^']+)' not found/g,
    /Package .* Error: File `([^']+)' not found/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(log)) !== null) found.add(match[1]);
  }
  return [...found].sort();
}

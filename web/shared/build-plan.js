// Shared module. Ticket 13 of the WASM scenario builder map.
//
// Pure logic, with no DOM and no engine calls, imported by the app in
// web/app/.
//
// The local build this mirrors:
//   tools/_find_scenario.sh rewrites structure.tex to one \include{...},
//   then latexmk -pdflua -jobname=<scenario> main_en.tex
// Here, JavaScript writes structure.tex instead.

/** Path macros declared in metadata.tex lines 116-129.
 * @type {Record<string, string>} */
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
 * Glyphs every scenario draws on regardless of its own text: the
 * "Starting Resources" / "Starting Income" / "Starting Units" block
 * metadata.tex generates for every scenario alike uses these directly.
 * Preloaded once, eagerly, as soon as the page opens, alongside the engine
 * warm-up — never per scenario.
 */
export const CORE_GLYPHS = ["gold", "building_materials", "valuables", "bronze", "silver", "golden", "azure"];

/** The three files one glyph's \svg call needs: the source .svg (kept for
 * completeness, though \svg itself only ever reads the precompiled pair)
 * and the precompiled PDF/pdf_tex pair ticket 04 built to skip Inkscape.
 *
 * @param {readonly string[]} names glyph basenames, without extension
 * @returns {string[]} repository paths, three per glyph
 */
export function glyphFilesFor(names) {
  return names.flatMap((name) => [
    `assets/glyphs/${name}.svg`,
    `assets/glyphs-inkscape/${name}_svg-tex.pdf`,
    `assets/glyphs-inkscape/${name}_svg-tex.pdf_tex`,
  ]);
}

/**
 * Every glyph name a source's own \svg{...} calls literally name. Ticket 05
 * found this cannot be complete in general: a name built from a macro or
 * chosen by a LaTeX conditional is invisible to a regex. That is fine here,
 * because it is not this function's job to be complete — a genuine miss
 * still falls through to ticket 11's fetch-on-miss retry at compile time.
 * This exists only to preload the common case ahead of that.
 *
 * @param {string} source one .tex file's text
 * @returns {string[]} glyph basenames, sorted, without duplicates
 */
export function collectReferencedGlyphs(source) {
  const found = new Set();
  const pattern = /\\svg\s*(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let match;
  while ((match = pattern.exec(source)) !== null) found.add(match[1].trim());
  return [...found].sort();
}

/**
 * The BusyTeX data package the engine preloads. texlive-basic (88 MB), not
 * texlive-extra (326 MB): the book reads about 160 files only texlive-extra
 * ships, and the app carries those itself in CARRIED_TEXMF_BUNDLE.
 */
export const DATA_PACKAGE = "texlive-basic";

/**
 * The TeX Live files the book needs that DATA_PACKAGE lacks, in one gzipped
 * bundle under web/shared/texmf/, built by carry-texmf.mjs from carried.txt
 * (which records why each file is carried). The build copies them flat into
 * the virtual filesystem, where kpathsea looks first.
 */
export const CARRIED_TEXMF_BUNDLE = "carried-texmf.bin";

/**
 * One category's index file: where it lives, the path macro its \input lines
 * use, and the directory its scenarios sit in.
 *
 * @typedef {{path: string, macro: string, dir: string}} GroupFile
 */

/** The published group files that list the mission book's scenarios.
 * @type {GroupFile[]} */
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
 *
 * @type {GroupFile[]}
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
 * @param {GroupFile[]} [groupFiles] which group table `groupSources` was read from
 * @returns {{path: string, dir: string}[]} scenario paths, in book order
 */
export function parseScenarioIndex(groupSources, groupFiles = GROUP_FILES) {
  /** @type {{path: string, dir: string}[]} */
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
 *
 * @param {string} source one .tex file's text
 * @returns {{kind: string, title: string} | null} null when it declares none
 */
export function scenarioHeading(source) {
  const match = /\\addscenariosection(?:\[[^\]]*\])?\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/.exec(source);
  if (!match) return null;
  /** @param {string} text */
  const clean = (text) =>
    text
      .replace(/\$-\$/g, "—")
      .replace(/\\[a-zA-Z]+/g, "")
      .trim();
  return { kind: clean(match[1]), title: clean(match[2]) };
}

/**
 * Puts a contributor's own name into the title slot of \addscenariosection,
 * leaving everything else (kind, [subsection], picture) as it was.
 *
 * @param {string} source one .tex file's text
 * @param {string} title plain text; the picker already limits it to letters,
 *   digits, spaces, hyphens and apostrophes
 * @returns {string} the source unchanged when it declares no heading
 */
export function withScenarioTitle(source, title) {
  return source.replace(
    /(\\addscenariosection(?:\[[^\]]*\])?\{[^}]*\}\{[^}]*\}\{)[^}]*(\})/,
    (_, head, tail) => `${head}${title}${tail}`,
  );
}

/**
 * Reads a source file and returns every repository path it draws a picture
 * from. Handles the \macro/name.ext form that metadata.tex uses everywhere.
 *
 * @param {string} source one .tex file's text
 * @returns {string[]} repository paths, sorted, without duplicates
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

/**
 * Turns one \macro/name.ext argument into a repository path.
 *
 * @param {string} raw the literal argument text
 * @returns {string | null} null when it is not a file path at all
 */
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
 * @typedef {object} BuildPlan
 * @property {string} engine the TeX engine the plan compiles with
 * @property {string} input the root document's source
 * @property {Record<string, string>} generated files written by JavaScript, by path
 * @property {string[]} repoFiles repository paths to stage before compiling
 * @property {string} carriedBundle the bundle under web/shared/texmf/ of
 *   TeX Live files dataPackage lacks
 * @property {string} dataPackage the BusyTeX data package to preload
 * @property {string[]} notes human-readable account of what the plan staged
 */

/**
 * @param {{metadata?: string, scenario: {path: string, source: string}}} sources
 * @returns {BuildPlan}
 */
export function planScenarioBuild(sources) {
  const { metadata = "", scenario = null } = sources || {};
  if (!scenario) throw new Error("planScenarioBuild needs a scenario");
  const assets = collectReferencedAssets(scenario.source);
  // CORE_GLYPHS always, whatever this scenario's own \svg calls name: they
  // are already sitting in the shared cache from page load regardless, so
  // asking for them again here costs nothing. Anything beyond that is
  // this scenario's own, found by scanning its actual \svg calls.
  const glyphNames = [...new Set([...CORE_GLYPHS, ...collectReferencedGlyphs(scenario.source)])];
  const glyphFiles = glyphFilesFor(glyphNames);
  return {
    engine: "lualatex",
    input: MAIN_EN,
    generated: {
      "structure.tex": `\\include{${scenario.path}}\n`,
    },
    repoFiles: [...ALWAYS_PRELOAD, scenario.path, ...collectReferencedAssets(metadata), ...assets, ...glyphFiles],
    carriedBundle: CARRIED_TEXMF_BUNDLE,
    dataPackage: DATA_PACKAGE,
    notes: [
      `structure.tex holds one \\include, for ${scenario.path}.`,
      `${glyphNames.length} glyphs staged (${CORE_GLYPHS.length} core, always; the rest found by scanning \\svg calls in the source), from the committed assets/glyphs-inkscape/ cache: ticket 04's answer.`,
      `${assets.length} picture files were found by reading the source.`,
    ],
  };
}

/**
 * Pulls the first real error out of a TeX log. Contributors who fear LaTeX
 * cannot read 4000 lines; they can read one.
 *
 * @param {string | null | undefined} log
 * @returns {string | null} null when the log holds no error line
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

// TeX breaks every log line at max_print_line (79 by default), file paths
// included, so a line exactly this long continues on the next one.
const LOG_LINE_WIDTH = 79;

/**
 * The files TeX had open at the end of `lines`, innermost last, read from
 * the log's parentheses: "(./clash/x.tex" opens one, ")" closes it. Prose in
 * parentheses opens and closes a non-path entry, which never matters.
 *
 * @param {string[]} lines the log up to, not including, the error line
 * @returns {string[]}
 */
function openFiles(lines) {
  let text = "";
  for (const line of lines) text += line.length === LOG_LINE_WIDTH ? line : `${line}\n`;
  /** @type {string[]} */
  const stack = [];
  const re = /\(([^()\s]*)|\)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[0] === ")") stack.pop();
    else stack.push(m[1]);
  }
  return stack;
}

/**
 * The scenario line behind the log's first error, the one firstError shows,
 * so the panel can jump to it. Null unless TeX was reading the scenario
 * itself: an error in the book's shared files names a line the user cannot
 * edit here.
 *
 * @param {string | null | undefined} log
 * @param {string} scenarioPath repository path of the scenario, e.g. "clash/x.tex"
 * @param {number} lineCount lines in the editor; a line past the end is no line
 * @returns {number | null} a 1-based line number, or null
 */
export function errorLine(log, scenarioPath, lineCount) {
  if (!log) return null;
  const lines = log.split("\n");
  const index = lines.findIndex((line) => /^!/.test(line) || /^.+:\d+: /.test(line));
  if (index < 0) return null;
  const bare = (/** @type {string} */ path) => path.replace(/^\.\//, "");
  const target = bare(scenarioPath);

  let file = null;
  let line = null;
  const located = /^(.+):(\d+): /.exec(lines[index]);
  if (located) {
    file = located[1];
    line = Number(located[2]);
  } else {
    file = openFiles(lines.slice(0, index)).at(-1) ?? null;
    for (const next of lines.slice(index + 1)) {
      if (/^!/.test(next)) break;
      const at = /^l\.(\d+)(?: |$)/.exec(next);
      if (at) {
        line = Number(at[1]);
        break;
      }
    }
  }
  if (file === null || line === null || bare(file) !== target) return null;
  return line >= 1 && line <= lineCount ? line : null;
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
 *
 * @param {string | null | undefined} log
 * @returns {number} 0 when the log reports no page count
 */
export function pageCount(log) {
  const matches = [...(log || "").matchAll(/Output written on [^(]*\((\d+) pages?,/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : 0;
}

/**
 * The status line after a successful build.
 *
 * @param {number} pages
 * @param {number} seconds
 * @returns {string}
 */
export function builtStatus(pages, seconds) {
  return `Built ${pages} ${pages === 1 ? "page" : "pages"} in ${seconds}s.`;
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
 *
 * @param {string[]} missing one attempt's missingFiles(log) list
 * @param {ReadonlySet<string>} tried every path already reached for
 * @returns {string[]} the paths worth fetching this round
 */
export function newMissingPaths(missing, tried) {
  return missing.filter((path) => !tried.has(path));
}

/**
 * Every "File ... not found" the engine reported.
 *
 * @param {string | null | undefined} log
 * @returns {string[]} the missing paths, sorted, without duplicates
 */
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

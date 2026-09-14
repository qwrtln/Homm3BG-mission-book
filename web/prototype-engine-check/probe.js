// PROTOTYPE — throwaway. Ticket 01 of the WASM scenario builder map.
//
// The pure, no-DOM, no-engine-call logic this file used to define directly
// now lives in web/shared/build-plan.js, so the probe and the real app in
// web/app/ import one copy instead of forking it (ticket 13). What stays
// here is walkthrough-shaped and probe-only: the named STEPS ladder,
// planBuild's per-step dispatch (including the glyph-stubbed "scenario"
// step ticket 04 has since superseded, kept for the walkthrough), the
// reducer, and initialState.
//
// The local build this mirrors:
//   tools/_find_scenario.sh rewrites structure.tex to one \include{...},
//   then latexmk -pdflua -jobname=<scenario> main_en.tex
// Here, JavaScript writes structure.tex instead.

import {
  PATH_MACROS,
  ALWAYS_PRELOAD,
  GLYPH_MANIFEST_PATH,
  CARRIED_TEXMF,
  GROUP_FILES,
  MAIN_EN,
  parseScenarioIndex,
  scenarioHeading,
  collectReferencedAssets,
  resolveMacroPath,
  planScenarioBuild,
  firstError,
  pageCount,
  missingFiles,
  newMissingPaths,
  MAX_FETCH_ON_MISS_ATTEMPTS,
} from "../shared/build-plan.js";

// Re-exported so index.html and capture-pdf.mjs can keep importing every one
// of these names from probe.js, unchanged, even though the definitions now
// live in the shared module.
export {
  PATH_MACROS,
  ALWAYS_PRELOAD,
  GLYPH_MANIFEST_PATH,
  CARRIED_TEXMF,
  GROUP_FILES,
  parseScenarioIndex,
  scenarioHeading,
  collectReferencedAssets,
  resolveMacroPath,
  firstError,
  pageCount,
  missingFiles,
  newMissingPaths,
  MAX_FETCH_ON_MISS_ATTEMPTS,
};

/**
 * The three steps of the ladder the ticket asks for, smallest first.
 * `id` is stable; the page renders `label` and `watchFor`.
 */
export const STEPS = [
  {
    id: "trivial",
    label: "Step 1 — a trivial document",
    watchFor:
      "Does any document at all come out of the engine in this tab, with no server doing the work?",
  },
  {
    id: "preamble",
    label: "Step 2 — the book's whole preamble",
    watchFor:
      "metadata.tex loads about 40 packages, tikz and tcolorbox among them. Does every package load?",
  },
  {
    id: "scenario",
    label: "Step 3 — one real scenario",
    watchFor:
      "A whole scenario page, with its maps and its fonts. Glyphs are stubbed: see the note on the page.",
  },
  {
    id: "scenario-svg",
    label: "Step 4 — the same scenario, with real glyphs",
    watchFor:
      "Ticket 04: does \\svg's real \\includesvg call compile with no shell-escape, from the precompiled assets/glyphs-inkscape/ cache?",
  },
];

/**
 * Step 3 replaces \svg with a ruled box.
 *
 * Every one of the book's 22 scenarios calls \svg, and \svg calls \includesvg,
 * which needs Inkscape through shell-escape. No browser engine runs Inkscape.
 * Ticket 04 owns that problem. This stub keeps ticket 01 about the engine.
 */
export const SVG_STUB = String.raw`\renewcommand{\svg}[2][10]{\raisebox{-0.15\height}{\framebox[#1px]{\rule{0pt}{#1px}}}}
`;

/**
 * The whole plan for one build: what the engine compiles, what lands in the
 * virtual filesystem, and which data package pays for it.
 *
 * @param {string} stepId one of STEPS[].id
 * @param {{metadata?: string, scenario?: {path: string, source: string}}} [sources]
 *        `metadata` is the text of metadata.tex, needed from step 2 on:
 *        the preamble draws page backgrounds, so it pulls in pictures of its own.
 * @returns {{engine: string, input: string, generated: object, repoFiles: string[], dataPackage: string, notes: string[]}}
 */
export function planBuild(stepId, sources = {}) {
  const { metadata = "", scenario = null } = sources;
  if (stepId === "trivial") {
    return {
      engine: "lualatex",
      input: String.raw`\documentclass{article}
\begin{document}
This document was typeset inside the browser tab.
\end{document}
`,
      generated: {},
      repoFiles: [],
      dataPackage: "texlive-extra",
      notes: ["Nothing from the repository is needed."],
    };
  }

  if (stepId === "preamble") {
    return {
      engine: "lualatex",
      input: MAIN_EN,
      generated: {
        "structure.tex": String.raw`\section*{Preamble check}
Every package in metadata.tex loaded.
`,
      },
      repoFiles: [...ALWAYS_PRELOAD, ...collectReferencedAssets(metadata)],
      carriedTexmf: [...CARRIED_TEXMF],
      dataPackage: "texlive-extra",
      notes: [
        "structure.tex is written by JavaScript, exactly where tools/_find_scenario.sh writes it locally.",
        "nth.sty and the ccicons font are carried by the app: no BusyTeX data package ships them.",
        "The preamble draws a page background, so it needs pictures even with an empty body. They are found by reading metadata.tex, not by a hardcoded list.",
      ],
    };
  }

  if (stepId === "scenario") {
    if (!scenario) throw new Error("step 3 needs a scenario");
    const assets = collectReferencedAssets(scenario.source);
    return {
      engine: "lualatex",
      input: MAIN_EN,
      generated: {
        "structure.tex": `${SVG_STUB}\\include{${scenario.path}}\n`,
      },
      repoFiles: [
        ...ALWAYS_PRELOAD,
        scenario.path,
        ...collectReferencedAssets(metadata),
        ...assets,
      ],
      carriedTexmf: [...CARRIED_TEXMF],
      dataPackage: "texlive-extra",
      notes: [
        `structure.tex holds one \\include, for ${scenario.path}.`,
        "\\svg is stubbed to a box. Ticket 04 owns the real glyphs.",
        `${assets.length} picture files were found by reading the scenario source.`,
      ],
    };
  }

  if (stepId === "scenario-svg") {
    // No stub here: \svg keeps calling \includesvg for real. Ticket 04's
    // answer is that this works with no shell-escape, because
    // assets/glyphs-inkscape/ already carries a PDF + .pdf_tex pair for
    // every glyph, and the svg package's freshness check finds that pair
    // no older than its source SVG and skips calling Inkscape.
    //
    // This is exactly the app's one path (ticket 13), so it is lifted
    // straight from the shared module rather than kept as a second copy.
    return planScenarioBuild(sources);
  }

  if (stepId === "tikz") {
    return {
      engine: "lualatex",
      input: String.raw`\documentclass{article}
\usepackage{tikz}
\usetikzlibrary{shadows, shadows.blur, patterns, calc, backgrounds, arrows.meta, babel}
\usepackage[most]{tcolorbox}
\begin{document}
\begin{tikzpicture}
  \fill[blur shadow] (0,0) rectangle (3,1);
  \draw[arrows={-Stealth}] (0,0) -- (3,1);
\end{tikzpicture}
\begin{tcolorbox}[enhanced]A tcolorbox.\end{tcolorbox}
\end{document}
`,
      generated: {},
      repoFiles: [],
      dataPackage: "texlive-extra",
      notes: [
        "tikz is the package the research expected to be missing, because no data package lists collection-pictures. It is present anyway, pulled in as a dependency.",
        "It loads the same six libraries metadata.tex:107 loads. One of them, shadows.blur, is not part of pgf: it comes from the separate pgf-blur package, which only texlive-extra carries.",
      ],
    };
  }

  if (stepId === "fonts") {
    return {
      engine: "lualatex",
      input: String.raw`\documentclass{article}
\usepackage{fontspec}
\newfontfamily{\liberation}[
  Path = ./assets/fonts/,
  Extension = .ttf,
  UprightFont = *-Regular,
  ItalicFont = *-Italic,
  BoldFont = *-Bold,
  BoldItalicFont = *-BoldItalic,
]{LiberationSerif}
\begin{document}
{\liberation Upright. \textit{Italic.} \textbf{Bold.} \textbf{\textit{Bold italic.}}}
\end{document}
`,
      generated: {},
      repoFiles: ALWAYS_PRELOAD.filter((path) => path.startsWith("assets/fonts/")),
      dataPackage: "texlive-extra",
      notes: [
        "The four Liberation faces load from the virtual filesystem by path, as metadata.tex:216 loads them.",
        "This is ticket 03's question, asked early because a failure here forces the XeTeX fallback.",
      ],
    };
  }

  throw new Error(`unknown step: ${stepId}`);
}

/** The initial state of the probe. */
export function initialState() {
  return {
    engineReady: false,
    engineLoading: false,
    step: null,
    running: false,
    results: {}, // stepId -> {ok, pages, bytes, seconds, missing[], firstError}
    log: [],
  };
}

/** Pure reducer. The page dispatches; nothing flows the other way. */
export function reduce(state, action) {
  switch (action.type) {
    case "ENGINE_LOADING":
      return { ...state, engineLoading: true };
    case "ENGINE_READY":
      return { ...state, engineLoading: false, engineReady: true };
    case "BUILD_STARTED":
      return { ...state, running: true, step: action.stepId };
    case "BUILD_FINISHED":
      return {
        ...state,
        running: false,
        results: { ...state.results, [action.stepId]: action.result },
      };
    case "LOG":
      return { ...state, log: [...state.log, action.line] };
    case "RESET":
      return initialState();
    default:
      return state;
  }
}

// Turns the start wizard's answers into a scenario's .tex source, filled into
// templates/wizard.tex. Every LaTeX rule the wizard needs lives here, free of
// the DOM, so the wizard's panes only collect plain answers and a template
// edit that moves a placeholder fails a tier 1 test instead of a build.

import { withScenarioTitle } from "./build-plan.js";
import { DRAFT_CATEGORIES, withScenarioKind } from "./scenario-name.js";

/**
 * One value per resource. null means the contributor left it unset.
 *
 * @typedef {object} ResourceValues
 * @property {number | null} gold
 * @property {number | null} building_materials
 * @property {number | null} valuables
 */

/**
 * @typedef {object} TilePool
 * @property {number} far random Far (II--III) Map Tiles each player takes
 * @property {number} near random Near (IV--V) Map Tiles each player takes
 */

/**
 * A Map Setup count: a fixed number of Map Tiles, or a multiple of the player
 * count. `{perPlayer: 1}` writes $P$, `{perPlayer: 2}` writes $2P$, up to
 * MAX_PER_PLAYER.
 *
 * @typedef {number | {perPlayer: number}} TileCount
 */

/**
 * @typedef {object} MapSetup
 * @property {TileCount} starting Starting (I) Map Tiles
 * @property {TileCount} far Far (II--III) Map Tiles
 * @property {TileCount} near Near (IV--V) Map Tiles
 * @property {TileCount} center Center (VI--VII) Map Tiles
 */

/**
 * One map image, and the player counts its layout is for. No counts means
 * the layout serves every player count.
 *
 * @typedef {object} MapImage
 * @property {string} path repository path under assets/maps/
 * @property {number[]} counts
 */

/**
 * @typedef {object} TimedEvent
 * @property {number} round the Round the events happen in
 * @property {string} text one event per line
 */

/**
 * Everything the wizard asked. An absent field means its pane was skipped,
 * and that part of the template stays as it is. The one exception is the Map
 * Tile Pool: a skipped pane drops its line, as No does.
 *
 * @typedef {object} WizardAnswers
 * @property {string} name the scenario's title, already valid per validateScenarioName
 * @property {string} category one of WIZARD_CATEGORIES
 * @property {string} [author]
 * @property {string} [headerImage] repository path under assets/images/
 * @property {string} [lore] flavor text; line breaks collapse to spaces
 * @property {number} [rounds] Scenario Length
 * @property {number[]} [playerCounts]
 * @property {ResourceValues} [income]
 * @property {ResourceValues} [resources]
 * @property {string} [startingUnits] one Unit line per text line; LaTeX commands kept
 * @property {string[]} [buildings] keys of BUILDINGS
 * @property {TilePool | false | null} [tilePool] absent, null or false: no Map Tile Pool line
 * @property {MapSetup} [mapSetup] a per-player count writes $kP$ and explains P in the intro line
 * @property {string} [victory]
 * @property {string} [defeat]
 * @property {TimedEvent[]} [timedEvents]
 * @property {string[]} [rules] one Additional Rule each; LaTeX commands kept
 * @property {MapImage[]} [maps] one captioned block each, in order
 */

/**
 * The wizard's own template: templates/default.tex without its commented
 * guidance, so a generated file holds only what the wizard asked about.
 *
 * @type {string}
 */
export const WIZARD_TEMPLATE_PATH = "templates/wizard.tex";

/**
 * The categories the wizard offers. A campaign's template differs, so
 * campaign authors start from the blank template or a copy.
 *
 * @type {readonly string[]}
 */
export const WIZARD_CATEGORIES = Object.freeze(DRAFT_CATEGORIES.filter((category) => category !== "campaigns"));

/** The largest multiple of the player count a Map Setup count can be. */
export const MAX_PER_PLAYER = 6;

/**
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @returns {readonly number[]}
 */
function track(from, to, step) {
  /** @type {number[]} */
  const values = [];
  for (let n = from; n <= to; n += step) values.push(n);
  return Object.freeze(values);
}

/**
 * The values the board's income track holds, per resource.
 *
 * @type {Readonly<Record<"gold" | "building_materials" | "valuables", readonly number[]>>}
 */
export const INCOME_TRACK = Object.freeze({
  gold: track(10, 45, 5),
  building_materials: track(0, 14, 2),
  valuables: track(0, 7, 1),
});

/**
 * @typedef {object} Building
 * @property {string} key what WizardAnswers.buildings holds
 * @property {string} label the name the wizard shows
 * @property {string} glyph the assets/glyphs basename the wizard shows
 * @property {string | null} darkGlyph the glyph's -yellow variant for the dark theme, or null when it has none
 * @property {string} output what Town Buildings writes
 */

/**
 * The Town Buildings the wizard offers, in the order the line writes them.
 * Only a Dwelling or a faction building carries its glyph in the book, joined
 * to its name by a hard space so a line break never parts them. A Dwelling
 * star keeps \svg's default 10 points; a faction building glyph is drawn at 12.
 *
 * @type {readonly Building[]}
 */
export const BUILDINGS = Object.freeze(
  /** @type {Building[]} */ ([
    {
      key: "bronze",
      label: "Bronze Dwelling",
      glyph: "bronze",
      darkGlyph: null,
      output: String.raw`\svg{bronze}~Dwelling`,
    },
    {
      key: "silver",
      label: "Silver Dwelling",
      glyph: "silver",
      darkGlyph: null,
      output: String.raw`\svg{silver}~Dwelling`,
    },
    {
      key: "golden",
      label: "Golden Dwelling",
      glyph: "golden",
      darkGlyph: null,
      output: String.raw`\svg{golden}~Dwelling`,
    },
    {
      key: "city_hall",
      label: "City Hall",
      glyph: "building_city_hall",
      darkGlyph: "building_city_hall-yellow",
      output: "City Hall",
    },
    {
      key: "citadel",
      label: "Citadel",
      glyph: "building_citadel",
      darkGlyph: "building_citadel-yellow",
      output: "Citadel",
    },
    {
      key: "mage_guild",
      label: "Mage Guild",
      glyph: "building_mage_guild",
      darkGlyph: "building_mage_guild-yellow",
      output: "Mage Guild",
    },
    {
      key: "building_special_tent",
      label: "Faction-specific Building",
      glyph: "building_special_tent",
      darkGlyph: "building_special_tent-yellow",
      output: String.raw`\svg[12]{building_special_tent}~Building`,
    },
    {
      key: "building_special_gears",
      label: "Faction-specific Building",
      glyph: "building_special_gears",
      darkGlyph: "building_special_gears-yellow",
      output: String.raw`\svg[12]{building_special_gears}~Building`,
    },
  ]).map((building) => Object.freeze(building)),
);

/** Thrown when the template no longer holds a placeholder the answers need. */
export class TemplateAnchorError extends Error {
  /**
   * @param {string} field the answer that needed the anchor
   * @param {string} anchor the text looked for
   */
  constructor(field, anchor) {
    super(`The template has no placeholder for "${field}": expected ${JSON.stringify(anchor)}.`);
    this.name = "TemplateAnchorError";
    this.field = field;
    this.anchor = anchor;
  }
}

// --- escaping -----------------------------------------------------------------

/**
 * What full mode writes for each character LaTeX treats as special.
 *
 * @type {Record<string, string>}
 */
const FULL_ESCAPES = {
  "\\": String.raw`\textbackslash{}`,
  "{": String.raw`\{`,
  "}": String.raw`\}`,
  "&": String.raw`\&`,
  "%": String.raw`\%`,
  "#": String.raw`\#`,
  $: String.raw`\$`,
  _: String.raw`\_`,
  "~": String.raw`\textasciitilde{}`,
  "^": String.raw`\textasciicircum{}`,
};

/** The characters keep-commands mode escapes outside a command. */
const KEEP_ESCAPED = new Set(["&", "%", "#", "$", "_", "^"]);

/**
 * The TeX quote a straight double quote stands for: opening at the start or
 * after a space or an opening bracket, closing otherwise.
 *
 * @param {string} previous the character before it, "" at the start
 * @returns {string}
 */
function texQuote(previous) {
  return previous === "" || /[\s([{]/.test(previous) ? "``" : "''";
}

/**
 * The index just past the group opening at `start`, or -1 when it never
 * closes. Braces nest, and a backslashed character never counts.
 *
 * @param {string} text
 * @param {number} start index of the opening "[" or "{"
 * @returns {number}
 */
function groupEnd(text, start) {
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Makes plain text safe to place in a .tex file.
 *
 * Full mode escapes every LaTeX special character, for fields that hold prose
 * only. Keep-commands mode passes a backslash command through verbatim,
 * together with the `[…]` and `{…}` groups directly after it, so
 * `\svg{building_materials}` survives; it escapes `& % # $ _ ^` elsewhere.
 * Both modes turn straight double quotes into ``…'' pairs and keep Unicode
 * dashes and apostrophes as typed.
 *
 * @param {string} text what the contributor typed
 * @param {"full" | "keep-commands"} mode
 * @returns {string}
 */
export function escapeLatex(text, mode) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const previous = i > 0 ? text[i - 1] : "";
    if (ch === '"') {
      out += texQuote(previous);
      i++;
      continue;
    }
    if (mode === "full") {
      out += FULL_ESCAPES[ch] ?? ch;
      i++;
      continue;
    }
    if (ch === "\\") {
      const command = /^\\(?:[A-Za-z]+|[^A-Za-z])/.exec(text.slice(i));
      if (!command) {
        out += FULL_ESCAPES["\\"];
        i++;
        continue;
      }
      let end = i + command[0].length;
      while (end < text.length && (text[end] === "[" || text[end] === "{")) {
        const next = groupEnd(text, end);
        if (next < 0) break;
        end = next;
      }
      out += text.slice(i, end);
      i = end;
      continue;
    }
    out += KEEP_ESCAPED.has(ch) ? `\\${ch}` : ch;
    i++;
  }
  return out;
}

// --- formatting ---------------------------------------------------------------

/**
 * The Player Count line's value: "2", "2--4", "2 or 3", "1, 2 or 4".
 * Duplicates are dropped; a run of three or more counts becomes a range.
 *
 * @param {number[]} counts
 * @returns {string} "" for no counts
 */
export function formatPlayerCount(counts) {
  const sorted = [...new Set(counts)].sort((a, b) => a - b);
  /** @type {string[]} */
  const items = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    if (end - start >= 2) items.push(`${sorted[start]}--${sorted[end]}`);
    else for (let k = start; k <= end; k++) items.push(`${sorted[k]}`);
    start = end + 1;
  }
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * @param {string} text
 * @returns {string[]} the trimmed lines that hold anything
 */
function nonEmptyLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Paragraphs stay apart; the lines inside one join with a space.
 *
 * @param {string} text
 * @returns {string[]} one string per paragraph
 */
function paragraphs(text) {
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => nonEmptyLines(paragraph).join(" "))
    .filter(Boolean);
}

/**
 * @param {string} text
 * @param {"full" | "keep-commands"} mode
 * @returns {string} escaped paragraphs separated by a blank line
 */
function prose(text, mode) {
  return paragraphs(text)
    .map((paragraph) => escapeLatex(paragraph, mode))
    .join("\n\n");
}

/**
 * @param {TileCount} count
 * @param {string} type e.g. "Far (II--III)"
 * @returns {string} "1 × Far (II--III) Map Tile", "2 × … Map Tiles", "$2P$ × … Map Tiles"
 */
function tiles(count, type) {
  if (typeof count === "object") {
    return `$${count.perPlayer === 1 ? "" : count.perPlayer}P$ × ${type} Map Tiles`;
  }
  return `${count} × ${type} Map Tile${count === 1 ? "" : "s"}`;
}

/**
 * @param {TileCount} count
 * @returns {boolean} whether the count asks for any Map Tile
 */
function usesTiles(count) {
  return typeof count === "object" ? count.perPlayer > 0 : count > 0;
}

/**
 * The caption under a map image, as the book writes it: one layout for the
 * whole Scenario, or the player counts a layout is for.
 *
 * @param {number[]} counts
 * @returns {string} e.g. "\textbf{SCENARIO MAP LAYOUT}", "\textbf{2/4-PLAYER SCENARIO}"
 */
export function mapCaption(counts) {
  const sorted = [...new Set(counts)].sort((a, b) => a - b);
  return sorted.length
    ? String.raw`\textbf{${sorted.join("/")}-PLAYER SCENARIO}`
    : String.raw`\textbf{SCENARIO MAP LAYOUT}`;
}

/**
 * @param {ResourceValues | undefined} values
 * @returns {boolean} whether the contributor set any of the three
 */
function anySet(values) {
  return values !== undefined && Object.values(values).some((value) => typeof value === "number");
}

/**
 * @param {ResourceValues} values
 * @param {ResourceValues} unset what an unset value writes
 * @param {boolean} [skipZero] leave a 0 out, as Starting Resources do; the
 *   line reads None when every value is 0. Income keeps its 0s: each is a
 *   position on its track.
 * @returns {string}
 */
function resourceLine(values, unset, skipZero = false) {
  /** @type {("gold" | "building_materials" | "valuables")[]} */
  const keys = ["gold", "building_materials", "valuables"];
  const parts = keys
    .map((key) => ({ key, value: typeof values[key] === "number" ? values[key] : unset[key] }))
    .filter(({ value }) => !skipZero || value !== 0)
    .map(({ key, value }) => String.raw`${value} \svg{${key}}`);
  return parts.length ? parts.join(", ") : "None";
}

/**
 * @param {string} path a repository path
 * @param {string} dir the directory the path macro stands for
 * @param {string} macro e.g. "images"
 * @returns {string} e.g. "\images/foo.png"
 */
function macroPath(path, dir, macro) {
  if (!path.startsWith(`${dir}/`)) throw new Error(`"${path}" is not under ${dir}/.`);
  return `\\${macro}/${path.slice(dir.length + 1)}`;
}

// --- the template's placeholders ----------------------------------------------

const ANCHORS = {
  author: String.raw`\textbf{Author:} ...`,
  lore: String.raw`\textit{... 1--2 two paragraphs to set the story ...}`,
  rounds: "... Rounds",
  playerCounts: String.raw`\textbf{Player Count:} ...`,
  resources: String.raw`\textbf{Starting Resources:} X \svg{gold}, Y \svg{building_materials}, Z \svg{valuables}`,
  income: String.raw`\textbf{Starting Income:} A \svg{gold}, B \svg{building_materials}, C \svg{valuables}`,
  startingUnits: [
    String.raw`\textbf{Starting Units:}`,
    String.raw`\begin{itemize}`,
    String.raw`  \item A Few \svg{bronze}...`,
    String.raw`  \item A Pack \svg{silver}...`,
    String.raw`  \item \svg{golden}`,
    String.raw`  \item \svg{azure}`,
    String.raw`\end{itemize}`,
  ].join("\n"),
  buildings: String.raw`\textbf{Town Buildings:} \svg{bronze} Dwelling...`,
  tilePool: String.raw`\textbf{Map Tile Pool:} Each player takes X [random] Near/Far Map (A--B) Tiles...`,
  mapSetup: [
    "Take the following Map Tiles and arrange them as shown in the Scenario map layout:",
    String.raw`\begin{itemize}`,
    String.raw`  \item W × Starting (I) Map Tile`,
    String.raw`  \item X × Far (II--III) Map Tile`,
    String.raw`  \item Y × Near (IV--V) Map Tile`,
    String.raw`  \item Z × Center (VI--VII) Map Tile`,
    String.raw`\end{itemize}`,
  ].join("\n"),
  victory: [String.raw`\subsection*{\MakeUppercase{Victory Conditions}}`, "..."].join("\n"),
  defeat: [String.raw`\subsection*{\MakeUppercase{Defeat Conditions}}`, "..."].join("\n"),
  timedEvents: [
    String.raw`\textbf{\nth{2} Round:}`,
    String.raw`\begin{itemize}`,
    String.raw`  \item ...`,
    String.raw`  \item ...`,
    String.raw`\end{itemize}`,
  ].join("\n"),
  rules: [
    String.raw`\subsection*{\MakeUppercase{Additional Rules}}`,
    "",
    String.raw`\begin{itemize}`,
    String.raw`    \item ...`,
    String.raw`\end{itemize}`,
  ].join("\n"),
  maps: [
    "% Uncomment and link a map image",
    String.raw`% \vspace{3em}`,
    String.raw`% \begin{center}`,
    String.raw`%   \includegraphics[width=0.6\paperwidth]{\_assets/maps/your_map.png}`,
    String.raw`% \end{center}`,
  ].join("\n"),
};

/** The heading, up to the opening brace of its picture argument. */
const HEADING_IMAGE = /(\\addscenariosection(?:\[[^\]]*\])?\{[^}]*\}\{[^}]*\}\{[^}]*\}\{)[^}]*(\})/;

/**
 * Replaces the first occurrence of `anchor`. Plain slicing, so a `$` in the
 * replacement is never read as a pattern.
 *
 * @param {string} text
 * @param {string} field
 * @param {string} anchor
 * @param {string} replacement
 * @returns {string}
 */
function replaceAnchor(text, field, anchor, replacement) {
  const at = text.indexOf(anchor);
  if (at < 0) throw new TemplateAnchorError(field, anchor);
  return text.slice(0, at) + replacement + text.slice(at + anchor.length);
}

/**
 * @param {string[]} lines
 * @param {string} indent
 * @returns {string} an itemize block, one \item per line
 */
function itemize(lines, indent) {
  return [
    String.raw`\begin{itemize}`,
    ...lines.map((line) => `${indent}\\item ${line}`),
    String.raw`\end{itemize}`,
  ].join("\n");
}

/**
 * Fills templates/wizard.tex with the wizard's answers. Each answered field
 * replaces its placeholder; a skipped one leaves the template text exactly as
 * it was. The title and the category's kind are always set.
 *
 * @param {string} template the text of templates/wizard.tex
 * @param {WizardAnswers} answers
 * @returns {string} the scenario's .tex source
 * @throws {TemplateAnchorError} when a placeholder an answer needs is missing
 */
export function fillScenarioTemplate(template, answers) {
  if (!WIZARD_CATEGORIES.includes(answers.category)) {
    throw new Error(`The wizard cannot start a scenario in "${answers.category}".`);
  }
  if (!HEADING_IMAGE.test(template)) throw new TemplateAnchorError("name", String.raw`\addscenariosection{…}{…}{…}{…}`);

  let text = template;
  /**
   * @param {keyof typeof ANCHORS} field
   * @param {string} replacement
   */
  const fill = (field, replacement) => {
    text = replaceAnchor(text, field, ANCHORS[field], replacement);
  };

  if (answers.headerImage) {
    const picture = macroPath(answers.headerImage, "assets/images", "images");
    text = text.replace(HEADING_IMAGE, (_, head, tail) => `${head}${picture}${tail}`);
  }

  const author = answers.author?.trim();
  if (author) fill("author", String.raw`\textbf{Author:} ${escapeLatex(author, "full")}`);

  const lore = nonEmptyLines(answers.lore ?? "").join(" ");
  if (lore) fill("lore", String.raw`\textit{${escapeLatex(lore, "full")}}`);

  if (typeof answers.rounds === "number") fill("rounds", `${answers.rounds} Rounds`);

  const playerCount = formatPlayerCount(answers.playerCounts ?? []);
  if (playerCount) fill("playerCounts", String.raw`\textbf{Player Count:} ${playerCount}`);

  if (answers.resources && anySet(answers.resources)) {
    const zero = { gold: 0, building_materials: 0, valuables: 0 };
    fill("resources", String.raw`\textbf{Starting Resources:} ${resourceLine(answers.resources, zero, true)}`);
  }
  if (answers.income && anySet(answers.income)) {
    const minimum = {
      gold: INCOME_TRACK.gold[0],
      building_materials: INCOME_TRACK.building_materials[0],
      valuables: INCOME_TRACK.valuables[0],
    };
    fill("income", String.raw`\textbf{Starting Income:} ${resourceLine(answers.income, minimum)}`);
  }

  const units = nonEmptyLines(answers.startingUnits ?? "").map((line) => escapeLatex(line, "keep-commands"));
  if (units.length) fill("startingUnits", `\\textbf{Starting Units:}\n${itemize(units, "  ")}`);

  if (answers.buildings) {
    const chosen = BUILDINGS.filter((building) => answers.buildings?.includes(building.key));
    const list = chosen.length ? chosen.map((building) => building.output).join(", ") : "None";
    fill("buildings", String.raw`\textbf{Town Buildings:} ${list}`);
  }

  if (!answers.tilePool) {
    // Skipped or No: the line goes, and the blank line after it too, so one
    // blank line stays between its neighbors.
    text = replaceAnchor(text, "tilePool", `${ANCHORS.tilePool}\n\n`, "");
  } else if (answers.tilePool) {
    const { far, near } = answers.tilePool;
    /** @param {number} n */
    const plural = (n) => (n === 1 ? "" : "s");
    const parts = [];
    if (far > 0) parts.push(`${far} random Far (II--III) Map Tile${plural(far)}`);
    if (near > 0) parts.push(`${near} random Near (IV--V) Map Tile${plural(near)}`);
    if (parts.length) fill("tilePool", String.raw`\textbf{Map Tile Pool:} Each player takes ${parts.join(" and ")}`);
  }

  if (answers.mapSetup) {
    const { starting, far, near, center } = answers.mapSetup;
    /** @type {[TileCount, string][]} */
    const counts = [
      [starting, "Starting (I)"],
      [far, "Far (II--III)"],
      [near, "Near (IV--V)"],
      [center, "Center (VI--VII)"],
    ];
    const used = counts.filter(([count]) => usesTiles(count));
    if (used.length) {
      const perPlayer = used.some(([count]) => typeof count === "object")
        ? " ($P$ stands for the number of players)"
        : "";
      const intro = `Take the following Map Tiles and arrange them as shown in the Scenario map layout${perPlayer}:`;
      const items = used.map(([count, type]) => tiles(count, type));
      fill("mapSetup", `${intro}\n${itemize(items, "  ")}`);
    }
  }

  const victory = prose(answers.victory ?? "", "full");
  if (victory) fill("victory", `\\subsection*{\\MakeUppercase{Victory Conditions}}\n${victory}`);

  const defeat = prose(answers.defeat ?? "", "full");
  if (defeat) fill("defeat", `\\subsection*{\\MakeUppercase{Defeat Conditions}}\n${defeat}`);

  const events = [...(answers.timedEvents ?? [])]
    .sort((a, b) => a.round - b.round)
    .map((event) => ({
      round: event.round,
      lines: nonEmptyLines(event.text).map((line) => escapeLatex(line, "keep-commands")),
    }))
    .filter((event) => event.lines.length);
  if (events.length) {
    const blocks = events.map((event) => `\\textbf{\\nth{${event.round}} Round:}\n${itemize(event.lines, "  ")}`);
    fill("timedEvents", blocks.join("\n\n"));
  }

  const rules = (answers.rules ?? []).map((rule) => prose(rule, "keep-commands")).filter(Boolean);
  if (rules.length) fill("rules", `\\subsection*{\\MakeUppercase{Additional Rules}}\n\n${itemize(rules, "    ")}`);

  if (answers.maps?.length) {
    const blocks = answers.maps.map((map) =>
      [
        String.raw`\vspace{3em}`,
        String.raw`\begin{center}`,
        String.raw`  \includegraphics[width=0.6\paperwidth]{${macroPath(map.path, "assets/maps", "maps")}}`,
        String.raw`  \captionof{figure}{${mapCaption(map.counts)}}`,
        String.raw`\end{center}`,
      ].join("\n"),
    );
    fill("maps", blocks.join("\n\n"));
  }

  return withScenarioKind(withScenarioTitle(text, answers.name.trim()), answers.category);
}

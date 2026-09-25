// Target names for the files a contributor uploads, derived from the
// scenario's own file-safe name. The repository's convention: a header image
// named after the scenario, one map image per layout, and a player-count
// suffix only when the scenario has more than one layout
// ("arcane_artillery_2p.png" ... "arcane_artillery_6p.png").

/** What LuaLaTeX's graphicx can include from a contributor's camera or editor. */
export const HEADER_EXTENSIONS = [".png", ".jpg", ".jpeg"];

/** The map editor exports PNG, and nothing else is accepted for a map. */
export const MAP_EXTENSION = ".png";

/** The map editor's own save file, kept as a backup next to the image. */
export const MAP_FILE_EXTENSION = ".map";

export const MAX_PLAYERS = 6;

/**
 * Lowercased extension of a file name, dot included; "" when it has none.
 *
 * @param {string} name
 * @returns {string}
 */
export function fileExtension(name) {
  const match = /\.[^./]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}

/**
 * The name with any image or map-file extension replaced by `ext`, so a
 * retyped name cannot claim a format its bytes are not.
 *
 * @param {string} name
 * @param {string} ext e.g. ".png"
 * @returns {string}
 */
export function withExtension(name, ext) {
  return `${name.replace(/\.(png|jpe?g|map)$/i, "")}${ext}`;
}

/**
 * Player-count suffix for a map layout: "" for none, "4p" for one count,
 * "2-4p" for a run, "2_4p" for counts with a gap between them.
 *
 * @param {Iterable<number>} counts
 * @returns {string}
 */
export function playerCountSuffix(counts) {
  const sorted = [...new Set(counts)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  /** @type {string[]} */
  const runs = [];
  let start = sorted[0];
  let end = start;
  for (const n of [...sorted.slice(1), Number.NaN]) {
    if (n === end + 1) {
      end = n;
      continue;
    }
    runs.push(start === end ? `${start}` : `${start}-${end}`);
    start = n;
    end = n;
  }
  return `${runs.join("_")}p`;
}

/**
 * Target name of a map image: "say_no_more.png" for a layout with no player
 * count ticked, "say_no_more_4p.png" or "say_no_more_2-4p.png" otherwise.
 *
 * @param {string} slug the scenario's file-safe name
 * @param {Iterable<number>} counts
 * @returns {string}
 */
export function mapImageName(slug, counts) {
  const suffix = playerCountSuffix(counts);
  return `${slug}${suffix ? `_${suffix}` : ""}${MAP_EXTENSION}`;
}

/**
 * Player counts a map image's name already declares, read from a trailing
 * "_4p", "-2-4p", "_2_4p" or "-2.4p" before the extension. Counts outside
 * 1..MAX_PLAYERS are dropped; a name without such a suffix yields none.
 *
 * @param {string} name
 * @returns {number[]}
 */
export function parsePlayerCounts(name) {
  const match = /[_-](\d+(?:[-_.]\d+)*)p(?:\.[^.]+)?$/i.exec(name);
  if (!match) return [];
  /** @type {Set<number>} */
  const counts = new Set();
  for (const part of match[1].split(/[_.]/)) {
    const [from, to = from] = part.split("-").map(Number);
    for (let n = from; n <= to; n++) if (n >= 1 && n <= MAX_PLAYERS) counts.add(n);
  }
  return [...counts].sort((a, b) => a - b);
}

/**
 * A map editor save string as the repository keeps it, or null when it is
 * not one. The editor exports its layout as a single line of base64; a paste
 * split over lines, or padded with spaces, is joined back into that line.
 * An empty paste is "": the layout simply has no save string.
 *
 * @param {string} text what was pasted
 * @returns {string | null}
 */
export function normalizeMapCode(text) {
  const code = text.replace(/\s+/g, "");
  if (!code) return "";
  return /^[A-Za-z0-9+/]+={0,2}$/.test(code) ? code : null;
}

/**
 * The contents of a map file in assets/map-files/: the save string on one
 * line, ending in a newline like every file in the repository.
 *
 * @param {string} code a string normalizeMapCode accepted
 * @returns {string}
 */
export function mapFileContents(code) {
  return `${code}\n`;
}

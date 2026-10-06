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

/** How many map layouts one scenario can stage. */
export const MAX_MAP_FILES = 6;

/** Where a staged header image (and any other image) lands in the repository. */
export const IMAGES_DIR = "assets/images/";
/** Where a staged map layout lands. */
export const MAPS_DIR = "assets/maps/";
/** Where a layout's map editor save file lands. */
export const MAP_FILES_DIR = "assets/map-files/";

/**
 * Repository-safe form of an uploaded file's name: spaces become
 * underscores and anything TeX or a URL would trip on is dropped. The
 * extension survives; a name that empties out falls back to "image".
 */
export function sanitizeUploadName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "image";
}

/**
 * Lowercased extension of a file name, dot included; "" when it has none.
 */
export function fileExtension(name: string): string {
  const match = /\.[^./]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}

/**
 * The name with any image or map-file extension replaced by `ext`, so a
 * retyped name cannot claim a format its bytes are not.
 *
 * @param ext e.g. ".png"
 */
export function withExtension(name: string, ext: string): string {
  return `${name.replace(/\.(png|jpe?g|map)$/i, "")}${ext}`;
}

/**
 * Player-count suffix for a map layout: "" for none, "4p" for one count,
 * "2-4p" for a run, "2_4p" for counts with a gap between them.
 */
export function playerCountSuffix(counts: Iterable<number>): string {
  const sorted = [...new Set(counts)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  const runs: string[] = [];
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
 * @param slug the scenario's file-safe name
 */
export function mapImageName(slug: string, counts: Iterable<number>): string {
  const suffix = playerCountSuffix(counts);
  return `${slug}${suffix ? `_${suffix}` : ""}${MAP_EXTENSION}`;
}

/**
 * Player counts a map image's name already declares, read from a trailing
 * "_4p", "-2-4p", "_2_4p" or "-2.4p" before the extension. Counts outside
 * 1..MAX_PLAYERS are dropped; a name without such a suffix yields none.
 */
export function parsePlayerCounts(name: string): number[] {
  const match = /[_-](\d+(?:[-_.]\d+)*)p(?:\.[^.]+)?$/i.exec(name);
  if (!match) return [];
  const counts: Set<number> = new Set();
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
 * @param text what was pasted
 */
export function normalizeMapCode(text: string): string | null {
  const code = text.replace(/\s+/g, "");
  if (!code) return "";
  return /^[A-Za-z0-9+/]+={0,2}$/.test(code) ? code : null;
}

/**
 * The contents of a map file in assets/map-files/: the save string on one
 * line, ending in a newline like every file in the repository.
 *
 * @param code a string normalizeMapCode accepted
 */
export function mapFileContents(code: string): string {
  return `${code}\n`;
}

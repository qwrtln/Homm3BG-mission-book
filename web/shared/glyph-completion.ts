// What the .tex editor offers while a contributor types a glyph name into
// \svg{...}. The names come from assets/glyphs-inkscape/manifest.json, which
// tools/precompile_glyphs.sh writes. How often the book uses each one comes
// from glyph-usage.json, which web/glyph-usage.ts writes at deploy time and
// on every web/serve.sh start. The app works without it: every count is zero.

import { CORE_GLYPHS } from "./build-plan.ts";

/** Where web/glyph-usage.ts writes the use counts, next to the manifest. */
export const GLYPH_USAGE_PATH = "assets/glyphs-inkscape/glyph-usage.json";

// metadata.tex's \svg swaps these in by itself: -mono for a unit glyph in the
// printable build. A scenario never names one.
const MONO_SUFFIX = /-mono$/;
// Colored variants of a plain glyph. Offered as the plain glyph, and counted
// as it too.
const COLOR_SUFFIX = /(?:-yellow|-red|_gray)$/;
// The variant drawn in the dark theme, where a black glyph does not show.
const DARK_SUFFIX = "-yellow";

// Text before the cursor. `\svg` alone, or `\svg[12]{` and the name so far.
const COMMAND = /\\svg$/;
const ARGUMENT = /\\svg\s*(?:\[[^\]]*\]\s*)?\{([\w-]*)$/;

/** Where the cursor sits in a \svg call, and what a pick writes there. */
export interface GlyphContext {
  /** the name's text before the cursor */
  typed: string;
  /** column where the replaced text starts */
  from: number;
  /** column where the replaced text ends: the cursor, plus any name running on after it */
  to: number;
  /** written before the name: "{" right after `\svg` */
  open: string;
  /** written after the name: "}" unless one is there */
  close: string;
}

/**
 * The \svg call the cursor is in, read from its line alone.
 *
 * @param line the cursor's whole line
 * @param ch the cursor's column
 * @returns null outside a \svg call
 */
export function glyphContext(line: string, ch: number): GlyphContext | null {
  const before = line.slice(0, ch);
  const after = line.slice(ch);
  // `\svgs` is metadata.tex's path macro, not the command.
  if (COMMAND.test(before) && !/^[A-Za-z]/.test(after)) {
    return { typed: "", from: ch, to: ch, open: "{", close: "}" };
  }
  const match = ARGUMENT.exec(before);
  if (!match) return null;
  const rest = /^[\w-]*/.exec(after)?.[0] ?? "";
  return {
    typed: match[1],
    from: ch - match[1].length,
    to: ch + rest.length,
    open: "",
    close: after.slice(rest.length).startsWith("}") ? "" : "}",
  };
}

/**
 * A name character typed straight after `\svg`, as in `\svgg`: the braces
 * the contributor skipped, to write around it. A scenario never writes a
 * longer command starting `\svg`; metadata.tex's `\svgs` is undone with one
 * Ctrl-Z. Null anywhere else, and inside a word already there.
 *
 * @param line the cursor's whole line, the character already in it
 * @param ch the cursor's column, just after that character
 * @returns the range to replace, its replacement, and the cursor's column
 *   after it: inside the braces, after the character
 */
export function missingBrace(
  line: string,
  ch: number,
): { from: number; to: number; text: string; cursor: number } | null {
  const match = /\\svg([\w-])$/.exec(line.slice(0, ch));
  if (!match || /^[\w-]/.test(line.slice(ch))) return null;
  return { from: ch - 1, to: ch, text: `{${match[1]}}`, cursor: ch + 1 };
}

/**
 * The glyph a scenario writes for a manifest name: "attack-yellow" is
 * "attack", "arrow_right_gray" is "arrow_right". Null for a name no scenario
 * writes, such as "bronze-mono".
 */
export function plainGlyph(name: string): string | null {
  if (MONO_SUFFIX.test(name)) return null;
  return name.replace(COLOR_SUFFIX, "");
}

/**
 * How well a name matches what was typed, ignoring case: 0 when it starts
 * with it, 1 when it contains it, 2 when its letters appear in order.
 */
export interface GlyphMatch {
  /** lower is better */
  tier: 0 | 1 | 2;
  /** the matched characters of the name */
  indices: number[];
}

/** @returns null when the name does not match */
export function matchGlyph(name: string, typed: string): GlyphMatch | null {
  const lowerName = name.toLowerCase();
  const lowerTyped = typed.toLowerCase();
  const at = lowerName.indexOf(lowerTyped);
  if (at >= 0) {
    return { tier: at === 0 ? 0 : 1, indices: Array.from(lowerTyped, (_, i) => at + i) };
  }
  const indices: number[] = [];
  let from = 0;
  for (const char of lowerTyped) {
    const found = lowerName.indexOf(char, from);
    if (found < 0) return null;
    indices.push(found);
    from = found + 1;
  }
  return { tier: 2, indices };
}

/**
 * The glyph names to offer, best first. The better match comes first, then
 * the glyph the book uses more often. The glyphs preloaded for every scenario
 * (resources and unit tiers) come last in their tier: a contributor has them
 * in the template already.
 *
 * @param manifest every glyph basename
 * @param usage how often the book names each glyph; missing names count zero
 * @returns dark: the variant to draw in the dark theme, when the glyph has one
 */
export function glyphCompletions(
  manifest: readonly string[],
  usage: Readonly<Record<string, number>>,
  typed: string,
): { name: string; indices: number[]; dark: string | null }[] {
  const available = new Set(manifest);
  const counts: Map<string, number> = new Map();
  for (const name of manifest) {
    const plain = plainGlyph(name);
    // A colored variant whose plain glyph does not exist is offered as itself.
    if (plain !== null) counts.set(available.has(plain) ? plain : name, 0);
  }
  for (const [name, count] of Object.entries(usage)) {
    const plain = plainGlyph(name);
    if (plain !== null && counts.has(plain)) counts.set(plain, (counts.get(plain) ?? 0) + count);
  }
  const core = new Set(CORE_GLYPHS);
  return [...counts.keys()]
    .map((name) => ({ name, match: matchGlyph(name, typed) }))
    .filter((entry): entry is { name: string; match: GlyphMatch } => entry.match !== null)
    .sort(
      (a, b) =>
        a.match.tier - b.match.tier ||
        Number(core.has(a.name)) - Number(core.has(b.name)) ||
        (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .map(({ name, match }) => ({
      name,
      indices: match.indices,
      dark: available.has(name + DARK_SUFFIX) ? name + DARK_SUFFIX : null,
    }));
}

/**
 * Every glyph name a source's \svg calls literally name, with how often.
 * Like collectReferencedGlyphs in build-plan.ts, it misses a name built from
 * a macro; that only lowers a count.
 *
 * @param source one .tex file's text
 * @param counts adds to these
 */
export function countGlyphUses(source: string, counts: Map<string, number> = new Map()): Map<string, number> {
  for (const match of source.matchAll(/\\svg\s*(?:\[[^\]]*\])?\{([\w-]+)\}/g)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return counts;
}

/**
 * The manifest, checked: a list of names.
 *
 * @param payload parsed manifest.json
 */
export function parseGlyphManifest(payload: unknown): string[] {
  if (!Array.isArray(payload) || !payload.every((name) => typeof name === "string")) {
    throw new Error("glyph manifest: expected a list of names");
  }
  return payload;
}

/**
 * The use counts, checked: names to non-negative whole numbers.
 *
 * @param payload parsed glyph-usage.json
 */
export function parseGlyphUsage(payload: unknown): Record<string, number> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("glyph usage: expected an object");
  }
  const usage: Record<string, number> = {};
  for (const [name, count] of Object.entries(payload)) {
    if (!Number.isInteger(count) || count < 0) throw new Error(`glyph usage: bad count for ${name}`);
    usage[name] = count;
  }
  return usage;
}

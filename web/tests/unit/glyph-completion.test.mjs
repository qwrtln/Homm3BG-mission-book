// Tier 1 check of what the .tex editor offers inside \svg{...}.

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CORE_GLYPHS } from "../../shared/build-plan.js";
import {
  countGlyphUses,
  glyphCompletions,
  glyphContext,
  matchGlyph,
  missingBrace,
  parseGlyphManifest,
  parseGlyphUsage,
  plainGlyph,
} from "../../shared/glyph-completion.js";
import { readRepoFile, repoRoot } from "../helpers/repo.mjs";

/**
 * The context at the "|" in `marked`, with the "|" taken out.
 *
 * @param {string} marked
 */
function contextAt(marked) {
  const ch = marked.indexOf("|");
  return glyphContext(marked.replace("|", ""), ch);
}

/**
 * The names offered, in order.
 *
 * @param {string[]} manifest
 * @param {Record<string, number>} usage
 * @param {string} typed
 */
function names(manifest, usage, typed) {
  return glyphCompletions(manifest, usage, typed).map(({ name }) => name);
}

test("right after \\svg, a pick writes the braces too", () => {
  assert.deepEqual(contextAt("Pay 2 \\svg|"), { typed: "", from: 10, to: 10, open: "{", close: "}" });
  assert.deepEqual(contextAt("Pay \\svg| now")?.open, "{");
});

test("\\svgs, the path macro, and other commands are not \\svg", () => {
  assert.equal(contextAt("\\svgs|"), null);
  assert.equal(contextAt("\\svg|s/gold.svg"), null, "a letter runs on: the command is \\svgs");
  assert.equal(contextAt("\\includesvg{|}"), null);
  assert.equal(contextAt("Plain text|"), null);
});

test("inside the argument, a pick replaces the whole name and closes a missing brace", () => {
  assert.deepEqual(contextAt("Gain \\svg{go|"), { typed: "go", from: 10, to: 12, open: "", close: "}" });
  assert.deepEqual(contextAt("Gain \\svg{go|ld} now"), { typed: "go", from: 10, to: 14, open: "", close: "" });
  assert.deepEqual(contextAt("\\svg[14]{|}")?.typed, "");
  assert.deepEqual(contextAt("\\svg [14] {attack-y|")?.typed, "attack-y");
  assert.equal(contextAt("\\svg{gold}|"), null, "past the closing brace");
  assert.equal(contextAt("\\svg{gold} and |"), null);
});

test("a name character typed straight after \\svg gets the braces it skipped", () => {
  const at = (/** @type {string} */ marked) => missingBrace(marked.replace("|", ""), marked.indexOf("|"));
  assert.deepEqual(at("Gain \\svgg|"), { from: 9, to: 10, text: "{g}", cursor: 11 });
  assert.deepEqual(at("\\svg_|, then")?.text, "{_}");
  assert.equal(at("Gain \\svg{g|"), null, "the brace is there");
  assert.equal(at("Gain \\svg|"), null, "no name character yet");
  assert.equal(at("Gain \\svg [|"), null, "a size, not a name");
  assert.equal(at("Gain \\svggo|"), null, "only the first character: the braces were taken back out");
  assert.equal(at("\\svgp|ath"), null, "typed inside a word already there");
  assert.equal(at("\\includesvgg|"), null);
});

test("-mono glyphs are dropped, colored ones stand for their plain glyph", () => {
  assert.equal(plainGlyph("bronze-mono"), null);
  assert.equal(plainGlyph("attack-yellow"), "attack");
  assert.equal(plainGlyph("movement-red"), "movement");
  assert.equal(plainGlyph("arrow_right_gray"), "arrow_right", "gray is a color too");
});

test("matches rank prefix, then substring, then letters in order", () => {
  assert.deepEqual(matchGlyph("gold", "GO"), { tier: 0, indices: [0, 1] });
  assert.deepEqual(matchGlyph("3_gold", "go"), { tier: 1, indices: [2, 3] });
  assert.deepEqual(matchGlyph("morale_positive", "mpo"), { tier: 2, indices: [0, 7, 8] });
  assert.equal(matchGlyph("gold", "dog"), null);
  assert.deepEqual(matchGlyph("gold", ""), { tier: 0, indices: [] });
});

const MANIFEST = [
  "arrow_right",
  "arrow_right_gray",
  "attack",
  "attack-yellow",
  "bronze",
  "bronze-mono",
  "damage",
  "gold",
  "golden",
  "golden-mono",
  "movement",
  "movement-red",
  "movement-yellow",
  "morale_positive",
  "ongoing",
  "orphan-yellow",
];

test("the offered names hide -mono and colored variants", () => {
  const offered = names(MANIFEST, {}, "");
  const variants = offered.filter((name) => /(-mono|-yellow|-red|_gray)$/.test(name));
  assert.deepEqual(variants, ["orphan-yellow"], "a variant without a plain glyph is offered as itself");
});

test("more used glyphs come first, colored uses count for the plain glyph", () => {
  const usage = { attack: 3, damage: 4, "attack-yellow": 2, movement: 1, "movement-red": 9 };
  assert.deepEqual(names(MANIFEST, usage, "").slice(0, 3), ["movement", "attack", "damage"]);
});

test("preloaded glyphs come last in their tier, however often they are used", () => {
  const usage = { gold: 500, golden: 400, bronze: 700, attack: 1 };
  const offered = names(MANIFEST, usage, "");
  assert.deepEqual(offered.slice(-3), ["bronze", "gold", "golden"]);
  assert.ok(CORE_GLYPHS.includes("gold") && CORE_GLYPHS.includes("bronze"));
});

test("a better match beats more uses", () => {
  const usage = { ongoing: 50, gold: 1 };
  assert.deepEqual(names(MANIFEST, usage, "go"), ["gold", "golden", "ongoing"]);
  assert.deepEqual(names(MANIFEST, { morale_positive: 9, movement: 1 }, "mo"), ["morale_positive", "movement"]);
  assert.deepEqual(names(MANIFEST, {}, "mvt"), ["movement"], "letters in order");
  assert.deepEqual(names(MANIFEST, {}, "zzz"), []);
});

test("each offered name carries the characters to mark", () => {
  const [first] = glyphCompletions(MANIFEST, {}, "dmg");
  assert.deepEqual(first, { name: "damage", indices: [0, 2, 4], dark: null });
});

test("a glyph with a yellow variant names it for the dark theme", () => {
  const offered = glyphCompletions(MANIFEST, {}, "");
  assert.equal(offered.find(({ name }) => name === "attack")?.dark, "attack-yellow");
  assert.equal(offered.find(({ name }) => name === "movement")?.dark, "movement-yellow");
  assert.equal(offered.find(({ name }) => name === "arrow_right")?.dark, null);
});

test("uses are counted per literal \\svg call, with or without a size", () => {
  const counts = countGlyphUses("Pay \\svg{gold} and \\svg[14]{gold}, gain \\svg{attack-yellow}. \\svg{#2} \\svgs/x");
  assert.deepEqual(Object.fromEntries(counts), { gold: 2, "attack-yellow": 1 });
  countGlyphUses("\\svg{gold}", counts);
  assert.equal(counts.get("gold"), 3, "adds to the counts it is given");
});

test("the manifest and use counts are checked at entry", () => {
  assert.deepEqual(parseGlyphManifest(["gold"]), ["gold"]);
  assert.throws(() => parseGlyphManifest({ gold: 1 }));
  assert.throws(() => parseGlyphManifest(["gold", 3]));
  assert.deepEqual(parseGlyphUsage({ gold: 3 }), { gold: 3 });
  assert.throws(() => parseGlyphUsage(["gold"]));
  assert.throws(() => parseGlyphUsage({ gold: -1 }));
  assert.throws(() => parseGlyphUsage({ gold: "3" }));
});

test("the real manifest offers gold for \\svg{go and no -mono glyph", () => {
  const manifest = parseGlyphManifest(JSON.parse(readRepoFile("assets/glyphs-inkscape/manifest.json")));
  assert.ok(names(manifest, {}, "go").includes("gold"));
  assert.ok(!names(manifest, {}, "").some((name) => name.endsWith("-mono")));
});

test("the manifest lists every glyph, each with its precompiled pair", () => {
  const manifest = parseGlyphManifest(JSON.parse(readRepoFile("assets/glyphs-inkscape/manifest.json")));
  const sources = readdirSync(join(repoRoot, "assets/glyphs"))
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.slice(0, -".svg".length));
  assert.deepEqual([...manifest].sort(), sources.sort(), "rerun tools/precompile_glyphs.sh");
  const unbuilt = manifest.filter(
    (name) =>
      !existsSync(join(repoRoot, `assets/glyphs-inkscape/${name}_svg-tex.pdf`)) ||
      !existsSync(join(repoRoot, `assets/glyphs-inkscape/${name}_svg-tex.pdf_tex`)),
  );
  assert.deepEqual(unbuilt, [], "rerun tools/precompile_glyphs.sh");
});

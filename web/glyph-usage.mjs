// Counts how often the book's English sources name each glyph in \svg{...},
// so the editor can offer the common glyphs first. Writes a JSON object of
// glyph names to counts.
//
// Run by web/serve.sh on every start and by publish-docs.yaml at deploy time.
// The output is generated, never committed: .gitignore lists the default
// path.
//
// Needs Node and git. Nothing is installed.
//
// Usage: node web/glyph-usage.mjs [OUTPUT]
//   (default assets/glyphs-inkscape/glyph-usage.json, from the repository root)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { countGlyphUses, GLYPH_USAGE_PATH } from "./shared/glyph-completion.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(root, GLYPH_USAGE_PATH));

// Tracked .tex files only. English is the only source: po4a generates the
// translated/ copies from it.
const files = execFileSync("git", ["ls-files", "-z", "--", "*.tex"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((path) => path && !path.split("/").includes("translated"));

/** @type {Map<string, number>} */
const counts = new Map();
for (const path of files) countGlyphUses(readFileSync(join(root, path), "utf8"), counts);

const sorted = Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(output, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Counted ${counts.size} glyphs in ${files.length} files into ${output}`);

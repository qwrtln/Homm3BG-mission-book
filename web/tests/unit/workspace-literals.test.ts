// Tier 1 guard for the workspace view: no colour literal in the editor, the
// workspace components or the Workspace section of app.css. A colour is a token
// in styles/tokens.css, which is not scanned. The pattern is the colour part of
// the 10x-ui hardcoded-value scan.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const APP = join(import.meta.dirname, "../../app");
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;

/** A scanned file's name and its lines, 1-based by position. */
interface Scanned {
  name: string;
  lines: string[];
  firstLine: number;
}

/** @returns every .ts and .tsx file in `dir`, as scan input */
function filesIn(dir: string): Scanned[] {
  const root = join(APP, dir);
  return readdirSync(root)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({
      name: relative(APP, join(root, file)),
      lines: readFileSync(join(root, file), "utf8").split("\n"),
      firstLine: 1,
    }));
}

/** @returns the Workspace section of app.css: from its `--- Workspace` header to the next `/* ---` header */
function workspaceCss(): Scanned {
  const lines = readFileSync(join(APP, "styles/app.css"), "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes("--- Workspace"));
  assert.notEqual(start, -1, "app.css has no `--- Workspace` header");
  const next = lines.findIndex((line, index) => index > start && line.includes("/* ---"));
  assert.notEqual(next, -1, "app.css has no section after the Workspace one");
  return { name: "styles/app.css (Workspace section)", lines: lines.slice(start, next), firstLine: start + 1 };
}

test("the workspace view holds no colour literal", () => {
  const scanned = [...filesIn("components/editor"), ...filesIn("components/workspace"), workspaceCss()];
  assert.ok(scanned.length > 2, "the scan found no files");
  const hits: string[] = [];
  for (const { name, lines, firstLine } of scanned) {
    lines.forEach((line, index) => {
      if (COLOUR.test(line)) hits.push(`${name}:${firstLine + index}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "a colour literal belongs in styles/tokens.css, used as var(--token)");
});

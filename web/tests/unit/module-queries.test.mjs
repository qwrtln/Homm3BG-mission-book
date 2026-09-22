// Tier 1 check that web/types/module-queries.d.ts still lists every export of
// web/shared/github-contrib.js.
//
// web/app/modules/github.js imports that module with a "?v=2" cache-busting
// query, which TypeScript cannot resolve, so the declaration re-lists the
// exports by hand. An export added to the module but not to the declaration
// silently becomes `any` at the import site instead of failing the check.

import assert from "node:assert/strict";
import test from "node:test";

import * as githubContrib from "../../shared/github-contrib.js";
import { readRepoFile } from "../helpers/repo.mjs";

test("the ?v=2 declaration re-exports everything github-contrib.js exports", () => {
  const declaration = readRepoFile("web/types/module-queries.d.ts");
  const declared = new Set([...declaration.matchAll(/^ {2}export const (\w+):/gm)].map((match) => match[1]));
  const undeclared = Object.keys(githubContrib).filter((name) => !declared.has(name));
  assert.deepEqual(undeclared, [], "add these to module-queries.d.ts or they import as `any`");
});

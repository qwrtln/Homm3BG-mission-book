// Tier 1 tests against the repository's own .tex files. They assert
// invariants, never specific scenario titles, so adding or renaming a
// scenario does not break them — but a parser regression does.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  DRAFT_GROUP_FILES,
  GROUP_FILES,
  parseScenarioIndex,
  planScenarioBuild,
  scenarioHeading,
} from "../../shared/build-plan.js";
import { readRepoFile, repoRoot } from "../helpers/repo.mjs";

function indexFor(groupFiles) {
  const sources = groupFiles.map((group) => ({ path: group.path, source: readRepoFile(group.path) }));
  return parseScenarioIndex(sources, groupFiles);
}

const published = indexFor(GROUP_FILES);
const drafts = indexFor(DRAFT_GROUP_FILES);

test("the published group files list scenarios that exist on disk", () => {
  assert.ok(published.length > 0, "the mission book is not empty");
  for (const entry of published) {
    assert.ok(existsSync(join(repoRoot, entry.path)), `${entry.path} is listed but not on disk`);
  }
});

test("the draft group files list scenarios that exist on disk", () => {
  for (const entry of drafts) {
    assert.ok(existsSync(join(repoRoot, entry.path)), `${entry.path} is listed but not on disk`);
  }
});

test("every published scenario gives the picker a heading", () => {
  for (const entry of published) {
    const heading = scenarioHeading(readRepoFile(entry.path));
    assert.ok(heading, `${entry.path} has no \\addscenariosection the picker can read`);
    assert.ok(heading.title.length > 0, `${entry.path} has an empty title`);
    assert.ok(!/\\/.test(heading.title), `${entry.path}'s title still holds a TeX macro: ${heading.title}`);
  }
});

test("a real scenario plans a build whose staged files all exist", () => {
  const metadata = readRepoFile("metadata.tex");
  const entry = published[0];
  const plan = planScenarioBuild({ metadata, scenario: { path: entry.path, source: readRepoFile(entry.path) } });

  assert.equal(plan.generated["structure.tex"], `\\include{${entry.path}}\n`);
  assert.ok(plan.repoFiles.includes(entry.path));
  assert.ok(plan.notes.length > 0);

  // Glyph and asset paths are fetched one by one at build time; a plan that
  // names a file the repository does not have is a parser bug, not a miss.
  for (const path of plan.repoFiles) {
    assert.ok(existsSync(join(repoRoot, path)), `${entry.path}'s plan stages ${path}, which is not in the repository`);
  }
});

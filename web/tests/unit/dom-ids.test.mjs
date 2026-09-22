// Tier 1 check that web/types/dom-ids.d.ts still describes web/app/index.html.
//
// el() in web/app/modules/dom.js returns a non-nullable element typed from
// that map, so the map going out of step with the markup is the one way that
// type can be wrong. Nothing in the type checker can see it; this can.

import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "../helpers/repo.mjs";

/** Every id attribute in the app's markup. */
function markupIds() {
  const html = readRepoFile("web/app/index.html");
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

/** Every key of the ElementIdMap interface. */
function mappedIds() {
  const source = readRepoFile("web/types/dom-ids.d.ts");
  const body = source.slice(source.indexOf("interface ElementIdMap {"));
  return new Set([...body.matchAll(/^ {2}"?([a-z][a-z0-9-]*)"?:/gm)].map((match) => match[1]));
}

test("every id in the map exists in app/index.html", () => {
  const markup = markupIds();
  const missing = [...mappedIds()].filter((id) => !markup.has(id));
  assert.deepEqual(missing, [], "el() would return null for these, not an element");
});

test("every id in app/index.html is in the map", () => {
  const mapped = mappedIds();
  const unmapped = [...markupIds()].filter((id) => !mapped.has(id));
  assert.deepEqual(unmapped, [], "el() cannot reach these; add them to dom-ids.d.ts");
});

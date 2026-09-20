// Tier 1 unit tests for the search ranking in web/app/modules/search.js.
//
// The module touches the DOM only inside renderResults, moveActive and
// initSearch, never at import time, so Node loads it without a DOM. It became
// importable once config.js stopped resolving BASE at module scope.
import test from "node:test";
import assert from "node:assert/strict";

import { matchScore, groupedResults } from "../../app/modules/search.js";
import { state } from "../../app/modules/state.js";

/**
 * A ScenarioEntry, with the fields the search reads spelled out.
 *
 * @param {"mission" | "draft"} book
 * @param {string} category one of config.js's CATEGORY_ORDER labels
 * @param {string} title
 * @returns {ScenarioEntry}
 */
function entry(book, category, title) {
  return { path: `${category.toLowerCase()}/${title}.tex`, book, category, title, isTemplate: false };
}

/**
 * Runs groupedResults over a fixed entry list, leaving the shared state as it
 * was found. groupedResults reads state.entries rather than taking them as an
 * argument, and this test sets that shared state rather than changing the
 * module's signature: renderResults is its only caller and passes no entries.
 *
 * @param {ScenarioEntry[]} entries
 * @param {string} query
 * @returns {ReturnType<typeof groupedResults>}
 */
function resultsFor(entries, query) {
  const previous = state.entries;
  state.entries = entries;
  try {
    return groupedResults(query);
  } finally {
    state.entries = previous;
  }
}

test("matchScore ranks a substring match by where it starts", () => {
  assert.equal(matchScore("astral", "Astral Run"), 0);
  assert.equal(matchScore("run", "Astral Run"), 7);
  assert.equal(
    matchScore("run", "Run of the Astral Run"),
    0,
    "the first occurrence wins, not the last",
  );
});

test("matchScore is case-insensitive and ignores surrounding whitespace", () => {
  assert.equal(matchScore("  ASTRAL  ", "Astral Run"), 0);
  assert.equal(matchScore("RUN", "astral run"), 7);
});

test("matchScore falls back to letters in order, ranked after every substring hit", () => {
  // a-s-r appear in order in "astral run" at 0, 1 and 3, but not as a
  // substring: 1000 + (3 - 0).
  assert.equal(matchScore("asr", "Astral Run"), 1003);
  // a-r-n spans 0 to 9, so the same fallback ranks it worse: 1000 + (9 - 0).
  assert.equal(matchScore("arn", "Astral Run"), 1009);
  assert.ok(matchScore("asr", "Astral Run") < matchScore("arn", "Astral Run"));
  // The rank is the span the letters cover, not where they end: s-r-n runs
  // from 1 to 9, so 1008, one better than a-r-n's 1009 over the same end.
  assert.equal(matchScore("srn", "Astral Run"), 1008);
  // Only reached when there is no substring at all.
  assert.equal(matchScore("ast", "Astral Run"), 0, "this one is a substring after all");
  assert.ok(matchScore("asr", "Astral Run") > matchScore("run", "Astral Run"));
});

test("matchScore returns null when the letters are not all there, in order", () => {
  assert.equal(matchScore("zebra", "Astral Run"), null);
  assert.equal(matchScore("nur", "Astral Run"), null, "the order matters, not just the letters");
  assert.equal(matchScore("astralx", "Astral Run"), null);
});

test("matchScore scores an empty query zero, so everything matches equally", () => {
  assert.equal(matchScore("", "Astral Run"), 0);
  assert.equal(matchScore("   ", "Astral Run"), 0);
});

test("groupedResults groups entries by book and category", () => {
  const groups = resultsFor([
    entry("mission", "Clash", "Astral Run"),
    entry("mission", "Clash", "Astral Rise"),
    entry("mission", "Coop", "Astral Pact"),
    entry("draft", "Clash", "Astral Draft"),
  ], "astral");
  assert.deepEqual(
    groups.map((group) => `${group.book}|${group.category}`),
    ["mission|Coop", "mission|Clash", "draft|Clash"],
  );
  assert.deepEqual(groups.map((group) => group.items.length), [1, 2, 1]);
});

test("groupedResults drops entries that do not match at all", () => {
  const groups = resultsFor([
    entry("mission", "Clash", "Astral Run"),
    entry("mission", "Coop", "Gold Rush"),
  ], "astral");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map(({ entry: e }) => e.title), ["Astral Run"]);
});

test("groupedResults sorts a group by score, then by title", () => {
  const groups = resultsFor([
    // "run" at index 7, 0 and 11: the middle one wins.
    entry("mission", "Clash", "Astral Run"),
    entry("mission", "Clash", "Run of Gold"),
    entry("mission", "Clash", "The Silver Run"),
    // Same score as "Astral Run" (index 7), so the title breaks the tie.
    entry("mission", "Clash", "Aaaaaa Run"),
  ], "run");
  assert.deepEqual(
    groups[0].items.map(({ entry: e, score }) => [e.title, score]),
    [["Run of Gold", 0], ["Aaaaaa Run", 7], ["Astral Run", 7], ["The Silver Run", 11]],
  );
});

test("groupedResults puts every mission book group before every draft book group", () => {
  const groups = resultsFor([
    // The draft entry is listed first and scores better, and still comes last.
    entry("draft", "Coop", "Run"),
    entry("mission", "Alliance", "Astral Run"),
  ], "run");
  assert.deepEqual(groups.map((group) => group.book), ["mission", "draft"]);
});

test("groupedResults orders groups of one book by CATEGORY_ORDER", () => {
  const groups = resultsFor([
    entry("mission", "Alliance", "Run A"),
    entry("mission", "Campaign", "Run B"),
    entry("mission", "Clash", "Run C"),
    entry("mission", "Coop", "Run D"),
  ], "run");
  assert.deepEqual(
    groups.map((group) => group.category),
    ["Coop", "Clash", "Campaign", "Alliance"],
    "config.js's CATEGORY_ORDER, not the order the entries arrived in",
  );
});

test("groupedResults returns every entry for an empty query", () => {
  const groups = resultsFor([
    entry("mission", "Clash", "Astral Run"),
    entry("draft", "Coop", "Gold Rush"),
  ], "");
  assert.deepEqual(groups.map((group) => group.items.length), [1, 1]);
});

test("groupedResults leaves state.entries as it found it", () => {
  const before = state.entries;
  resultsFor([entry("mission", "Clash", "Astral Run")], "astral");
  assert.equal(state.entries, before);
});

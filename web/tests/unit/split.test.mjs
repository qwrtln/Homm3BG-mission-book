// Tier 1 check of the source/PDF split: reading a stored value back, and
// keeping both panes at their minimum width.

import assert from "node:assert/strict";
import test from "node:test";

import { clampSplit, DEFAULT_SPLIT, parseSplit } from "../../shared/split.js";

test("a stored percentage reads back as itself", () => {
  assert.equal(parseSplit("37.5"), 37.5);
});

test("a missing, empty, non-numeric or out-of-range value falls back to the default", () => {
  for (const stored of [null, "", "  ", "wide", "0", "100", "-5", "140", "NaN"]) {
    assert.equal(parseSplit(stored), DEFAULT_SPLIT, String(stored));
  }
});

test("a split within the bounds is kept", () => {
  assert.equal(clampSplit(60, 1000, 200), 60);
});

test("a split past either bound stops where a pane reaches its minimum", () => {
  assert.equal(clampSplit(5, 1000, 200), 20);
  assert.equal(clampSplit(95, 1000, 200), 80);
});

test("space too narrow for two minimum panes, or none at all, splits evenly", () => {
  assert.equal(clampSplit(30, 400, 200), DEFAULT_SPLIT);
  assert.equal(clampSplit(30, 0, 200), DEFAULT_SPLIT);
});

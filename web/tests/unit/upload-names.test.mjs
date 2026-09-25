// Tier 1 check of the names the uploads dialog gives a contributor's files.

import assert from "node:assert/strict";
import test from "node:test";

import {
  fileExtension,
  mapImageName,
  parsePlayerCounts,
  playerCountSuffix,
  withExtension,
} from "../../shared/upload-names.js";

test("fileExtension lowercases and keeps the dot", () => {
  assert.equal(fileExtension("Cover.JPG"), ".jpg");
  assert.equal(fileExtension("map.v2.png"), ".png");
  assert.equal(fileExtension("no_extension"), "");
});

test("withExtension replaces an image or map-file extension instead of stacking one", () => {
  assert.equal(withExtension("say_no_more", ".png"), "say_no_more.png");
  assert.equal(withExtension("say_no_more.jpg", ".png"), "say_no_more.png");
  assert.equal(withExtension("say_no_more_4p.png", ".map"), "say_no_more_4p.map");
  assert.equal(withExtension("v1.5", ".png"), "v1.5.png", "a dot that is no known extension stays");
});

test("playerCountSuffix names one count, a run, or counts with a gap", () => {
  assert.equal(playerCountSuffix([]), "");
  assert.equal(playerCountSuffix([4]), "4p");
  assert.equal(playerCountSuffix([4, 2, 3]), "2-4p");
  assert.equal(playerCountSuffix([2, 4]), "2_4p");
  assert.equal(playerCountSuffix([1, 2, 4, 5, 6]), "1-2_4-6p");
});

test("mapImageName adds a suffix only when a player count is ticked", () => {
  assert.equal(mapImageName("say_no_more", []), "say_no_more.png");
  assert.equal(mapImageName("say_no_more", [4]), "say_no_more_4p.png");
  assert.equal(mapImageName("say_no_more", new Set([2, 3, 4])), "say_no_more_2-4p.png");
});

test("parsePlayerCounts reads the suffixes the repository's map names use", () => {
  assert.deepEqual(parsePlayerCounts("arcane_artillery_3p.png"), [3]);
  assert.deepEqual(parsePlayerCounts("bloody-grail-4p.png"), [4]);
  assert.deepEqual(parsePlayerCounts("trial_by_combat-2.4p.png"), [2, 4]);
  assert.deepEqual(parsePlayerCounts("say_no_more_2-4p.png"), [2, 3, 4]);
  assert.deepEqual(parsePlayerCounts("x_1-2_4-6p.png"), [1, 2, 4, 5, 6]);
  assert.deepEqual(parsePlayerCounts("chain_link.png"), []);
  assert.deepEqual(parsePlayerCounts("the-hunt-2.png"), [], "a bare number is not a player count");
  assert.deepEqual(parsePlayerCounts("big_9p.png"), [], "counts beyond six are dropped");
});

test("a count parsed back from a derived name derives the same name", () => {
  for (const counts of [[], [4], [2, 3, 4], [2, 4], [1, 2, 4, 5, 6]]) {
    const name = mapImageName("say_no_more", counts);
    assert.deepEqual(parsePlayerCounts(name), counts, name);
  }
});

// Tier 1 check of the welcome screen's name rule.
import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SCENARIO_NAME_LENGTH,
  MIN_SCENARIO_NAME_LENGTH,
  validateScenarioName,
} from "../../shared/scenario-name.js";

test("a title of letters, digits, spaces, hyphens and apostrophes is valid", () => {
  for (const name of ["The Queen's Gambit", "Bloody Grail 2", "Half-Way House", "Zażółć gęślą jaźń"]) {
    assert.deepEqual(validateScenarioName(name), { valid: true, message: "" }, name);
  }
});

test("surrounding spaces do not count towards the length", () => {
  assert.equal(validateScenarioName("  ab  ").valid, false);
  assert.equal(validateScenarioName(`  ${"a".repeat(MIN_SCENARIO_NAME_LENGTH)}  `).valid, true);
});

test("an empty name asks for one rather than complaining about its length", () => {
  const check = validateScenarioName("   ");
  assert.equal(check.valid, false);
  assert.match(check.message, /Name your scenario/);
});

test("a name past the field's own maxlength is rejected", () => {
  assert.equal(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH)).valid, true);
  assert.equal(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH + 1)).valid, false);
});

test("punctuation a file name or a branch would swallow is rejected", () => {
  // sanitizeFilename() and slugify() would fold all of these away, leaving a
  // name the contributor never typed.
  for (const name of ["bad/name", "name?", "name.tex", "name_two", "a@b", "#hash", "<tag>"]) {
    const check = validateScenarioName(name);
    assert.equal(check.valid, false, name);
    assert.match(check.message, /letters, digits, spaces/);
  }
});

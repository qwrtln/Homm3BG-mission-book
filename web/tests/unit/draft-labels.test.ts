import assert from "node:assert/strict";
import { test } from "node:test";
import { draftLabel, draftParts } from "../../app/modules/draft-labels.ts";

test("draftParts splits a draft path into its title and game mode", () => {
  assert.deepEqual(draftParts("draft-scenarios/clash/kyrre_link.tex"), { title: "Kyrre Link", mode: "Clash" });
  assert.deepEqual(draftParts("draft-scenarios/coops/the-keep.tex"), { title: "The Keep", mode: "Cooperative" });
  assert.deepEqual(draftParts("draft-scenarios/alliances/siemaneczko.tex"), { title: "Siemaneczko", mode: "Alliance" });
});

test("draftParts reads the mode of a Mission Book path too", () => {
  assert.deepEqual(draftParts("campaigns/queens_gambit.tex"), { title: "Queens Gambit", mode: "Campaign" });
});

test("draftParts has no mode outside a known category", () => {
  assert.deepEqual(draftParts("sections/random_scenario.tex"), { title: "Random Scenario", mode: null });
});

test("draftLabel puts the name first, then the mode", () => {
  assert.equal(draftLabel("draft-scenarios/clash/kyrre_link.tex"), "Kyrre Link (Clash)");
  assert.equal(draftLabel("sections/random_scenario.tex"), "Random Scenario");
});

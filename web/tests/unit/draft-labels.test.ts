import assert from "node:assert/strict";
import { test } from "node:test";
import { draftParts, entryLabel } from "../../app/modules/draft-labels.ts";

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

test("entryLabel puts the name first, then the mode", () => {
  assert.equal(entryLabel({ path: "draft-scenarios/clash/kyrre_link.tex", state: "synced" }), "Kyrre Link (Clash)");
  assert.equal(entryLabel({ path: "sections/random_scenario.tex", state: "synced" }), "Random Scenario");
});

test("entryLabel names a row by its heading's title when the local copy has one", () => {
  const local = {
    path: "draft-scenarios/campaigns/unknow.tex",
    textSha: "T",
    baseSha: null,
    staged: false,
    updatedAt: null,
  };
  const entry = { path: local.path, state: "local-only" as const };
  assert.equal(entryLabel({ ...entry, local: { ...local, title: "Wur" } }), "Wur (Campaign)");
  assert.equal(entryLabel({ ...entry, local: { ...local, title: null } }), "Unknow (Campaign)");
});

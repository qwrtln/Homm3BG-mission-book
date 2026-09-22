import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoute, parseRoute, pathToSlug, slugToPath } from "../../shared/route.js";

test("parses drafts and updates addresses", () => {
  assert.deepEqual(parseRoute("#/drafts/my_scenario"), { kind: "drafts", slug: "my_scenario" });
  assert.deepEqual(parseRoute("#/updates/gold_rush/"), { kind: "updates", slug: "gold_rush" });
});

test("rejects anything else", () => {
  for (const hash of ["", "#", "#/other/x", "#/drafts/", "#/drafts/a//b", "#/drafts/../x", "#/drafts/%E0%A4%A"]) {
    assert.equal(parseRoute(hash), null, hash);
  }
});

test("build and parse round-trip", () => {
  const route = { kind: "drafts", slug: "kyrre link" };
  assert.deepEqual(parseRoute(buildRoute(route.kind, route.slug)), route);
});

test("category keeps same-named scenarios apart", () => {
  const clash = pathToSlug("drafts", "draft-scenarios/clash/gold_rush.tex");
  const coop = pathToSlug("drafts", "draft-scenarios/coops/gold_rush.tex");
  assert.equal(clash, "clash/gold_rush");
  assert.notEqual(clash, coop);
  assert.equal(slugToPath("drafts", clash), "draft-scenarios/clash/gold_rush.tex");
});

test("an update address is the full path", () => {
  const slug = pathToSlug("updates", "campaigns/queens_gambit/one.tex");
  assert.equal(slug, "campaigns/queens_gambit/one");
  assert.equal(slugToPath("updates", slug), "campaigns/queens_gambit/one.tex");
  assert.deepEqual(parseRoute(buildRoute("updates", slug)), { kind: "updates", slug });
});

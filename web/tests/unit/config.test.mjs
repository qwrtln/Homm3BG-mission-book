// Tier 1 unit tests for web/app/modules/config.js.
//
// The module is importable under Node only because busytexBase() reads
// `document` inside the function instead of at module scope. That is what this
// file's very existence proves; busytexBase() itself is browser-only and is
// covered by tier 2, not here.
import test from "node:test";
import assert from "node:assert/strict";

import {
  publishedPdfUrl, PUBLISHED_PDF_REPO, CATEGORY_LABELS, CATEGORY_ORDER, TEMPLATES, REPO,
} from "../../app/modules/config.js";

test("publishedPdfUrl points at the branch the nightly build publishes to", () => {
  assert.equal(
    publishedPdfUrl("astral_run"),
    `${PUBLISHED_PDF_REPO}/en-astral_run-color/astral_run_en.pdf`,
  );
});

test("publishedPdfUrl takes a bare basename, not a path and not a .tex name", () => {
  // The caller is expected to have run basenameNoExt first; the two branch
  // names below are what a path or an extension would produce.
  assert.equal(
    publishedPdfUrl("gold_rush"),
    "https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts"
      + "/en-gold_rush-color/gold_rush_en.pdf",
  );
  assert.ok(
    publishedPdfUrl("clash/gold_rush").includes("en-clash/gold_rush-color"),
    "a path is pasted in as-is, so the caller must strip it",
  );
});

test("every CATEGORY_LABELS value has a place in CATEGORY_ORDER", () => {
  // search.js sorts groups by CATEGORY_ORDER.indexOf(category), and a label
  // that is missing there sorts to -1, ahead of everything.
  const unordered = Object.values(CATEGORY_LABELS).filter((label) => !CATEGORY_ORDER.includes(label));
  assert.deepEqual(unordered, []);
  assert.equal(new Set(CATEGORY_ORDER).size, CATEGORY_ORDER.length, "no duplicate rank");
});

test("the constants that cross into a URL stay relative to this page", () => {
  assert.equal(REPO, "../repo");
  for (const [kind, template] of Object.entries(TEMPLATES)) {
    assert.ok(template.path.endsWith(".tex"), `${kind} must be a scenario-shaped .tex file`);
    assert.ok(!template.path.startsWith("/"), `${kind} must not be root-absolute`);
    assert.ok(template.title.length > 0);
  }
});

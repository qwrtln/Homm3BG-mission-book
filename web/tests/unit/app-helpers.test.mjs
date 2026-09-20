// Tier 1 unit tests for the pure helpers already exported from
// web/app/modules/. These modules touch the DOM inside their functions, but
// not at import time, so Node loads them without a DOM.
import test from "node:test";
import assert from "node:assert/strict";

import { basenameNoExt, escapeHtml, sanitizeFilename } from "../../app/modules/dom.js";
import { storageKey } from "../../app/modules/drafts.js";

test("escapeHtml neutralises the three characters that break markup", () => {
  assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml(42), "42", "a non-string is coerced, not crashed on");
});

test("basenameNoExt takes the file name and drops only a .tex suffix", () => {
  assert.equal(basenameNoExt("clash/astral_run.tex"), "astral_run");
  assert.equal(basenameNoExt("draft-scenarios/coops/gold_rush.tex"), "gold_rush");
  assert.equal(basenameNoExt("astral_run"), "astral_run");
  assert.equal(basenameNoExt("cover.tex.png"), "cover.tex.png", "only a trailing .tex is a suffix");
});

test("sanitizeFilename produces a safe .tex basename", () => {
  assert.equal(sanitizeFilename("  Astral Run  "), "astral_run");
  assert.equal(sanitizeFilename("Bloody Grail: Part II"), "bloody_grail_part_ii");
  assert.equal(sanitizeFilename("keep-the-dashes"), "keep-the-dashes");
  assert.equal(sanitizeFilename("!!!"), "untitled", "a name with nothing usable still yields a file name");
  assert.equal(sanitizeFilename(""), "untitled");
});

test("storageKey namespaces a draft by its repository path", () => {
  assert.equal(storageKey("clash/astral_run.tex"), "wasm-scenario-builder:draft:clash/astral_run.tex");
  assert.notEqual(storageKey("clash/x.tex"), storageKey("coops/x.tex"), "two books never share one draft");
});

test("sanitizeUploadName makes an upload name safe for git paths and TeX", async () => {
  const { sanitizeUploadName } = await import("../../app/modules/uploads.js");
  assert.equal(sanitizeUploadName("my cover pic.png"), "my_cover_pic.png");
  assert.equal(sanitizeUploadName("  a  b (1)#.JPG "), "a_b_1.JPG");
  assert.equal(sanitizeUploadName("map{1}%.png"), "map1.png");
  assert.equal(sanitizeUploadName("???"), "image");
});

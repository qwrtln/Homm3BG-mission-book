// Tier 1 check of the PNG export's file-naming rules.

import assert from "node:assert/strict";
import test from "node:test";

import { PNG_DPI, pageArchiveName, pageImageName } from "../../shared/page-images.ts";

test("a page's image name is the stem, an underscore and the page number, with no zero padding", () => {
  assert.equal(pageImageName("bloody_grail", 1), "bloody_grail_1.png");
  assert.equal(pageImageName("bloody_grail", 12), "bloody_grail_12.png");
});

test("the archive name is the stem with a .zip extension", () => {
  assert.equal(pageArchiveName("bloody_grail"), "bloody_grail.zip");
});

test("the export resolution is fixed at 200 DPI", () => {
  assert.equal(PNG_DPI, 200);
});

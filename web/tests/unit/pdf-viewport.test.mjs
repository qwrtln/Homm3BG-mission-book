// Tier 1 check of the PDF pane's zoom steps and of the scroll anchor that
// keeps the reader's place across rebuilds and zoom changes.

import assert from "node:assert/strict";
import test from "node:test";

import { anchorScrollTop, scrollAnchor, ZOOM_STEPS, zoomStep } from "../../shared/pdf-viewport.js";

test("zoom steps up and down from fit-to-width", () => {
  assert.equal(zoomStep(1, 1), 1.25);
  assert.equal(zoomStep(1, -1), 0.8);
});

test("zoom stops at either end", () => {
  const last = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  assert.equal(zoomStep(last, 1), last);
  assert.equal(zoomStep(ZOOM_STEPS[0], -1), ZOOM_STEPS[0]);
});

test("a zoom between two steps moves to the nearer one in that direction", () => {
  assert.equal(zoomStep(1.1, 1), 1.25);
  assert.equal(zoomStep(1.1, -1), 1);
});

// Three 1000px pages, 10px margin above the first and 10px gaps between.
const PAGES = [
  { top: 10, height: 1000 },
  { top: 1020, height: 1000 },
  { top: 2030, height: 1000 },
];

test("the anchor names the page at the top edge and how far down it is", () => {
  assert.deepEqual(scrollAnchor(PAGES, 1270), { page: 1, offset: 0.25 });
});

test("the margin above the first page anchors to its top", () => {
  assert.deepEqual(scrollAnchor(PAGES, 0), { page: 0, offset: 0 });
});

test("a gap between pages anchors to the next page's top", () => {
  assert.deepEqual(scrollAnchor(PAGES, 1015), { page: 1, offset: 0 });
});

test("an empty document anchors to its start", () => {
  assert.deepEqual(scrollAnchor([], 300), { page: 0, offset: 0 });
  assert.equal(anchorScrollTop([], { page: 2, offset: 0.5 }), 0);
});

test("an anchor survives a zoom: same page, same share of it", () => {
  const anchor = scrollAnchor(PAGES, 2280);
  const zoomed = PAGES.map(({ top, height }) => ({ top: top * 2, height: height * 2 }));
  assert.equal(anchorScrollTop(zoomed, anchor), 4060 + 500);
});

test("the start of the document keeps the margin above the first page", () => {
  assert.equal(anchorScrollTop(PAGES, { page: 0, offset: 0 }), 0);
});

test("an anchor past the last page goes to the end of the last page", () => {
  assert.equal(anchorScrollTop(PAGES.slice(0, 2), { page: 2, offset: 0.4 }), 2020);
});

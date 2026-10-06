// Tier 1 check of the SyncTeX reader that maps changed source lines to
// places on the built PDF's pages, and of the line diff that finds them.

import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { changedLines } from "../../shared/line-diff.ts";
import { gunzipText, inputTag, lineRects, pageHighlights, parseSynctex } from "../../shared/synctex.ts";

// 65781.76 scaled points to the PDF point, so these read as whole points.
const PT = 65781.76;
const sp = (points: number): number => Math.round(points * PT);

// Shaped like the engine's output: a form shipped out as "{1 ... }0" before
// the first page, a full-page background box, and paragraph lines tagged
// with where the paragraph ended (line 4, or 9) while the glyph runs, kerns
// and glue inside them carry the lines they came from.
const SAMPLE = [
  "SyncTeX Version:1",
  "Input:1:/home/web_user/project_dir/./main.tex",
  "Input:2:/home/web_user/project_dir/./clash/probe.tex",
  "Output:pdf",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "!100",
  "{1",
  `(2,9:0,${sp(72)}:${sp(72)},${sp(72)},0`,
  ")",
  "}0",
  "{1",
  `[2,3:0,0:${sp(595)},${sp(842)},0`,
  `(2,3:0,${sp(842)}:${sp(595)},${sp(842)},0`,
  ")",
  `(2,4:${sp(50)},${sp(110)}:${sp(400)},${sp(10)},${sp(2)}`,
  `x2,5:${sp(60)},${sp(110)}`,
  `g2,5:${sp(90)},${sp(110)}`,
  ")",
  `g2,6:${sp(50)},${sp(115)}`,
  `(2,4:${sp(50)},${sp(130)}:${sp(400)},${sp(10)},${sp(2)}`,
  `k2,7,-1:${sp(70)},${sp(130)}:${sp(3)}`,
  ")",
  "]",
  "}1",
  "{2",
  `(2,9:${sp(50)},${sp(110)}:${sp(200)},${sp(10)},0`,
  `x2,8:${sp(50)},${sp(110)}`,
  ")",
  "}2",
  "Postamble:",
  "Count:12",
].join("\n");

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height };
}

/**
 * Rounds a rect to whole points, so a comparison ignores the last bits of a
 * division.
 *
 * @param r the rectangle to round
 */
function rounded(r: { left: number; top: number; width: number; height: number }) {
  return rect(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height));
}

test("a source path resolves to the tag TeX gave it", () => {
  const synctex = parseSynctex(SAMPLE);
  assert.equal(inputTag(synctex, "clash/probe.tex"), 2);
  assert.equal(inputTag(synctex, "main.tex"), 1);
  assert.equal(inputTag(synctex, "clash/other.tex"), null);
});

test("a glyph run marks its hbox, in points from the page's top-left", () => {
  const rects = lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([8]));
  assert.deepEqual([...rects.keys()], [2]);
  assert.deepEqual(rects.get(2)?.map(rounded), [rect(50, 100, 200, 10)]);
});

test("an hbox's own line marks nothing: TeX tags it where the paragraph ended", () => {
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([4])).size, 0);
});

test("glue inside an hbox marks that hbox for the glue's line", () => {
  const rects = lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([5]));
  assert.deepEqual(rects.get(1)?.map(rounded), [rect(50, 100, 400, 12)]);
});

test("a kern with a column still marks its hbox", () => {
  const rects = lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([7]));
  assert.deepEqual(rects.get(1)?.map(rounded), [rect(50, 120, 400, 12)]);
});

test("glue straight in a vbox marks nothing", () => {
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([6])).size, 0);
});

test("a form shipped out as {1 ... }0 is no page", () => {
  // Line 9 also tags the page-2 hbox, which holds no line-9 record.
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([9])).size, 0);
});

test("a box several changed lines share is marked once", () => {
  const rects = lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([5, 7]));
  assert.equal(rects.get(1)?.length, 2);
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([5])).get(1)?.length, 1);
});

test("a file TeX never read has no boxes", () => {
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/other.tex", new Set([4])).size, 0);
});

test("unit and magnification scale the coordinates", () => {
  const text = SAMPLE.replace("Unit:1", "Unit:2").replace("Magnification:1000", "Magnification:500");
  const rects = lineRects(parseSynctex(text), "clash/probe.tex", new Set([8]));
  assert.deepEqual(rects.get(2)?.map(rounded), [rect(50, 100, 200, 10)]);
});

test("garbage yields no boxes, not an error", () => {
  const synctex = parseSynctex("not synctex\n{1\n(broken\n}1");
  assert.deepEqual(synctex.boxes, []);
});

test("a full-page box is no highlight, and neither is a box inside a kept one", () => {
  const page = rect(0, 0, 595, 842);
  const line = rect(50, 100, 400, 12);
  const word = rect(60, 101, 30, 10);
  assert.deepEqual(pageHighlights([page, line, word], 595, 842), [line]);
});

test("of two boxes equal but for rounding, one stays", () => {
  const line = rect(50, 100, 400, 12);
  assert.deepEqual(pageHighlights([line, { ...line, width: 400.1 }], 595, 842), [line]);
});

test("a band as wide as the page is no highlight", () => {
  assert.deepEqual(pageHighlights([rect(0, 800, 595, 42), rect(0, 675, 1701, 167)], 595, 842), []);
});

test("the engine's gzip unpacks to text", async () => {
  assert.equal(await gunzipText(new Uint8Array(gzipSync(SAMPLE))), SAMPLE);
});

test("an unchanged source has no changed lines", () => {
  assert.deepEqual([...changedLines("a\nb\nc", "a\nb\nc")], []);
});

test("an edited line is changed", () => {
  assert.deepEqual([...changedLines("a\nb\nc", "a\nB\nc")], [2]);
});

test("added lines are changed", () => {
  assert.deepEqual([...changedLines("a\nc", "a\nb1\nb2\nc")].sort(), [2, 3]);
});

test("a removal marks the line now in its place", () => {
  assert.deepEqual([...changedLines("a\nb\nc", "a\nc")], [2]);
});

test("a removal at the end marks the new last line", () => {
  assert.deepEqual([...changedLines("a\nb\nc", "a\nb")], [2]);
});

test("edits in two places mark both and nothing between", () => {
  const before = ["x", "a", "b", "c", "d", "y"].join("\n");
  const after = ["x", "A", "b", "c", "D", "y"].join("\n");
  assert.deepEqual([...changedLines(before, after)].sort(), [2, 5]);
});

// Tier 1 check of the SyncTeX reader that maps changed source lines to
// places on the built PDF's pages, and of the line diff that finds them.

import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { changedLines, mapLine } from "../../shared/line-diff.ts";
import { gunzipText, inputTag, lineRects, pageHighlights, parseSynctex, sourceAt } from "../../shared/synctex.ts";

// 65781.76 scaled points to the PDF point, so these read as whole points.
const PT = 65781.76;
const sp = (points: number): number => Math.round(points * PT);

// Shaped like the engine's output: a form shipped out as "{1 ... }0" before
// the first page, a full-page background box, and paragraph lines tagged
// with where the paragraph ended (line 10, or 9) while the glyph runs, kerns
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
  `(2,10:${sp(50)},${sp(110)}:${sp(400)},${sp(10)},${sp(2)}`,
  `x2,5:${sp(60)},${sp(110)}`,
  `g2,5:${sp(90)},${sp(110)}`,
  ")",
  `g2,6:${sp(50)},${sp(115)}`,
  `(2,10:${sp(50)},${sp(130)}:${sp(400)},${sp(10)},${sp(2)}`,
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
  assert.equal(lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([10])).size, 0);
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

// Three records in one hbox (x 50..450, y 100..112) on a page of
// 595x842 points.
const PAGE = { width: 595, height: 842 };

const TWO_RECORDS = [
  "SyncTeX Version:1",
  "Input:1:/home/web_user/project_dir/./clash/probe.tex",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "{1",
  `(1,20:${sp(50)},${sp(110)}:${sp(400)},${sp(10)},${sp(2)}`,
  `x1,5:${sp(60)},${sp(110)}`,
  `x1,6:${sp(200)},${sp(110)}`,
  `x1,7:${sp(350)},${sp(110)}`,
  ")",
  "}1",
].join("\n");

test("records in one hbox resolve by their own x", () => {
  const synctex = parseSynctex(TWO_RECORDS);
  const at = (x: number) => sourceAt(synctex, "clash/probe.tex", 1, { x, y: 105 }, PAGE);
  assert.equal(at(52), 5);
  assert.equal(at(60), 5);
  assert.equal(at(199), 5);
  assert.equal(at(250), 6);
  assert.equal(at(440), 7);
});

test("a record keeps its own left edge", () => {
  const xs = parseSynctex(TWO_RECORDS).boxes.map((box) => Math.round(box.x));
  assert.deepEqual(xs, [60, 200, 350]);
});

test("the smallest rect around the point wins over an enclosing one", () => {
  // Line 8's hbox (y 100..112, x 50..450) lies inside the vbox-sized line 10/5 box.
  const synctex = parseSynctex(SAMPLE);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 100, y: 105 }, PAGE), 5);
  const nested = SAMPLE.replace(
    `(2,10:${sp(50)},${sp(130)}:${sp(400)},${sp(10)},${sp(2)}`,
    `(2,40:${sp(40)},${sp(130)}:${sp(500)},${sp(40)},${sp(2)}\ng2,30:${sp(40)},${sp(130)}\n)\n(2,10:${sp(50)},${sp(130)}:${sp(400)},${sp(10)},${sp(2)}`,
  );
  assert.equal(sourceAt(parseSynctex(nested), "clash/probe.tex", 1, { x: 100, y: 125 }, PAGE), 7);
});

test("a full-page box never wins, even as the only box at the point", () => {
  const text = [
    "Input:1:/home/web_user/project_dir/./clash/probe.tex",
    "Magnification:1000",
    "Unit:1",
    "{1",
    `(1,3:0,${sp(842)}:${sp(595)},${sp(842)},0`,
    `x1,3:0,${sp(842)}`,
    ")",
    "}1",
  ].join("\n");
  assert.equal(sourceAt(parseSynctex(text), "clash/probe.tex", 1, { x: 300, y: 400 }, PAGE), null);
});

// An image: a rule record sized as the picture, in its hbox, as the engine
// writes it, above a line of text.
const WITH_IMAGE = [
  "Input:1:/home/web_user/project_dir/./clash/probe.tex",
  "Magnification:1000",
  "Unit:1",
  "{1",
  `(1,50:${sp(100)},${sp(300)}:${sp(200)},${sp(200)},0`,
  `r1,50:${sp(300)},${sp(300)}:${sp(200)},${sp(200)},0`,
  ")",
  `(1,60:${sp(100)},${sp(250)}:${sp(200)},${sp(10)},0`,
  `x1,60:${sp(100)},${sp(250)}`,
  ")",
  "}1",
].join("\n");

test("an image box resolves to its own line, and is marked as an image", () => {
  const synctex = parseSynctex(WITH_IMAGE);
  assert.equal(synctex.boxes[0].image, true);
  assert.equal(Math.round(synctex.boxes[0].x), 100);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 150, y: 150 }, PAGE), 50);
});

test("text over an image wins over the image", () => {
  assert.equal(sourceAt(parseSynctex(WITH_IMAGE), "clash/probe.tex", 1, { x: 150, y: 245 }, PAGE), 60);
});

test("a thin rule is no image", () => {
  const text = WITH_IMAGE.replace(`${sp(200)},${sp(200)},0\n)\n(1,60`, `${sp(200)},${sp(1)},0\n)\n(1,60`);
  assert.equal(parseSynctex(text).boxes[0].image, undefined);
});

test("a miss resolves to the nearest text", () => {
  const synctex = parseSynctex(SAMPLE);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 300, y: 300 }, PAGE), 7);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 300, y: 96 }, PAGE), 5);
});

test("another file's boxes and an unknown path give null", () => {
  const synctex = parseSynctex(SAMPLE);
  assert.equal(sourceAt(synctex, "main.tex", 1, { x: 100, y: 105 }, PAGE), null);
  assert.equal(sourceAt(synctex, "clash/other.tex", 1, { x: 100, y: 105 }, PAGE), null);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 3, { x: 100, y: 105 }, PAGE), null);
});

test("lineRects output is unchanged for SAMPLE", () => {
  const rects = lineRects(parseSynctex(SAMPLE), "clash/probe.tex", new Set([5, 7, 8]));
  assert.deepEqual(
    [...rects].map(([page, list]) => [page, list.map(rounded)]),
    [
      [1, [rect(50, 100, 400, 12), rect(50, 120, 400, 12)]],
      [2, [rect(50, 100, 200, 10)]],
    ],
  );
});

// Trimmed from a capture of clash/bloody_grail.tex on the real engine: the
// map image at line 134, a rule record inside nested hboxes, h at its right
// edge. Coordinates are the file's own scaled points.
const CAPTURED_IMAGE = [
  "SyncTeX Version:1",
  "Input:1:/home/web_user/project_dir/./main.tex",
  "Input:236:/home/web_user/project_dir/./clash/bloody_grail.tex",
  "Output:pdf",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "{2",
  "(236,134:2797019,5317590:0,0,0",
  "g236,134:2797019,5317590",
  ")",
  "(236,134:2787448,22151622:16801252,15021275,0",
  "(236,134:2787448,22151622:16801293,15021311,0",
  "(236,134:2787448,22151622:0,91041956,0",
  "(236,134:2787448,22151622:101830164,91041956,0",
  "r236,134:104617612,22151622:101830164,91041956,0",
  ")",
  "k235,1:2787448,22151622:16801293",
  "g236,134:19588741,22151622",
  ")",
  ")",
  ")",
  "}2",
].join("\n");

test("a point on a captured image resolves to its includegraphics line", () => {
  const synctex = parseSynctex(CAPTURED_IMAGE);
  const image = synctex.boxes.find((box) => box.image);
  assert.ok(image);
  const centre = { x: image.rect.left + image.rect.width / 2, y: image.rect.top + image.rect.height / 2 };
  assert.equal(sourceAt(synctex, "clash/bloody_grail.tex", 2, centre, { width: 595, height: 842 }), 134);
});

// Trimmed from a capture of coops/titans_stronghold.tex on the real engine:
// page 1 broke at line 89, so the multicols column box and the kerns and glyph
// runs LuaTeX added at ship-out all carry line 89, inside the author line (6)
// and the source line (8) below it.
const CAPTURED_COLUMN = [
  "SyncTeX Version:1",
  "Input:236:/home/web_user/project_dir/./coops/titans_stronghold.tex",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "{1",
  "(236,89:2797019,49786951:33564238,38164147,152568",
  "[236,89:2797019,11622804:15849779,38164147,0",
  "(236,7:2797019,12409236:15849779,550502,7864",
  "h236,6:2763989,12409236:0,0,0",
  "x236,6:3432456,0",
  "k236,89:2763989,12409236:-24379",
  "x236,89:3899597,0",
  "x236,89:5786247,0",
  "g236,6:6042624,12409236",
  "x236,6:6748053,0",
  "k236,89:6042624,12409236:-21234",
  "x236,89:7133404,0",
  "x236,89:7497522,0",
  "x236,89:9579995,0",
  "g236,7:18646798,12409236",
  ")",
  "(236,9:2797019,13752724:15849779,561512,16515",
  "h236,8:2797019,13752724:0,0,0",
  "x236,8:5627388,0",
  "k236,89:2797019,13752724:0",
  "g236,8:5883765,13752724",
  "x236,8:6760637,0",
  "g236,9:18646798,13752724",
  ")",
  "]",
  "g236,89:19598238,49786951",
  ")",
  "}1",
].join("\n");

test("records LuaTeX adds at ship-out do not take over a line", () => {
  const synctex = parseSynctex(CAPTURED_COLUMN);
  assert.ok(!synctex.boxes.some((box) => box.line === 89 && box.rect.height < 20));
  assert.equal(sourceAt(synctex, "coops/titans_stronghold.tex", 1, { x: 150, y: 184 }, PAGE), 6);
});

test("a click between lines of a column resolves to the nearest line, not the column", () => {
  const synctex = parseSynctex(CAPTURED_COLUMN);
  assert.equal(sourceAt(synctex, "coops/titans_stronghold.tex", 1, { x: 100, y: 197 }, PAGE), 8);
});

test("a box inside a typeset line does not make the line a container", () => {
  const text = [
    "Input:1:/home/web_user/project_dir/./clash/probe.tex",
    "Magnification:1000",
    "Unit:1",
    "{1",
    `(1,9:${sp(50)},${sp(110)}:${sp(400)},${sp(10)},${sp(2)}`,
    `x1,5:${sp(60)},${sp(110)}`,
    `(1,6:${sp(200)},${sp(110)}:${sp(12)},${sp(10)},0`,
    `x1,6:${sp(200)},${sp(110)}`,
    ")",
    `x1,7:${sp(300)},${sp(110)}`,
    ")",
    "}1",
  ].join("\n");
  assert.equal(sourceAt(parseSynctex(text), "clash/probe.tex", 1, { x: 350, y: 105 }, PAGE), 7);
});

// A page that broke at line 89: the full-page box, the footer band and the
// page number are shipped out with it, so they carry line 89 too.
const WITH_FOOTER = [
  "Input:1:/home/web_user/project_dir/./clash/probe.tex",
  "Magnification:1000",
  "Unit:1",
  "{1",
  `(1,89:0,${sp(842)}:${sp(595)},${sp(842)},0`,
  `g1,89:0,${sp(842)}`,
  ")",
  `(1,89:0,${sp(842)}:${sp(595)},${sp(42)},0`,
  `r1,89:${sp(595)},${sp(842)}:${sp(1200)},${sp(84)},0`,
  ")",
  `(1,89:${sp(43)},${sp(815)}:${sp(510)},${sp(8)},0`,
  `x1,89:${sp(290)},${sp(815)}`,
  ")",
  `(1,7:${sp(43)},${sp(188)}:${sp(241)},${sp(8)},0`,
  `x1,6:${sp(50)},${sp(188)}`,
  ")",
  "}1",
].join("\n");

test("the page's footer and page number map to no line", () => {
  const synctex = parseSynctex(WITH_FOOTER);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 295, y: 812 }, PAGE), null);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 20, y: 830 }, PAGE), null);
});

test("next to the footer, a miss still resolves to the nearest text", () => {
  const synctex = parseSynctex(WITH_FOOTER);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 100, y: 500 }, PAGE), 6);
  assert.equal(sourceAt(synctex, "clash/probe.tex", 1, { x: 100, y: 185 }, PAGE), 6);
});

test("an image wider than the minipage line that holds it wins over the line", () => {
  // \hfill on line 28, the image on line 29, in a minipage narrower than it.
  const text = [
    "Input:1:/home/web_user/project_dir/./clash/probe.tex",
    "Magnification:1000",
    "Unit:1",
    "{1",
    `(1,29:${sp(43)},${sp(714)}:${sp(238)},${sp(230)},0`,
    `g1,28:${sp(43)},${sp(714)}`,
    `(1,29:${sp(43)},${sp(714)}:${sp(262)},${sp(230)},0`,
    `r1,29:${sp(2043)},${sp(714)}:${sp(2000)},${sp(1750)},0`,
    ")",
    ")",
    "}1",
  ].join("\n");
  assert.equal(sourceAt(parseSynctex(text), "clash/probe.tex", 1, { x: 150, y: 600 }, PAGE), 29);
});

test("an unchanged text maps a line to itself", () => {
  assert.equal(mapLine("a\nb\nc", "a\nb\nc", 2), 2);
});

test("a line before the edit keeps its number", () => {
  assert.equal(mapLine("a\nb\nc\nd", "a\nb\nX\nd", 1), 1);
});

test("a line after the edit shifts by the change in line count", () => {
  assert.equal(mapLine("a\nb\nc\nd", "a\nb1\nb2\nc\nd", 4), 5);
  assert.equal(mapLine("a\nb\nc\nd", "a\nc\nd", 4), 3);
});

test("a line inside the edited block maps to the block's first line", () => {
  assert.equal(mapLine("a\nb\nc\nd", "a\nX\nY\nZ\nd", 3), 2);
});

test("a pure insert moves the lines after it, and a pure removal the lines after it back", () => {
  assert.equal(mapLine("a\nc", "a\nb\nc", 2), 3);
  assert.equal(mapLine("a\nb\nc", "a\nc", 3), 2);
  assert.equal(mapLine("a\nb\nc", "a\nc", 2), 2);
});

test("a mapped line stays within the text", () => {
  assert.equal(mapLine("a\nb\nc\nd", "a", 4), 1);
  assert.equal(mapLine("a", "a\nb", 1), 1);
  assert.equal(mapLine("a\nb\nc", "", 3), 1);
});

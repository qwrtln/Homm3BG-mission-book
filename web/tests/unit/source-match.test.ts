// Tier 1 check of the word match that narrows a double-click's SyncTeX line
// down to the source line holding the clicked words.

import assert from "node:assert/strict";
import test from "node:test";
import { gridAt, refineCell, refineLine, sourceLine, type TextRun, wordsAt } from "../../shared/source-match.ts";

// Shaped like coops/titans_stronghold.tex: a banner macro, an italic blurb
// read whole as one argument, and a table that is one macro argument with a
// blank line inside.
const SOURCE = [
  "% !TeX spellcheck = en_US", // 1
  "\\addscenariosection{1}{Cooperative Scenario}{Titans' Stronghold}{\\images/earthquake.png}", // 2
  "", // 3
  "\\textit{A long time ago, a mighty fortress was built.", // 4
  "  No one has ever entered and returned to tell the tale.\\\\", // 5
  "  If this legend of the empty fort is true, it's time for excavation.", // 6
  "}", // 7
  "", // 8
  "\\hommtable[]{28}{", // 9
  "  \\textbf{Strength of Titans' Stronghold Armies}\\\\", // 10
  "", // 11
  "  \\darkcell[1.2]{1 player}", // 12
  "    & \\lightcell[1.2]{3\\svg[12]{bronze} 2\\svg[12]{silver} 1\\svg[12]{golden}}\\\\", // 13
  "  \\darkcell[1.8]{3 players}", // 14
  "    & \\lightcell[1.8]{2\\svg[12]{bronze} 3\\svg[12]{silver} \\linebreak", // 15
  "      Then\\linebreak", // 16
  "      2\\svg[12]{bronze} 4\\svg[12]{silver}}\\\\", // 17
  "  \\darkcell[1.8]{4 players}", // 18
  "}", // 19
].join("\n");

const words = (
  word: string,
  before: string[] = [],
  after: string[] = [],
  above: string[] = [],
  below: string[] = [],
) => ({
  word,
  before,
  after,
  above,
  below,
});

test("a word of a multi-line argument resolves to its own line", () => {
  assert.equal(refineLine(SOURCE, 7, words("mighty", ["ago,", "a"], ["fortress", "was"])), 4);
  assert.equal(refineLine(SOURCE, 7, words("tale.", ["tell", "the"])), 5);
});

test("a word TeX hyphenated matches the start of the source word", () => {
  assert.equal(refineLine(SOURCE, 7, words("excava-", ["it's", "time", "for"])), 6);
});

test("case and punctuation do not matter", () => {
  assert.equal(refineLine(SOURCE, 3, words("STRONGHOLD", ["TITANS’"])), 2);
});

test("a blank line SyncTeX gives steps up to the line above", () => {
  assert.equal(refineLine(SOURCE, 3, null), 2);
});

test("the window reaches up to where the argument opens, past a blank line inside it", () => {
  assert.equal(refineLine(SOURCE, 19, words("Strength", [], ["of", "Titans'"])), 10);
});

test("the words in reading order pick the right row, not command options", () => {
  // With \\darkcell's [1.8] read as words, the 4-players row ties and wins.
  assert.equal(refineLine(SOURCE, 19, words("players", ["3"], ["8", "7", "4"])), 14);
  // Rows 13, 15 and 17 all hold a 2; only row 15 reads "2 3".
  assert.equal(refineLine(SOURCE, 19, words("2", [], ["3"])), 15);
  assert.equal(refineLine(SOURCE, 19, words("Then", ["3"], ["2", "4"])), 16);
  assert.equal(refineLine(SOURCE, 19, words("1", ["3", "2"], [])), 13);
});

test("SyncTeX's own line wins a tie", () => {
  assert.equal(refineLine(SOURCE, 17, words("2", [], [])), 17);
});

test("no match keeps SyncTeX's line", () => {
  assert.equal(refineLine(SOURCE, 7, words("dragon")), 7);
  assert.equal(refineLine(SOURCE, 7, null), 7);
});

test("the window stops at the paragraph's start", () => {
  // "Stronghold" is on line 2, but the blurb's paragraph starts at line 4.
  assert.equal(refineLine(SOURCE, 7, words("Stronghold")), 7);
});

test("a line outside the source is returned as it is", () => {
  assert.equal(refineLine(SOURCE, 99, words("mighty")), 99);
});

const RUNS: TextRun[] = [
  { str: "A long time ago, a", x: 50, y: 100, width: 80, height: 10 },
  { str: "mighty fortress", x: 133, y: 100, width: 60, height: 10 },
  { str: "was built.", x: 196, y: 100.2, width: 40, height: 10 },
  { str: "No one has", x: 50, y: 114, width: 45, height: 10 },
];

test("the word under a point comes with its neighbours on the same line", () => {
  assert.deepEqual(wordsAt(RUNS, { x: 140, y: 96 }), {
    word: "mighty",
    before: ["time", "ago,", "a"],
    after: ["fortress", "was", "built."],
    above: [],
    below: [],
  });
});

test("runs on another baseline are not neighbours", () => {
  assert.deepEqual(wordsAt(RUNS, { x: 52, y: 110 }), {
    word: "No",
    before: [],
    after: ["one", "has"],
    above: ["A long time ago, a"].flatMap((run) => run.split(" ")),
    below: [],
  });
});

test("no text under the point gives null", () => {
  assert.equal(wordsAt(RUNS, { x: 300, y: 96 }), null);
  assert.equal(wordsAt(RUNS, { x: 60, y: 130 }), null);
});

// Trimmed from the Titans' Stronghold table as pdf.js reads it: each number is
// its own run with its icon drawn after it, and the "Then" of every cell in a
// row shares one baseline with that row's single-line cells.
const TABLE: TextRun[] = [
  { str: "3 players", x: 71.1, y: 257.9, width: 47.1, height: 12 },
  { str: "8", x: 134.8, y: 259.8, width: 6, height: 12 },
  { str: "7", x: 157.6, y: 259.8, width: 6, height: 12 },
  { str: "2", x: 339.6, y: 245.4, width: 6, height: 12 },
  { str: "3", x: 362.5, y: 245.4, width: 6, height: 12 },
  { str: "4", x: 385.4, y: 245.4, width: 6, height: 12 },
  { str: "3", x: 408.2, y: 245.4, width: 6, height: 12 },
  { str: "Then", x: 370.9, y: 259.8, width: 24.6, height: 12 },
  { str: "2", x: 339.6, y: 274.3, width: 6, height: 12 },
  { str: "4", x: 362.5, y: 274.3, width: 6, height: 12 },
  { str: "3", x: 385.4, y: 274.3, width: 6, height: 12 },
  { str: "2", x: 408.2, y: 274.3, width: 6, height: 12 },
  { str: "1", x: 441.9, y: 245.4, width: 6, height: 12 },
  { str: "3", x: 464.8, y: 245.4, width: 6, height: 12 },
  { str: "5", x: 487.6, y: 245.4, width: 6, height: 12 },
  { str: "Then", x: 473.3, y: 259.8, width: 24.6, height: 12 },
  { str: "1", x: 441.9, y: 274.3, width: 6, height: 12 },
  { str: "4", x: 464.8, y: 274.3, width: 6, height: 12 },
];

// The row's two multi-line cells, as the scenario writes them.
const CELLS = [
  "\\hommtable[]{28}{", // 1
  "  \\darkcell[1.8]{3 players}", // 2
  "    & \\lightcell[1.8]{8\\svg[12]{bronze} 7\\svg[12]{silver}}", // 3
  "    & \\lightcell[1.8]{2\\svg[12]{bronze} 3\\svg[12]{silver} 4\\svg[12]{golden} 3\\svg[12]{azure} \\linebreak", // 4
  "      Then\\linebreak", // 5
  "      2\\svg[12]{bronze} 4\\svg[12]{silver} 3\\svg[12]{golden} 2\\svg[12]{azure}}", // 6
  "    & \\lightcell[1.8]{1\\svg[12]{bronze} 3\\svg[12]{silver} 5\\svg[12]{golden} \\linebreak", // 7
  "      Then\\linebreak", // 8
  "      1\\svg[12]{bronze} 4\\svg[12]{silver}}\\\\", // 9
  "}", // 10
].join("\n");

test("a word that reads the same in several cells resolves by the words above and below it", () => {
  const first = wordsAt(TABLE, { x: 380, y: 256 });
  assert.deepEqual(
    [first?.above, first?.below],
    [
      ["2", "3", "4", "3"],
      ["2", "4", "3", "2"],
    ],
  );
  assert.equal(refineLine(CELLS, 10, first), 5);
  assert.equal(refineLine(CELLS, 10, wordsAt(TABLE, { x: 483, y: 256 })), 8);
});

test("a point on an icon takes the number just left of it", () => {
  const clicked = wordsAt(TABLE, { x: 147, y: 255 });
  assert.equal(clicked?.word, "8");
  assert.equal(refineLine(CELLS, 10, clicked), 3);
});

test("a point right of a number by more than an icon's width is no word", () => {
  assert.equal(wordsAt(TABLE, { x: 220, y: 255 }), null);
});

test("a sign before a number tells table rows apart", () => {
  // From clash/trial_by_combat.tex: rows that differ only in their signs.
  const rows = [
    "\\hommtablemulticol[]{32}{", // 1
    "  \\darkcell[1.4]{-1/-1}", // 2
    "    & \\lightcell[1.4]{Dense Fog – All Units gain disadvantage.}\\\\", // 3
    "  \\darkcell[1.4]{0/-1}", // 4
    "    & \\lightcell[1.4]{Sinking Mud – All Units move one space less.}\\\\", // 5
    "  \\darkcell[1.4]{+1/+1}", // 6
    "    & \\lightcell[1.4]{Perfect Conditions – All Units gain advantage.}\\\\", // 7
    "}", // 8
  ].join("\n");
  assert.equal(refineLine(rows, 8, words("-1/-1", [], ["Dense", "Fog"])), 2);
  assert.equal(refineLine(rows, 8, words("\u22121/\u22121")), 2);
  assert.equal(refineLine(rows, 8, words("0/-1")), 4);
  assert.equal(refineLine(rows, 8, words("+1/+1")), 6);
});

// From coops/close_to_enemies.tex: cells of icons only, so no text to match.
const ICON_TABLE = [
  "\\begin{table*}[b!]", // 1
  "  \\hommtable[]{18}{", // 2
  "    \\textbf{Enemy Clan Armies}\\\\", // 3
  "", // 4
  "    \\begin{tabularx}{0.95\\linewidth}{p{0.2\\linewidth}XXXX} &", // 5
  "      \\darkcell{\\textbf{Easy}} &", // 6
  "      \\darkcell{\\textbf{Normal}} &", // 7
  "      \\darkcell{\\textbf{Hard}} &", // 8
  "      \\darkcell{\\textbf{Impossible}}\\\\", // 9
  "      \\darkcell[1.2]{First wave}", // 10
  "        & \\lightcell[1.2]{\\svg[12]{bronze}}", // 11
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{bronze}}", // 12
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{bronze}\\svg[12]{bronze}}", // 13
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{bronze}\\svg[12]{silver}} \\\\", // 14
  "", // 15
  "      \\darkcell[1.2]{Second wave}", // 16
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{bronze}}", // 17
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{bronze}\\svg[12]{silver}}", // 18
  "        & \\lightcell[1.2]{\\svg[12]{bronze}\\svg[12]{silver}\\svg[12]{silver}}", // 19
  "        & \\lightcell[1.2]{\\svg[12]{silver}\\svg[12]{silver}\\svg[12]{silver}} \\\\", // 20
  "    \\end{tabularx}", // 21
  "  }", // 22
  "\\end{table*}", // 23
].join("\n");

// The same table's text as pdf.js would read it: a title, the header row,
// and the row labels; the icons are no text.
const ICON_RUNS: TextRun[] = [
  { str: "Enemy Clan Armies", x: 240, y: 100, width: 110, height: 12 },
  { str: "Easy", x: 175, y: 135, width: 25, height: 12 },
  { str: "Normal", x: 265, y: 135, width: 39, height: 12 },
  { str: "Hard", x: 370, y: 135, width: 27, height: 12 },
  { str: "Impossible", x: 455, y: 135, width: 55, height: 12 },
  { str: "First wave", x: 70, y: 172, width: 50, height: 12 },
  { str: "Second wave", x: 65, y: 210, width: 60, height: 12 },
  { str: "Third wave", x: 69, y: 248, width: 52, height: 12 },
  { str: "Settlement", x: 68, y: 280, width: 54, height: 12 },
  { str: "Defenders", x: 70, y: 294, width: 50, height: 12 },
];

test("a point with no text near it is placed by its row's text and its column's", () => {
  assert.equal(wordsAt(ICON_RUNS, { x: 360, y: 166 }), null);
  assert.deepEqual(gridAt(ICON_RUNS, { x: 360, y: 166 }), { row: "First wave", column: "Hard" });
  assert.deepEqual(gridAt(ICON_RUNS, { x: 160, y: 205 }), { row: "Second wave", column: "Easy" });
  // A wider label above, and a label wrapped over two lines, are not columns.
  assert.deepEqual(gridAt(ICON_RUNS, { x: 360, y: 243 }), { row: "Third wave", column: "Hard" });
  assert.deepEqual(gridAt(ICON_RUNS, { x: 470, y: 290 }), { row: "Defenders", column: "Impossible" });
});

test("a row and a column resolve to the cell's line by counting separators", () => {
  assert.equal(refineCell(ICON_TABLE, 22, { row: "First wave", column: "Hard" }), 13);
  assert.equal(refineCell(ICON_TABLE, 22, { row: "First wave", column: "Easy" }), 11);
  assert.equal(refineCell(ICON_TABLE, 22, { row: "Second wave", column: "Impossible" }), 20);
  assert.equal(refineCell(ICON_TABLE, 22, { row: "Second wave", column: "Normal" }), 18);
});

test("an anchor that is not in the source keeps SyncTeX's line", () => {
  assert.equal(refineCell(ICON_TABLE, 22, { row: "Third wave", column: "Hard" }), 22);
});

test("outside a table, row and column text change nothing", () => {
  // A point beside the blurb, with blurb text on its row and above it.
  assert.equal(refineCell(SOURCE, 7, { row: "No one has ever", column: "A long time ago" }), 7);
});

test("the clicked word's neighbours count in place, not anywhere in the line", () => {
  // Titans' Stronghold, 2 players: "5 5 3 1" and "2 5 5 3" share four words
  // in order once the row label's 2 counts; only the first has them in place.
  const rows = [
    "\\hommtable[]{28}{", // 1
    "    & \\lightcell[1.2]{5\\svg[12]{bronze} 5\\svg[12]{silver} 3\\svg[12]{golden} 1\\svg[12]{azure}}", // 2
    "    & \\lightcell[1.2]{4\\svg[12]{bronze} 5\\svg[12]{silver} 3\\svg[12]{golden} 2\\svg[12]{azure}}", // 3
    "    & \\lightcell[1.2]{2\\svg[12]{bronze} 5\\svg[12]{silver} 5\\svg[12]{golden} 3\\svg[12]{azure}}\\\\", // 4
    "}", // 5
  ].join("\n");
  assert.equal(refineLine(rows, 5, words("5", ["2", "players", "5"], ["3", "1", "4"])), 2);
});

test("a cell's line above on the same source line, split by \\linebreak, counts", () => {
  const rows = [
    "\\hommtable[]{28}{", // 1
    "  \\darkcell[1.8]{4 players}", // 2
    "    & \\lightcell[1.8]{10\\svg[12]{bronze} 10\\svg[12]{silver}\\linebreak 6\\svg[12]{golden} 2\\svg[12]{azure}}", // 3
    "    & \\lightcell[1.8]{7\\svg[12]{bronze} 6\\svg[12]{silver} 3\\svg[12]{golden} 2\\svg[12]{azure}}\\\\", // 4
    "}", // 5
  ].join("\n");
  assert.equal(refineLine(rows, 5, words("6", [], ["2"], ["10", "10"])), 3);
});

test("on a tie, the cell's own lines above and below outrank the cells beside it", () => {
  // "6 7 5 3" twice: once beside a cell that matches the words before it,
  // once under a "Then", which is what the reader clicked.
  const rows = [
    "\\hommtable[]{28}{", // 1
    "    & \\lightcell[1.8]{7 7 5 2}", // 2
    "    & \\lightcell[1.8]{6 7 5 3}\\\\", // 3
    "    & \\lightcell[1.8]{6 8 4 3 \\linebreak", // 4
    "      Then\\linebreak", // 5
    "      6 7 5 3}", // 6
    "}", // 7
  ].join("\n");
  assert.equal(refineLine(rows, 7, words("6", ["7", "5", "2"], ["7", "5", "3"], ["Then"])), 6);
  assert.equal(refineLine(rows, 7, words("6", ["7", "5", "2"], ["7", "5", "3"])), 3);
});

// From draft-scenarios/alliances/gold_rush.tex: ordinals from \\nth, and
// dashes for "none".
const TRANCHES = [
  "\\hommtablemulticol[]{14}{", // 1
  "  \\textbf{Tranches depending on the variant}\\\\", // 2
  "  \\begin{tabularx}{0.95\\linewidth}{XXXX} \\darkcell{Round} & \\darkcell{Solo} & \\darkcell{1v1} & \\darkcell{2v2} \\\\", // 3
  "    \\darkcell{\\nth{4}}", // 4
  "    & \\lightcell{20 \\svg{gold}}", // 5
  "    & \\lightcell{15 \\svg{gold}}", // 6
  "    & \\lightcell{30 \\svg{gold}} \\\\", // 7
  "    \\darkcell{\\nth{12}}", // 8
  "    & \\lightcell{80 \\svg{gold}}", // 9
  "    & \\lightcell{–}", // 10
  "    & \\lightcell{–} \\\\", // 11
  "    \\darkcell{\\nth{13}}", // 12
  "    & \\lightcell{–}", // 13
  "    & \\lightcell{60 \\svg{gold}}", // 14
  "    & \\lightcell{120 \\svg{gold}} \\\\", // 15
  "  \\end{tabularx}", // 16
  "}", // 17
].join("\n");

const TRANCHE_RUNS: TextRun[] = [
  { str: "Round", x: 60, y: 100, width: 35, height: 10 },
  { str: "Solo", x: 140, y: 100, width: 25, height: 10 },
  { str: "1v1", x: 210, y: 100, width: 20, height: 10 },
  { str: "2v2", x: 280, y: 100, width: 20, height: 10 },
  { str: "4", x: 70, y: 120, width: 5, height: 10 },
  { str: "th", x: 75, y: 117, width: 7, height: 7 },
  { str: "20", x: 140, y: 120, width: 10, height: 10 },
  { str: "15", x: 210, y: 120, width: 10, height: 10 },
  { str: "30", x: 280, y: 120, width: 10, height: 10 },
  { str: "12th", x: 68, y: 140, width: 18, height: 10 },
  { str: "80", x: 140, y: 140, width: 10, height: 10 },
  { str: "–", x: 214, y: 140, width: 5, height: 10 },
  { str: "–", x: 284, y: 140, width: 5, height: 10 },
  { str: "13th", x: 68, y: 160, width: 18, height: 10 },
  { str: "–", x: 144, y: 160, width: 5, height: 10 },
  { str: "60", x: 210, y: 160, width: 10, height: 10 },
];

test("an ordinal matches the \\nth that prints it, as one run or two", () => {
  assert.equal(refineLine(TRANCHES, 17, words("4th", [], ["20", "15", "30"])), 4);
  assert.equal(refineLine(TRANCHES, 17, words("12th")), 8);
  assert.equal(sourceLine(TRANCHES, 17, TRANCHE_RUNS, { x: 72, y: 116 }), 4);
});

test("a dash for none resolves by its row and column", () => {
  assert.equal(sourceLine(TRANCHES, 17, TRANCHE_RUNS, { x: 216, y: 136 }), 10);
  assert.equal(sourceLine(TRANCHES, 17, TRANCHE_RUNS, { x: 286, y: 136 }), 11);
  assert.equal(sourceLine(TRANCHES, 17, TRANCHE_RUNS, { x: 146, y: 156 }), 13);
});

test("words still win over the grid, and nothing matched keeps SyncTeX's line", () => {
  assert.equal(sourceLine(TRANCHES, 17, TRANCHE_RUNS, { x: 213, y: 156 }), 14);
  assert.equal(sourceLine(TRANCHES, 17, [], { x: 213, y: 156 }), 17);
});

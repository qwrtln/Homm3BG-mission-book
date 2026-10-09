// SyncTeX tags a node with the line TeX is reading when it makes the node. A
// macro argument is read whole before it is typeset, so every word of
// \textit{...} or a table cell spread over lines 10 to 15 carries line 15.
// This module narrows such a line down with the words the reader clicked on:
// it reads the text under the point from the PDF and looks for it in the
// source lines just above the line SyncTeX gave.

/** A run of text on a PDF page, in PDF points from the page's top-left. */
export interface TextRun {
  str: string;
  /** left edge */
  x: number;
  /** baseline */
  y: number;
  width: number;
  height: number;
}

/**
 * The word under a point, the words around it on the same typeset line, and
 * the words just above and below it: in a table, its cell's other lines.
 */
export interface ClickedWords {
  word: string;
  before: string[];
  after: string[];
  above: string[];
  below: string[];
}

/** How many words on each side of the clicked one count as its context. */
const CONTEXT = 3;

/** How far above SyncTeX's line a paragraph or a macro argument may start, in source lines. */
const WINDOW = 200;

/** Whether a run's baseline is within half its height of another. */
function sameBaseline(run: TextRun, baseline: number, height: number): boolean {
  return Math.abs(run.y - baseline) < height * 0.5;
}

/** The run under a point, or else the one beside it on its line: an icon sits right after its number. */
function runAt(runs: TextRun[], point: { x: number; y: number }): { run: TextRun; x: number } | null {
  const text = runs.filter((run) => run.str.trim() !== "");
  const under = text.find(
    (run) =>
      point.x >= run.x &&
      point.x <= run.x + run.width &&
      point.y >= run.y - run.height &&
      point.y <= run.y + run.height * 0.25,
  );
  if (under) return { run: under, x: point.x };
  const band = text.filter((run) => point.y >= run.y - run.height * 1.5 && point.y <= run.y + run.height * 0.5);
  let left: TextRun | null = null;
  for (const run of band) {
    const gap = point.x - (run.x + run.width);
    if (gap >= 0 && gap <= run.height * 1.5 && (!left || run.x > left.x)) left = run;
  }
  if (left) return { run: left, x: left.x + left.width };
  let right: TextRun | null = null;
  for (const run of band) {
    const gap = run.x - point.x;
    if (gap >= 0 && gap <= run.height * 0.5 && (!right || run.x < right.x)) right = run;
  }
  return right ? { run: right, x: right.x } : null;
}

/** The words of the runs on the nearest line above (-1) or below (1) that overlap a span. */
function wordsBeside(runs: TextRun[], hit: TextRun, span: { left: number; right: number }, side: 1 | -1): string[] {
  const overlapping = runs.filter(
    (run) =>
      run.str.trim() !== "" &&
      run.x <= span.right &&
      run.x + run.width >= span.left &&
      (run.y - hit.y) * side > hit.height * 0.5 &&
      (run.y - hit.y) * side < hit.height * 2.5,
  );
  if (overlapping.length === 0) return [];
  const nearest = overlapping.reduce((a, b) => ((b.y - a.y) * side < 0 ? b : a));
  return overlapping
    .filter((run) => sameBaseline(run, nearest.y, hit.height))
    .sort((a, b) => a.x - b.x)
    .flatMap((run) => run.str.split(/\s+/).filter(Boolean));
}

/**
 * The word under a point, with its neighbours on the same typeset line and
 * the words above and below it. A point on no text, like an icon after a
 * number, takes the word just left of it on its line.
 *
 * @param runs the page's text runs
 * @param point in PDF points from the page's top-left
 * @returns null when no text is under or beside the point
 */
export function wordsAt(runs: TextRun[], point: { x: number; y: number }): ClickedWords | null {
  const found = runAt(runs, point);
  if (!found) return null;
  const hit = found.run;

  // The runs on the hit's baseline, left to right, joined into one line.
  const line = runs.filter((run) => run.str !== "" && sameBaseline(run, hit.y, hit.height)).sort((a, b) => a.x - b.x);
  let text = "";
  let offset = 0;
  let hitStart = 0;
  let previous: TextRun | null = null;
  for (const run of line) {
    const gap = previous ? run.x - (previous.x + previous.width) : 0;
    if (previous && gap > run.height * 0.15 && !/\s$/.test(text) && !/^\s/.test(run.str)) text += " ";
    if (run === hit) {
      const share = hit.width > 0 ? (found.x - hit.x) / hit.width : 0;
      hitStart = text.length;
      offset = text.length + Math.max(0, Math.min(Math.floor(share * hit.str.length), hit.str.length - 1));
    }
    text += run.str;
    previous = run;
  }

  const tokens: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/\S+/g)) tokens.push({ start: match.index, end: match.index + match[0].length });
  let at = tokens.findIndex((token) => offset < token.end);
  if (at === -1) at = tokens.length - 1;
  const word = (index: number) => text.slice(tokens[index].start, tokens[index].end);
  const range = (from: number, to: number) => {
    const words: string[] = [];
    for (let index = Math.max(from, 0); index < Math.min(to, tokens.length); index += 1) words.push(word(index));
    return words;
  };

  // The clicked word's span on the page, widened on each side by its own
  // width, or three line heights for a short word: a cell's other lines are
  // centred, not aligned with it.
  const perChar = hit.str.length > 0 ? hit.width / hit.str.length : 0;
  const left = hit.x + Math.max(tokens[at].start - hitStart, 0) * perChar;
  const right = hit.x + Math.min(tokens[at].end - hitStart, hit.str.length) * perChar;
  const widen = Math.max(right - left, hit.height * 3);
  const span = { left: left - widen, right: right + widen };
  return {
    word: word(at),
    before: range(at - CONTEXT, at),
    after: range(at + 1, at + 1 + CONTEXT),
    above: wordsBeside(runs, hit, span, -1),
    below: wordsBeside(runs, hit, span, 1),
  };
}

/**
 * Lowercase letters and digits, accents and punctuation gone, words split on
 * the rest. A sign right before a number stays with it: -1/-1 and +1/+1 are
 * different table rows.
 */
function normalise(text: string): string[] {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u2010-\u2013\u2212]/g, "-")
      .toLowerCase()
      .match(/(?:(?<![\p{L}\p{N}])[+-](?=\p{N}))?[\p{L}\p{N}]+/gu) ?? []
  );
}

/** An ordinal as \\nth prints it: 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(number: string): string {
  const value = Number(number);
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return number + suffix;
}

/** A source line's words, as printed: no comment, no command names or their optional arguments, \\nth spelled out. */
function sourceWords(line: string): string[] {
  const printed = code(line).replace(/\\nth\s*\{\s*(\d+)\s*\}/g, (_, number: string) => ordinal(number));
  return normalise(printed.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, " "));
}

/** A source line without its comment. */
function code(line: string): string {
  return line.replace(/(?<!\\)%.*$/, "");
}

/**
 * The line where the brace group that SyncTeX's line closes opens: the first
 * line of a macro argument spread over lines, like \textit{...} or a table.
 * SyncTeX's own line when it closes no group.
 */
function groupTop(lines: string[], line: number): number {
  let depth = 0;
  for (let number = line; number >= 1 && line - number < WINDOW; number -= 1) {
    const text = code(lines[number - 1]);
    for (let index = text.length - 1; index >= 0; index -= 1) {
      if (text[index - 1] === "\\") continue;
      if (text[index] === "}") depth += 1;
      else if (text[index] === "{" && depth > 0) {
        depth -= 1;
        if (depth === 0) return number;
      }
    }
    if (depth === 0) return line;
  }
  return line;
}

/** A line that typesets nothing: blank or only a comment. */
function isBlank(line: string): boolean {
  return code(line).trim() === "";
}

/** The length of the longest common subsequence of two word lists. */
function common(a: string[], b: string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    const next = [0];
    for (let index = 0; index < b.length; index += 1) {
      next.push(word === b[index] ? row[index] + 1 : Math.max(row[index + 1], next[index]));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * How well a source line holds the clicked word. Its parts (-1/-1 is two)
 * side by side and whole score most; the last as the start of a longer word
 * a little less, since TeX may have hyphenated it at the line's end; the parts
 * apart, least.
 *
 * @returns 0 when a part is missing
 */
function ownScore(words: string[], target: string[]): number {
  const last = target.length - 1;
  let best = 0;
  for (let at = 0; at + target.length <= words.length; at += 1) {
    const exact = target.every((part, index) => words[at + index] === part);
    const prefix = target.every((part, index) =>
      index === last ? words[at + index].startsWith(part) : words[at + index] === part,
    );
    if (exact) return 2 * target.length;
    if (prefix) best = 2 * target.length - 1;
  }
  if (best > 0) return best;
  return target.every((part) => words.some((word) => word.startsWith(part))) ? target.length : 0;
}

/**
 * How many of the clicked word's neighbours sit right next to it in a source
 * line, at its best place there: counted outward on each side until one
 * differs or the line ends. Source words absent from the PDF's line, like an
 * icon's name between two numbers, are left out first.
 *
 * @param words the source line's words
 * @param target the clicked word's parts
 * @param before the words left of it, nearest last
 * @param after the words right of it, nearest first
 */
function aligned(words: string[], target: string[], before: string[], after: string[]): number {
  const shown = new Set([...before, ...after, ...target]);
  const kept = words.filter((word) => shown.has(word) || target.some((part) => word.startsWith(part)));
  let best = 0;
  for (let at = 0; at + target.length <= kept.length; at += 1) {
    if (!target.every((part, index) => kept[at + index].startsWith(part))) continue;
    let left = 0;
    while (left < before.length && kept[at - 1 - left] === before[before.length - 1 - left]) left += 1;
    let right = 0;
    while (right < after.length && kept[at + target.length + right] === after[right]) right += 1;
    best = Math.max(best, left + right);
  }
  return best;
}

/**
 * The first line SyncTeX's line may stand for: up from it to the blank line
 * that starts its paragraph, or to where the macro argument it closes opens,
 * whichever is higher. Blank lines right at the start are TeX reading ahead.
 */
function windowTop(lines: string[], line: number): number {
  let top = line;
  while (top > 1 && isBlank(lines[top - 1]) && line - top < WINDOW) top -= 1;
  const start = top;
  while (top > 1 && !isBlank(lines[top - 2]) && line - top < WINDOW) top -= 1;
  return Math.min(top, groupTop(lines, start));
}

/**
 * Narrows the line SyncTeX gave down to the source line that holds the
 * clicked words, among the lines of its paragraph at or above it. SyncTeX's
 * own line wins every tie, and a line nearer to it wins over one further up.
 * A blank line, which typesets nothing, gives way to the line above it.
 *
 * @param source the text the PDF was built from
 * @param line SyncTeX's 1-based line
 * @param clicked the words under the point, or null for none
 * @returns a 1-based line
 */
export function refineLine(source: string, line: number, clicked: ClickedWords | null): number {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return line;
  return matchLine(lines, line, clicked) ?? stepOverBlank(lines, line);
}

/** A blank line typesets nothing: it gives way to the line above it, within the window. */
function stepOverBlank(lines: string[], line: number): number {
  const top = windowTop(lines, line);
  let best = line;
  while (best > top && isBlank(lines[best - 1])) best -= 1;
  return best;
}

/** The line that holds the clicked words best, or null when none holds the clicked word. */
function matchLine(lines: string[], line: number, clicked: ClickedWords | null): number | null {
  const top = windowTop(lines, line);
  let best: number | null = null;
  const target = clicked ? normalise(clicked.word) : [];
  if (clicked && target.length > 0) {
    const above = clicked.above.flatMap(normalise);
    const below = clicked.below.flatMap(normalise);
    const before = clicked.before.flatMap(normalise);
    const after = clicked.after.flatMap(normalise);
    const wordsOf = (number: number) => (number >= 1 && number <= lines.length ? sourceWords(lines[number - 1]) : []);
    let bestScore = 0;
    let bestTie = [0, 0];
    for (let number = line; number >= top; number -= 1) {
      const words = sourceWords(lines[number - 1]);
      if (words.length === 0) continue;
      const own = ownScore(words, target);
      if (own === 0) continue;
      // The clicked word's neighbours, in place around it: a table cell's
      // numbers match the cell's line better than another row's same numbers.
      const score = own + aligned(words, target, before, after);
      // Only on a tie, in order: the words above and below against this line
      // and the lines before and after (a table cell's other lines, on the
      // same source line when \\linebreak splits it), then the words before
      // and after against the lines before and after (the cells left and
      // right). Either tells apart
      // the same text in several cells.
      const tie =
        score < bestScore
          ? [0, 0]
          : [
              common(above, [...wordsOf(number - 1), ...words]) + common(below, [...words, ...wordsOf(number + 1)]),
              common(before, wordsOf(number - 1)) + common(after, wordsOf(number + 1)),
            ];
      const wins = tie[0] > bestTie[0] || (tie[0] === bestTie[0] && tie[1] > bestTie[1]);
      if (score > bestScore || (score === bestScore && wins)) {
        bestScore = score;
        bestTie = tie;
        best = number;
      }
    }
  }
  return best === null ? null : stepOverBlank(lines, best);
}

/** Two pieces of text that place a point in a table: one on its row, one in its column. */
export interface GridAnchors {
  row: string;
  column: string;
}

/**
 * The text that places a point with no text near it, like a table cell of
 * icons only: the nearest text on its row (a row label), and the text nearest
 * to it across on the first line of text above it, outside the row label's
 * column (a column header, or the cell above).
 *
 * @param runs the page's text runs
 * @param point in PDF points from the page's top-left
 * @returns null when the point has no text on its row or above it
 */
export function gridAt(runs: TextRun[], point: { x: number; y: number }): GridAnchors | null {
  // A dash standing for "none" says nothing about where it is.
  const text = runs.filter((run) => normalise(run.str).length > 0);
  const across = (run: TextRun) => Math.max(run.x - point.x, 0, point.x - (run.x + run.width));
  const middle = (run: TextRun) => run.y - run.height * 0.35;

  const onRow = text.filter((run) => Math.abs(middle(run) - point.y) <= run.height);
  if (onRow.length === 0) return null;
  const row = onRow.reduce((a, b) => (across(b) < across(a) ? b : a));

  // Text that overlaps the row anchor across is in its column: the other row
  // labels, wider or narrower, and the label's own wrapped lines.
  const inLabelColumn = (run: TextRun) => run.x < row.x + row.width && run.x + run.width > row.x;
  const above = text.filter((run) => run.y < row.y - run.height * 0.5 && !inLabelColumn(run));
  if (above.length === 0) return null;
  const baseline = Math.max(...above.map((run) => run.y));
  const line = above.filter((run) => sameBaseline(run, baseline, run.height));
  const column = line.reduce((a, b) => (across(b) < across(a) ? b : a));
  return { row: row.str.trim(), column: column.str.trim() };
}

/** Whether the character at an index starts "\\\\", a table row's end. */
function rowEndAt(text: string, index: number): boolean {
  return text[index] === "\\" && text[index + 1] === "\\" && text[index - 1] !== "\\";
}

/** Whether the character at an index is a cell separator, not "\\&". */
function separatorAt(text: string, index: number): boolean {
  return text[index] === "&" && !(text[index - 1] === "\\" && text[index - 2] !== "\\");
}

/** Which cell of its table row an offset is in: the separators back to the row's start. */
function columnAt(text: string, offset: number, floor: number): number {
  let column = 0;
  for (let index = offset - 1; index >= floor; index -= 1) {
    if (rowEndAt(text, index - 1) || text.startsWith("\\begin{tabular", index)) break;
    if (separatorAt(text, index)) column += 1;
  }
  return column;
}

/**
 * Where the text of an anchor starts in the window: the nearest line to
 * SyncTeX's that holds all its words, and the anchor's first word in it.
 */
function anchorAt(lines: string[], starts: number[], top: number, line: number, anchor: string): number | null {
  const query = normalise(anchor);
  if (query.length === 0) return null;
  let best: number | null = null;
  let bestScore = 0;
  for (let number = line; number >= top; number -= 1) {
    const score = common(query, sourceWords(lines[number - 1]));
    if (score > bestScore) {
      bestScore = score;
      best = number;
    }
  }
  if (best === null || bestScore < query.length) return null;
  const at = code(lines[best - 1])
    .toLowerCase()
    .indexOf(query[0]);
  return starts[best - 1] + Math.max(at, 0);
}

/**
 * The source line of a table cell found by its row and its column: the line
 * where the row anchor's row reaches the column anchor's column, counting the
 * "&" separators. SyncTeX's line when either anchor or the cell is not found,
 * or the column is the row anchor's own: then the point is no table cell.
 *
 * @param source the text the PDF was built from
 * @param line SyncTeX's 1-based line
 * @param anchors from gridAt
 * @returns a 1-based line
 */
export function refineCell(source: string, line: number, anchors: GridAnchors): number {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return line;
  const top = windowTop(lines, line);
  const starts: number[] = [];
  let offset = 0;
  for (const text of lines) {
    starts.push(offset);
    offset += text.length + 1;
  }
  const floor = starts[top - 1];
  const row = anchorAt(lines, starts, top, line, anchors.row);
  const column = anchorAt(lines, starts, top, line, anchors.column);
  if (row === null || column === null) return line;

  let steps = columnAt(source, column, floor) - columnAt(source, row, floor);
  // Outside a table, or in the row anchor's own cell, nothing is learnt.
  if (steps <= 0) return line;
  const end = starts[line - 1] + lines[line - 1].length;
  for (let index = row; index <= end; index += 1) {
    if (steps === 0) {
      while (index <= end && /\s/.test(source[index])) index += 1;
      let number = line;
      while (number > 1 && starts[number - 1] > index) number -= 1;
      return number;
    }
    if (rowEndAt(source, index)) return line;
    if (separatorAt(source, index)) steps -= 1;
  }
  return line;
}

/**
 * The source line behind a point on a page, from SyncTeX's line and the
 * page's text: the clicked words when a line in the window holds them, else
 * the point's place in a table, else SyncTeX's line.
 *
 * @param source the text the PDF was built from
 * @param line SyncTeX's 1-based line
 * @param runs the page's text runs
 * @param point in PDF points from the page's top-left
 * @returns a 1-based line
 */
export function sourceLine(source: string, line: number, runs: TextRun[], point: { x: number; y: number }): number {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return line;
  const matched = matchLine(lines, line, wordsAt(runs, point));
  if (matched !== null) return matched;
  const grid = gridAt(runs, point);
  const cell = grid ? refineCell(source, line, grid) : line;
  return cell !== line ? cell : stepOverBlank(lines, line);
}

// SyncTeX: the map a TeX run writes from source lines to places on PDF pages.
// Every compile of the engine runs with -synctex=1 and hands back the gzipped
// file on success. This module reads just enough of it to answer "where on
// which page did this source line land?"
//
// The format is line-based text. The parts read here:
//   Input:<tag>:<path>              a source file and the tag its nodes carry
//   Unit:, Magnification:, X Offset:, Y Offset:   the coordinate system
//   {<page>  ...  }<page>           one shipped-out page
//   (<tag>,<line>:<h>,<v>:<W>,<H>,<D>  an hbox opens; ")" closes it
//   [<tag>,<line>:<h>,<v>:<W>,<H>,<D>  a vbox opens; "]" closes it
//   x, k, g, $, h, v, r records    points and void boxes inside a box
// Coordinates count from the page's top-left corner; v is the baseline.
//
// Not every {n block is a page: LuaTeX also records boxes it ships out as
// reusable forms (TikZ fadings, for one) as "{1 ... }0". Only a block closed
// by its own number is a page.

/** How far, in PDF points, two boxes may differ and still count as nested. */
const SLACK = 0.5;

/** SyncTeX's scaled points per PDF point (big point): 65536 * 72.27 / 72. */
const SP_PER_BP = 65781.76;

/**
 * A rectangle on a PDF page, in PDF points from the page's top-left corner.
 *
 * @typedef {object} PageRect
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */

/**
 * One place a source line landed: the box that holds its output.
 *
 * @typedef {object} SyncBox
 * @property {number} input the Input tag of the source file
 * @property {number} line 1-based source line
 * @property {number} page 1-based PDF page
 * @property {PageRect} rect
 */

/**
 * @typedef {object} Synctex
 * @property {Map<number, string>} inputs source path by tag, as TeX opened it
 * @property {SyncBox[]} boxes in file order
 */

// kind, tag, line, optional column, h, v, then W,H,D for boxes and rules.
const NODE = /^([([hvxkg$r])(\d+),(-?\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;

/**
 * Unzips the engine's .synctex.gz bytes.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function gunzipText(bytes) {
  const stream = new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/**
 * Reads a SyncTeX file. Lines it does not know are skipped, so a malformed
 * file yields fewer boxes, never an error.
 *
 * A record inside an hbox (a glyph run, a kern, glue, a rule) is a box for
 * the record's line, sized as that hbox: records carry the line numbers,
 * hboxes the size. An hbox's own line is not used: TeX tags a paragraph's
 * lines with where the paragraph ended, often the next source line. A
 * record directly in a vbox is vertical space and gives no box.
 *
 * @param {string} text the unzipped file
 * @returns {Synctex}
 */
export function parseSynctex(text) {
  /** @type {Map<number, string>} */
  const inputs = new Map();
  /** @type {SyncBox[]} */
  const boxes = [];
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  let scale = 1 / SP_PER_BP;

  /** @type {number | null} */
  let page = null;
  /** @type {SyncBox[]} */
  let pageBoxes = [];
  // Open boxes, innermost last: an hbox's rect, or null for a vbox.
  /** @type {(PageRect | null)[]} */
  let open = [];

  for (const line of text.split("\n")) {
    if (page === null) {
      const input = /^Input:(\d+):(.*)$/.exec(line);
      if (input) {
        inputs.set(Number(input[1]), input[2]);
        continue;
      }
      const setting = /^(Unit|Magnification|X Offset|Y Offset):(-?\d+(?:\.\d+)?)$/.exec(line);
      if (setting) {
        const value = Number(setting[2]);
        if (setting[1] === "Unit") unit = value;
        else if (setting[1] === "Magnification") magnification = value;
        else if (setting[1] === "X Offset") xOffset = value;
        else yOffset = value;
        scale = (unit * magnification) / 1000 / SP_PER_BP;
        continue;
      }
      const start = /^\{(\d+)$/.exec(line);
      if (start) {
        page = Number(start[1]);
        pageBoxes = [];
        open = [];
      }
      continue;
    }

    const end = /^\}(\d+)$/.exec(line);
    if (end) {
      if (Number(end[1]) === page) boxes.push(...pageBoxes);
      page = null;
      continue;
    }
    if (line === ")" || line === "]") {
      open.pop();
      continue;
    }
    // Inputs can be declared mid-page, when TeX opens a file there.
    const input = /^Input:(\d+):(.*)$/.exec(line);
    if (input) {
      inputs.set(Number(input[1]), input[2]);
      continue;
    }
    const node = NODE.exec(line);
    if (!node) continue;
    const [, kind, tag, lineNo, h, v, w, height, depth] = node;
    const x = (Number(h) + xOffset) * scale;
    const y = (Number(v) + yOffset) * scale;
    if (kind === "(") {
      open.push({
        left: x,
        top: y - Number(height ?? 0) * scale,
        width: Number(w ?? 0) * scale,
        height: (Number(height ?? 0) + Number(depth ?? 0)) * scale,
      });
      continue;
    }
    if (kind === "[") {
      open.push(null);
      continue;
    }
    const around = open.length ? open[open.length - 1] : null;
    if (around && around.width > 0 && around.height > 0) {
      pageBoxes.push({ input: Number(tag), line: Number(lineNo), page, rect: around });
    }
  }
  return { inputs, boxes };
}

/**
 * The Input tag of a repository file, or null when TeX never read it. The
 * engine records absolute paths in its project directory, like
 * /home/web_user/project_dir/./clash/astral_run.tex.
 *
 * @param {Synctex} synctex
 * @param {string} path repository path, like clash/astral_run.tex
 * @returns {number | null}
 */
export function inputTag(synctex, path) {
  for (const [tag, recorded] of synctex.inputs) {
    const relative = recorded.replace(/^.*\/project_dir\//, "").replace(/^(\.\/)+/, "");
    if (relative === path) return tag;
  }
  return null;
}

/**
 * Where some lines of one file landed, by page. A box several lines share
 * appears once.
 *
 * @param {Synctex} synctex
 * @param {string} path repository path of the file
 * @param {Set<number>} lines 1-based
 * @returns {Map<number, PageRect[]>} rects by 1-based page
 */
export function lineRects(synctex, path, lines) {
  /** @type {Map<number, PageRect[]>} */
  const byPage = new Map();
  const tag = inputTag(synctex, path);
  if (tag === null || lines.size === 0) return byPage;
  /** @type {Set<PageRect>} */
  const seen = new Set();
  for (const box of synctex.boxes) {
    if (box.input !== tag || !lines.has(box.line) || seen.has(box.rect)) continue;
    seen.add(box.rect);
    const rects = byPage.get(box.page) ?? [];
    rects.push(box.rect);
    byPage.set(box.page, rects);
  }
  return byPage;
}

/**
 * The rects worth marking on one page. A box covering more than `maxShare`
 * of the page is dropped, and so is one as wide or as tall as the page: a
 * background, a footer band or a whole column says little about where the
 * change is. So is a box that lies inside another one kept.
 *
 * @param {PageRect[]} rects
 * @param {number} pageWidth in PDF points
 * @param {number} pageHeight in PDF points
 * @param {number} [maxShare] of the page's area, 0 to 1
 * @returns {PageRect[]}
 */
export function pageHighlights(rects, pageWidth, pageHeight, maxShare = 0.35) {
  const limit = pageWidth * pageHeight * maxShare;
  const fitting = rects.filter(
    (rect) => rect.width * rect.height <= limit && rect.width < pageWidth - SLACK && rect.height < pageHeight - SLACK,
  );
  return fitting.filter(
    (rect, index) =>
      !fitting.some((other, otherIndex) => {
        if (otherIndex === index || !contains(other, rect)) return false;
        // Two equal rects: keep the first.
        return !contains(rect, other) || otherIndex < index;
      }),
  );
}

/**
 * @param {PageRect} outer
 * @param {PageRect} inner
 * @returns {boolean}
 */
function contains(outer, inner) {
  return (
    inner.left >= outer.left - SLACK &&
    inner.top >= outer.top - SLACK &&
    inner.left + inner.width <= outer.left + outer.width + SLACK &&
    inner.top + inner.height <= outer.top + outer.height + SLACK
  );
}

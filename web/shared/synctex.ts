// SyncTeX: the map a TeX run writes from source lines to places on PDF pages.
// Every compile of the engine runs with -synctex=1 and hands back the gzipped
// file on success. This module reads just enough of it to answer "where on
// which page did this source line land?" and, the other way, "which source
// line is at this point on this page?"
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
// An image is not an hbox without records, and not an "h" void box. LuaTeX
// writes an \includegraphics as a run of nested hboxes, all tagged with the
// \includegraphics line and all sized as the image or 0 wide, around one "r"
// rule record whose W and H are the image's size, as seen in a capture of
// clash/bloody_grail.tex (hand-run, see tests/tools/probe-carried-texmf.ts,
// --save-synctex):
//   (236,134:2787448,22151622:101830164,91041956,0
//   r236,134:104617612,22151622:101830164,91041956,0
//   )
// The r's own h is its right edge. A real rule (a table line, a fraction bar)
// is thin, so an r record at least IMAGE_MIN points wide and tall is an image.
// The r is the picture's natural size: a scaled image (scale=0.165, width=...)
// keeps it, and only the hboxes around it carry the size it is drawn at. In the
// capture the r is 1548x1384 pt and the hbox that holds the drawn map 255x228.
// So an image's rect is the innermost hbox around the r that is smaller than
// the r, or else the innermost hbox.
// The "h" records of the file are void boxes at zero size and are not read.
//
// Not every {n block is a page: LuaTeX also records boxes it ships out as
// reusable forms (TikZ fadings, for one) as "{1 ... }0". Only a block closed
// by its own number is a page.

/** How far, in PDF points, two boxes may differ and still count as nested. */
const SLACK = 0.5;

/** An "r" record this wide and this tall, in PDF points, is an image, not a rule. */
const IMAGE_MIN = 2;

/** SyncTeX's scaled points per PDF point (big point): 65536 * 72.27 / 72. */
const SP_PER_BP = 65781.76;

/** A rectangle on a PDF page, in PDF points from the page's top-left corner. */
export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One place a source line landed: the box that holds its output. */
export interface SyncBox {
  /** the Input tag of the source file */
  input: number;
  /** 1-based source line */
  line: number;
  /** 1-based PDF page */
  page: number;
  rect: PageRect;
  /** the record's own left edge, in PDF points from the page's left (an image's rect left) */
  x: number;
  /** the box is an image: an "r" record sized as a picture, not as a rule */
  image?: boolean;
}

export interface Synctex {
  /** source path by tag, as TeX opened it */
  inputs: Map<number, string>;
  /** in file order */
  boxes: SyncBox[];
}

// kind, tag, line, optional column, h, v, then W,H,D for boxes and rules.
const NODE = /^([([hvxkg$r])(\d+),(-?\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;

/** Unzips the engine's .synctex.gz bytes. */
export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
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
 * record directly in a vbox is vertical space and gives no box. A box also
 * keeps its record's own horizontal position, so source lines that share one
 * typeset line can be told apart. An "r" record sized as a picture marks its
 * box as an image.
 *
 * @param text the unzipped file
 */
export function parseSynctex(text: string): Synctex {
  const inputs: Map<number, string> = new Map();
  const boxes: SyncBox[] = [];
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  let scale = 1 / SP_PER_BP;

  let page: number | null = null;
  let pageBoxes: SyncBox[] = [];
  // Open boxes, innermost last: an hbox's rect, or null for a vbox.
  let open: (PageRect | null)[] = [];
  // Per open box, innermost last: the smallest line of each file's hboxes
  // around it, itself included.
  let limits: Map<number, number>[] = [];

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
        limits = [];
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
      limits.pop();
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
    const outer = limits.length ? limits[limits.length - 1] : new Map<number, number>();
    if (kind === "(") {
      open.push({
        left: x,
        top: y - Number(height ?? 0) * scale,
        width: Number(w ?? 0) * scale,
        height: (Number(height ?? 0) + Number(depth ?? 0)) * scale,
      });
      const limit = new Map(outer);
      limit.set(Number(tag), Math.min(Number(lineNo), outer.get(Number(tag)) ?? Number.POSITIVE_INFINITY));
      limits.push(limit);
      continue;
    }
    if (kind === "[") {
      open.push(null);
      limits.push(outer);
      continue;
    }
    // A record of a later line than an hbox of its file around it was made
    // after that box's paragraph ended: LuaTeX tags the kerns, glyph runs and
    // boxes its font and glyph code adds at ship-out with the line TeX is
    // reading then, the line the page broke at.
    if (Number(lineNo) > (outer.get(Number(tag)) ?? Number.POSITIVE_INFINITY)) continue;
    const around = open.length ? open[open.length - 1] : null;
    if (around && around.width > 0 && around.height > 0) {
      const box: SyncBox = { input: Number(tag), line: Number(lineNo), page, rect: around, x };
      const ruleWidth = Number(w ?? 0) * scale;
      const ruleHeight = Number(height ?? 0) * scale;
      if (kind === "r" && ruleWidth >= IMAGE_MIN && ruleHeight >= IMAGE_MIN) {
        let drawn: PageRect = around;
        for (let depth = open.length - 1; depth >= 0; depth -= 1) {
          const rect = open[depth];
          if (rect && rect.width > 0 && rect.width < ruleWidth - SLACK && rect.height < ruleHeight - SLACK) {
            drawn = rect;
            break;
          }
        }
        box.image = true;
        box.rect = drawn;
        box.x = box.rect.left;
      }
      pageBoxes.push(box);
    }
  }
  return { inputs, boxes };
}

/**
 * The Input tag of a repository file, or null when TeX never read it. The
 * engine records absolute paths in its project directory, like
 * /home/web_user/project_dir/./clash/astral_run.tex.
 *
 * @param path repository path, like clash/astral_run.tex
 */
export function inputTag(synctex: Synctex, path: string): number | null {
  for (const [tag, recorded] of synctex.inputs) {
    const relative = recorded.replace(/^.*\/project_dir\//, "").replace(/^(\.\/)+/, "");
    if (relative === path) return tag;
  }
  return null;
}

/**
 * Where some lines of one file landed, by page. A box several lines share
 * appears once. Image boxes count like any other: an "r" record already made
 * a box before images were told apart. Records LuaTeX adds at ship-out are
 * dropped at parse time, so a page-break line no longer marks the text it
 * broke in.
 *
 * @param path repository path of the file
 * @param lines 1-based
 * @returns rects by 1-based page
 */
export function lineRects(synctex: Synctex, path: string, lines: Set<number>): Map<number, PageRect[]> {
  const byPage: Map<number, PageRect[]> = new Map();
  const tag = inputTag(synctex, path);
  if (tag === null || lines.size === 0) return byPage;
  const seen: Set<PageRect> = new Set();
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
 * @param pageWidth in PDF points
 * @param pageHeight in PDF points
 * @param maxShare of the page's area, 0 to 1
 */
export function pageHighlights(rects: PageRect[], pageWidth: number, pageHeight: number, maxShare = 0.35): PageRect[] {
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

function contains(outer: PageRect, inner: PageRect): boolean {
  return (
    inner.left >= outer.left - SLACK &&
    inner.top >= outer.top - SLACK &&
    inner.left + inner.width <= outer.left + outer.width + SLACK &&
    inner.top + inner.height <= outer.top + outer.height + SLACK
  );
}

/**
 * Which line of one file is at a point on a page. Text or an image under the
 * point wins. When both are, text wins only at under half the image's area:
 * text drawn over art is far smaller than the art, while a line or minipage
 * that holds an image is about its size, or larger. Else the nearest text on
 * the page. A box as wide or as tall as the page is
 * background art and never wins.
 *
 * The template's page furniture (the background art, the footer and its page
 * number) is shipped out with the page, so SyncTeX tags it with the line TeX
 * was reading then: the line of the page's own full-page box. Boxes of that
 * line never win, and a point inside one that holds none of the file's other
 * boxes, like the footer, maps to no line. Real text of that line on the page
 * is lost with them; it is the line the page broke at, which rarely shows on
 * the page that ends there.
 *
 * @param path repository path of the file
 * @param page 1-based
 * @param point in PDF points from the page's top-left
 * @param pageSize in PDF points
 * @returns a 1-based line, or null when the file has no box on that page, TeX
 *   never read it, or the point is on page furniture alone (the footer)
 */
export function sourceAt(
  synctex: Synctex,
  path: string,
  page: number,
  point: { x: number; y: number },
  pageSize: { width: number; height: number },
): number | null {
  const tag = inputTag(synctex, path);
  if (tag === null) return null;
  const onPage = synctex.boxes.filter((box) => box.input === tag && box.page === page);
  const wide = (rect: PageRect) => rect.width >= pageSize.width - SLACK;
  const tall = (rect: PageRect) => rect.height >= pageSize.height - SLACK;
  const shipOut = new Set(
    onPage.filter((box) => !box.image && wide(box.rect) && tall(box.rect)).map((box) => box.line),
  );
  const furniture = onPage.filter((box) => shipOut.has(box.line) && !(wide(box.rect) && tall(box.rect)));
  const candidates = onPage.filter((box) => !shipOut.has(box.line) && !wide(box.rect) && !tall(box.rect));
  const text = leaves(candidates.filter((box) => !box.image));
  const around = (box: SyncBox): boolean => inside(box.rect, point);

  const hitText = smallest(text.filter(around));
  const hitImage = smallest(candidates.filter((box) => box.image && around(box)));
  if (hitImage && (!hitText || area(hitText.rect) * 2 > area(hitImage.rect))) return hitImage.line;
  if (hitText) return recordAt(text, hitText.rect, point.x);
  const blank = furniture.some((box) => around(box) && !candidates.some((other) => contains(box.rect, other.rect)));
  if (blank) return null;

  let nearest: SyncBox | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const box of text) {
    const distance = distanceTo(box.rect, point);
    if (distance < best) {
      best = distance;
      nearest = box;
    }
  }
  return nearest ? recordAt(text, nearest.rect, point.x) : null;
}

/**
 * The text boxes that are not containers. A rect that holds text rects stacked
 * one above another is a container, like a multicols column: its own records
 * are the space between lines, and a click there means the text nearest to it.
 */
function leaves(boxes: SyncBox[]): SyncBox[] {
  const rects = [...new Set(boxes.map((box) => box.rect))];
  const containers: Set<PageRect> = new Set(
    rects.filter((rect) => {
      const within = rects.filter((other) => other !== rect && contains(rect, other) && !contains(other, rect));
      // Boxes inside a typeset line sit side by side; a container stacks them.
      return within.some((one) => within.some((two) => one.top + one.height <= two.top));
    }),
  );
  const kept = boxes.filter((box) => !containers.has(box.rect));
  return kept.length ? kept : boxes;
}

function inside(rect: PageRect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

function area(rect: PageRect): number {
  return rect.width * rect.height;
}

/** The box with the smallest area; the first of equals. */
function smallest(boxes: SyncBox[]): SyncBox | null {
  let found: SyncBox | null = null;
  for (const box of boxes) {
    if (!found || area(box.rect) < area(found.rect)) found = box;
  }
  return found;
}

/** Distance from a point to the closest edge of a rect; 0 inside it. */
function distanceTo(rect: PageRect, point: { x: number; y: number }): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * The line of the record in one hbox that a horizontal position falls on: the
 * record with the largest x at or left of it, else the leftmost record.
 *
 * @param boxes the boxes to pick from; those sharing `rect` are the records
 */
function recordAt(boxes: SyncBox[], rect: PageRect, x: number): number {
  const records = boxes.filter((box) => box.rect === rect);
  let left: SyncBox | null = null;
  let first = records[0];
  for (const record of records) {
    if (record.x < first.x) first = record;
    if (record.x <= x && (!left || record.x >= left.x)) left = record;
  }
  return (left ?? first).line;
}

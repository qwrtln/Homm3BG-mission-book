import { PNG_DPI } from "../../shared/page-images.ts";
import { anchorScrollTop, scrollAnchor, ZOOM_STEPS, zoomStep } from "../../shared/pdf-viewport.ts";
import { pageHighlights } from "../../shared/synctex.ts";
import { store } from "../store.ts";
import { buildKeyLabel, el, escapeHtml, setStatus } from "./dom.js";
import { getEditor, requireEditor } from "./editor-api.ts";
import { state } from "./state.ts";

/** @returns {string} what the PDF pane says with nothing built yet */
function emptyMessage() {
  return `No PDF yet. Press Build PDF or ${buildKeyLabel()}.`;
}

// pdf.js is imported lazily, when the first PDF shows, so a page load that
// never reaches a PDF never fetches its chunk or its worker.
/** @typedef {typeof import("pdfjs-dist")} PdfJsModule */
/** @typedef {import("pdfjs-dist").PDFDocumentLoadingTask} PdfLoadingTask */
/** @typedef {import("pdfjs-dist").PDFDocumentProxy} PdfDocument */

/** Space around and between pages, in px. Matches .pdf-pages in workspace.css. */
const PAGE_MARGIN = 12;

/** How long a pane resize must settle before the pages redraw, in ms. */
const RESIZE_SETTLE_MS = 150;

/** @type {Promise<PdfJsModule> | null} */
let pdfjsReady = null;

/**
 * The document the pane shows, or is about to show, with the task that
 * loaded it: destroying the task is what frees the document, and the number
 * of its pages the pane draws. Null for a placeholder.
 *
 * @type {{task: PdfLoadingTask, doc: PdfDocument, pageCount: number} | null}
 */
let shown = null;

/** Share of the fit-to-width size the pages draw at. Kept across rebuilds and scenarios. */
let zoom = 1;

/** The pane width the shown pages were fitted to; 0 when drawn while hidden. */
let drawnWidth = 0;

/** Each drawn page's size in PDF points, in page order. */
/** @type {{width: number, height: number}[]} */
let drawnSizes = [];

/** How far a change mark reaches past the box it marks, in px. */
const CHANGE_MARK_OUTSET = 2;

// Tickets let the newest request win. A document load that finishes after a
// newer showPdf or clearPdf is dropped; a render that finishes after a newer
// render (a zoom, a resize, the next build) is dropped before it swaps in.
let loadTicket = 0;
let renderTicket = 0;

/** @returns {Promise<PdfJsModule>} */
function loadPdfJs() {
  pdfjsReady ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    },
    (error) => {
      pdfjsReady = null; // let the next PDF try again
      throw error;
    },
  );
  return pdfjsReady;
}

/**
 * Drops the shown document and whatever render or load is in flight.
 *
 * @returns {void}
 */
function forgetDocument() {
  loadTicket += 1;
  renderTicket += 1;
  shown?.task.destroy();
  shown = null;
  el("pdf-controls").hidden = true;
}

/**
 * Replaces the pages with a centred message.
 *
 * @param {string} html trusted markup for the message
 * @returns {void}
 */
function showPlaceholder(html) {
  forgetDocument();
  el("pdf-body").innerHTML = html;
}

/**
 * @param {string} text what the pane says instead of a PDF
 * @returns {void}
 */
export function showPdfMessage(text) {
  showPlaceholder(`<div class="empty-pdf" id="pdf-empty">${escapeHtml(text)}</div>`);
}

/** Empties the PDF pane and the error panel. @returns {void} */
export function clearPdf() {
  state.lastPdf = null;
  state.pdfSource = null;
  state.pdfUploads = null;
  state.pdfPath = null;
  state.pdfDropsLastPage = false;
  store.setState({ downloadDisabled: true });
  showPdfMessage(emptyMessage());
  el("error-panel").hidden = true;
  clearErrorLine();
}

/**
 * What the shown PDF was built from, as submitBlockers takes it: the text
 * and the uploads of an in-app build. Null when no PDF is shown, or when the
 * shown one is the published PDF, which proves nothing about this copy.
 *
 * @returns {{text: string, uploads: string} | null}
 */
export function builtFingerprint() {
  // An empty text or an empty uploads signature (no uploads) is still set.
  if (!state.lastPdf || state.pdfSource === null || state.pdfUploads === null) return null;
  return { text: state.pdfSource, uploads: state.pdfUploads };
}

/**
 * What the status bar says when the shown PDF no longer matches the editor.
 *
 * @returns {string}
 */
export function staleMessage() {
  return `Source changed since last build. Press ${buildKeyLabel()} to rebuild.`;
}

/**
 * Says in the status bar that the shown PDF no longer matches the editor.
 * Silent when no PDF is shown, and while the status bar reports an action
 * still under way (it spins): the next edit says it instead.
 *
 * @returns {void}
 */
export function refreshStaleStatus() {
  const editor = getEditor();
  if (!state.lastPdf || state.pdfSource === null || !editor) return;
  if (editor.getText() === state.pdfSource) return;
  if (!el("status-spinner").hidden) return;
  setStatus(staleMessage());
}

/** Removes the failed build's line mark, if any. @returns {void} */
export function clearErrorLine() {
  getEditor()?.markErrorLine(null);
}

/**
 * Puts the editor's cursor on a line and scrolls it into view.
 *
 * @param {number} line 1-based, as TeX counts
 * @returns {void}
 */
function jumpToLine(line) {
  requireEditor().revealLine(line);
}

/**
 * Shows a PDF in the pane. The pages it replaces stay on screen until the
 * new ones are drawn, and the new ones open where the reader was: the same
 * page, the same spot on it, the same zoom.
 *
 * Resolves once the pages are drawn. Never rejects: a PDF that cannot be
 * drawn leaves a message in the pane, and Download still offers its bytes.
 *
 * @param {Blob} blob PDF bytes, tagged application/pdf
 * @param {string} source the editor source the PDF stands for; an edit away
 *   from it makes the PDF stale
 * @param {{dropLastPage?: boolean, path?: string | null, changes?: Map<number, import("../../shared/synctex.ts").PageRect[]>, uploads?: string}} [options]
 *   dropLastPage leaves the last page undrawn and uncounted, never the only
 *   one: the published PDF ends on a feedback page an in-browser build does
 *   not make. path is the scenario the PDF shows, which names the download;
 *   it defaults to the one in the editor. changes are the places, by 1-based
 *   page, to mark briefly once the pages are drawn. uploads is the
 *   uploadsSignature an in-app build compiled with; a published PDF has none
 * @returns {Promise<void>}
 */
export async function showPdf(blob, source, { dropLastPage = false, path = state.chosenPath, changes, uploads } = {}) {
  state.lastPdf = blob;
  state.pdfSource = source;
  state.pdfUploads = uploads ?? null;
  state.pdfPath = path;
  state.pdfDropsLastPage = dropLastPage;
  store.setState({ downloadDisabled: false });
  loadTicket += 1;
  const ticket = loadTicket;
  try {
    const pdfjs = await loadPdfJs();
    // pdf.js hands its data to a worker, which detaches it; this copy is its
    // own, and the blob Download reads stays whole.
    const data = new Uint8Array(await blob.arrayBuffer());
    const task = pdfjs.getDocument({ data, verbosity: 0 });
    const doc = await task.promise;
    if (ticket !== loadTicket) {
      task.destroy();
      return;
    }
    // The old pages are already drawn, so the old document can go now.
    shown?.task.destroy();
    const pageCount = dropLastPage ? Math.max(doc.numPages - 1, 1) : doc.numPages;
    shown = { task, doc, pageCount };
    const drawn = await renderPages();
    if (drawn && changes) markChanges(changes);
  } catch (error) {
    if (ticket !== loadTicket) return;
    console.warn("The PDF could not be drawn:", error);
    showPdfMessage("This PDF cannot be shown here. Download it to read it.");
  }
}

/**
 * Encodes a canvas as PNG bytes.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Uint8Array>}
 */
function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The page could not be encoded as a PNG."));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png");
  });
}

/**
 * Renders a PDF's pages to PNG bytes at PNG_DPI, through a loading task of
 * its own: it never touches the pane's shown document, its tickets, or its
 * zoom. Used by the PNG export, independently of what the pane currently
 * draws.
 *
 * @param {Blob} blob PDF bytes, tagged application/pdf
 * @param {{dropLastPage?: boolean, onPage?: (page: number, total: number) => void}} [options]
 *   dropLastPage excludes the last page, never the only one, the same rule
 *   showPdf uses to exclude a published PDF's feedback page. onPage reports
 *   progress before each page renders, 1-based, against the total exported.
 * @returns {Promise<Uint8Array[]>} one PNG per exported page, in page order
 */
export async function renderPngPages(blob, { dropLastPage = false, onPage } = {}) {
  const pdfjs = await loadPdfJs();
  // pdf.js hands its data to a worker, which detaches it; this copy is its
  // own, and the blob the export reads stays whole.
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  try {
    const doc = await task.promise;
    const total = dropLastPage ? Math.max(doc.numPages - 1, 1) : doc.numPages;
    const scale = PNG_DPI / 72;
    /** @type {Uint8Array[]} */
    const pages = [];
    for (let number = 1; number <= total; number += 1) {
      onPage?.(number, total);
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push(await canvasToPng(canvas));
      // Frees the backing store now rather than at the next collection: at
      // PNG_DPI an A6 page alone is several megabytes.
      canvas.width = 0;
      canvas.height = 0;
    }
    return pages;
  } finally {
    task.destroy();
  }
}

/**
 * The top and height of every page in the pane's scrolled content.
 *
 * @param {HTMLElement} pages the .pdf-pages container
 * @returns {import("../../shared/pdf-viewport.ts").PageBox[]}
 */
function pageBoxes(pages) {
  return [...pages.querySelectorAll(".pdf-page")].map((page) => {
    const box = /** @type {HTMLElement} */ (page);
    return { top: box.offsetTop, height: box.offsetHeight };
  });
}

/**
 * Draws the shown document's pages at the current zoom into fresh
 * canvases, then swaps them in at once and scrolls back to the reader's
 * place. Dropped unfinished when a newer render starts.
 *
 * @returns {Promise<boolean>} whether these pages are the ones on screen
 */
async function renderPages() {
  if (!shown) return false;
  const { doc, pageCount } = shown;
  renderTicket += 1;
  const ticket = renderTicket;
  const body = el("pdf-body");
  // A hidden pane has no width yet; the resize observer redraws once it has one.
  const paneWidth = body.clientWidth;
  const fitWidth = Math.max(paneWidth - 2 * PAGE_MARGIN, 100);
  const pixelRatio = window.devicePixelRatio || 1;
  const container = document.createElement("div");
  container.className = "pdf-pages";
  /** @type {{width: number, height: number}[]} */
  const sizes = [];

  try {
    for (let number = 1; number <= pageCount; number += 1) {
      const page = await doc.getPage(number);
      if (ticket !== renderTicket) return false;
      const natural = page.getViewport({ scale: 1 });
      sizes.push({ width: natural.width, height: natural.height });
      const scale = (fitWidth / natural.width) * zoom;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Page ${number}`);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const transform = pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0];
      await page.render({ canvas, viewport, transform }).promise;
      if (ticket !== renderTicket) return false;
      container.append(canvas);
    }
  } catch (error) {
    if (ticket !== renderTicket) return false; // the document went while drawing
    throw error;
  }

  // Read the place only now: the reader may have scrolled while this drew.
  const old = body.querySelector(".pdf-pages");
  const anchor = old instanceof HTMLElement ? scrollAnchor(pageBoxes(old), body.scrollTop) : { page: 0, offset: 0 };
  const across = body.scrollWidth > 0 ? (body.scrollLeft + body.clientWidth / 2) / body.scrollWidth : 0.5;
  body.replaceChildren(container);
  drawnWidth = paneWidth;
  drawnSizes = sizes;
  el("pdf-page-count").textContent = pageCount === 1 ? "1 page" : `${pageCount} pages`;
  el("pdf-controls").hidden = false;
  body.scrollTop = anchorScrollTop(pageBoxes(container), anchor);
  body.scrollLeft = across * body.scrollWidth - body.clientWidth / 2;
  return true;
}

/**
 * Marks places on the drawn pages for a moment. The marks share one layer,
 * which fades out and removes itself; a redraw drops it if still showing.
 *
 * @param {Map<number, import("../../shared/synctex.ts").PageRect[]>} changes rects in PDF points, by 1-based page
 * @returns {void}
 */
function markChanges(changes) {
  const container = el("pdf-body").querySelector(".pdf-pages");
  if (!container) return;
  const pages = container.querySelectorAll(".pdf-page");
  const layer = document.createElement("div");
  layer.className = "pdf-changes";
  for (const [number, rects] of changes) {
    const page = pages[number - 1];
    const size = drawnSizes[number - 1];
    if (!(page instanceof HTMLElement) || !size) continue;
    // The pages are the positioned pane's children's children, and the layer
    // sits at the pane's origin: page offsets place the marks in it as they are.
    const ratio = page.offsetWidth / size.width;
    for (const rect of pageHighlights(rects, size.width, size.height)) {
      const mark = document.createElement("div");
      mark.className = "pdf-change";
      mark.style.left = `${page.offsetLeft + rect.left * ratio - CHANGE_MARK_OUTSET}px`;
      mark.style.top = `${page.offsetTop + rect.top * ratio - CHANGE_MARK_OUTSET}px`;
      mark.style.width = `${rect.width * ratio + 2 * CHANGE_MARK_OUTSET}px`;
      mark.style.height = `${rect.height * ratio + 2 * CHANGE_MARK_OUTSET}px`;
      layer.append(mark);
    }
  }
  if (!layer.childElementCount) return;
  layer.addEventListener("animationend", () => layer.remove(), { once: true });
  container.append(layer);
}

/**
 * Redraws the shown pages, if any, keeping the reader's place.
 *
 * @returns {void}
 */
function redraw() {
  if (!shown) return;
  const ticket = loadTicket;
  renderPages().catch((error) => {
    if (ticket !== loadTicket) return;
    console.warn("The PDF could not be redrawn:", error);
  });
}

/**
 * @param {number} value share of the fit-to-width size
 * @returns {void}
 */
function setZoom(value) {
  zoom = value;
  // Fit, not 100%: the default is a share of the pane's width, not actual size.
  el("pdf-zoom-level").textContent = zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`;
  el("pdf-zoom-out").disabled = zoom <= ZOOM_STEPS[0];
  el("pdf-zoom-in").disabled = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  redraw();
}

/** Wires the zoom controls, and redraws the pages when the pane's width changes. @returns {void} */
export function initPdfView() {
  // index.html's static #pdf-empty text has no key label; replace it once the platform is known.
  el("pdf-empty").textContent = emptyMessage();

  el("pdf-zoom-in").addEventListener("click", () => setZoom(zoomStep(zoom, 1)));
  el("pdf-zoom-out").addEventListener("click", () => setZoom(zoomStep(zoom, -1)));
  el("pdf-zoom-level").addEventListener("click", () => setZoom(1));

  const body = el("pdf-body");
  // Hiding the pane (the welcome screen over a scenario left open) takes its
  // width to 0 and its scroll to the top. Neither is the reader's doing: the
  // pages stay as drawn, and the place comes back with the pane.
  let place = { top: 0, left: 0 };
  let hidden = false;
  body.addEventListener("scroll", () => {
    if (body.clientWidth > 0) place = { top: body.scrollTop, left: body.scrollLeft };
  });
  /** @type {number | undefined} */
  let settle;
  new ResizeObserver(() => {
    const width = body.clientWidth;
    if (width === 0) {
      hidden = true;
      clearTimeout(settle);
      return;
    }
    if (hidden) {
      hidden = false;
      body.scrollTop = place.top;
      body.scrollLeft = place.left;
    }
    if (width === drawnWidth) return; // a height change leaves the fit alone
    clearTimeout(settle);
    // Pages drawn while hidden are at the smallest size: replace them at once.
    settle = window.setTimeout(redraw, drawnWidth === 0 ? 0 : RESIZE_SETTLE_MS);
  }).observe(body);
}

/**
 * @param {string} text what the pane says while it waits
 * @returns {void}
 */
export function showPdfLoading(text) {
  showPlaceholder(`<div class="empty-pdf loading"><span class="spinner big"></span><p>${escapeHtml(text)}</p></div>`);
}

/**
 * Shows the build's first error. With an errorLine it is a button that
 * jumps the editor there, and that line stays marked until the next build.
 *
 * @param {Pick<BuildRecord, "firstError" | "errorLine" | "log">} record
 * @returns {void}
 */
export function showError(record) {
  clearErrorLine();
  el("error-panel").hidden = false;
  const text = record.firstError || "The build failed, but no specific LaTeX error line was found in the log.";
  const line = record.errorLine ?? null;
  const target = el("first-error");
  if (line === null) {
    target.textContent = text;
  } else {
    const where = document.createElement("span");
    where.className = "error-jump-line";
    where.textContent = `Line ${line}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "error-jump";
    button.title = `Go to line ${line} in the editor`;
    button.append(where, text);
    button.addEventListener("click", () => jumpToLine(line));
    target.replaceChildren(button);
    // The mark stays until the next build, and follows its line through edits.
    requireEditor().markErrorLine(line);
  }
  el("full-log").textContent = record.log || "";
  el("full-log-details").open = false;
}

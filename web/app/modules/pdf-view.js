import { anchorScrollTop, scrollAnchor, ZOOM_STEPS, zoomStep } from "../../shared/pdf-viewport.js";
import { el, escapeHtml, setStatus } from "./dom.js";
import { requireEditor, state } from "./state.js";

// pdf.js is imported by URL, when the first PDF shows, so a page load that
// never reaches a PDF never fetches it, and the type checker never reads it.
const PDFJS_URL = new URL("../vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
const PDFJS_WORKER_URL = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

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

// Tickets let the newest request win. A document load that finishes after a
// newer showPdf or clearPdf is dropped; a render that finishes after a newer
// render (a zoom, a resize, the next build) is dropped before it swaps in.
let loadTicket = 0;
let renderTicket = 0;

/** @returns {Promise<PdfJsModule>} */
function loadPdfJs() {
  pdfjsReady ??= import(PDFJS_URL).then(
    (module) => {
      const pdfjs = /** @type {PdfJsModule} */ (module);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
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
  state.pdfPath = null;
  el("download").disabled = true;
  showPdfMessage("No PDF yet. Press Build PDF.");
  el("error-panel").hidden = true;
  clearErrorLine();
}

export const STALE_MESSAGE = "Source changed since last build.";

/**
 * Says in the status bar that the shown PDF no longer matches the editor.
 * Silent when no PDF is shown, and while the status bar reports an action
 * still under way (it spins): the next edit says it instead.
 *
 * @returns {void}
 */
export function refreshStaleStatus() {
  if (!state.lastPdf || state.pdfSource === null || !state.cm) return;
  if (state.cm.getValue() === state.pdfSource) return;
  if (!el("status-spinner").hidden) return;
  setStatus(STALE_MESSAGE);
}

const ERROR_LINE_CLASS = "build-error-line";

// The editor line the last failed build marked; it stays marked until the
// next build. A handle, not a number, so it follows the line through edits.
/** @type {CodeMirrorLineHandle | null} */
let markedLine = null;

/** Removes the failed build's line mark, if any. @returns {void} */
export function clearErrorLine() {
  if (markedLine && state.cm) state.cm.removeLineClass(markedLine, "background", ERROR_LINE_CLASS);
  markedLine = null;
}

/**
 * Puts the editor's cursor on a line and scrolls it into view.
 *
 * @param {number} line 1-based, as TeX counts
 * @returns {void}
 */
function jumpToLine(line) {
  const cm = requireEditor();
  const pos = { line: line - 1, ch: 0 };
  cm.focus();
  cm.setCursor(pos);
  cm.scrollIntoView(pos, 80);
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
 * @param {{dropLastPage?: boolean, path?: string | null}} [options]
 *   dropLastPage leaves the last page undrawn and uncounted, never the only
 *   one: the published PDF ends on a feedback page an in-browser build does
 *   not make. path is the scenario the PDF shows, which names the download;
 *   it defaults to the one in the editor
 * @returns {Promise<void>}
 */
export async function showPdf(blob, source, { dropLastPage = false, path = state.chosenPath } = {}) {
  state.lastPdf = blob;
  state.pdfSource = source;
  state.pdfPath = path;
  el("download").disabled = false;
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
    await renderPages();
  } catch (error) {
    if (ticket !== loadTicket) return;
    console.warn("The PDF could not be drawn:", error);
    showPdfMessage("This PDF cannot be shown here. Download it to read it.");
  }
}

/**
 * The top and height of every page in the pane's scrolled content.
 *
 * @param {HTMLElement} pages the .pdf-pages container
 * @returns {import("../../shared/pdf-viewport.js").PageBox[]}
 */
function pageBoxes(pages) {
  return [...pages.children].map((page) => {
    const box = /** @type {HTMLElement} */ (page);
    return { top: box.offsetTop, height: box.offsetHeight };
  });
}

/**
 * Draws the shown document's pages at the current zoom into fresh
 * canvases, then swaps them in at once and scrolls back to the reader's
 * place. Dropped unfinished when a newer render starts.
 *
 * @returns {Promise<void>}
 */
async function renderPages() {
  if (!shown) return;
  const { doc, pageCount } = shown;
  renderTicket += 1;
  const ticket = renderTicket;
  const body = el("pdf-body");
  // A hidden pane has no width yet; the resize observer redraws once it has one.
  const fitWidth = Math.max(body.clientWidth - 2 * PAGE_MARGIN, 100);
  const pixelRatio = window.devicePixelRatio || 1;
  const container = document.createElement("div");
  container.className = "pdf-pages";

  try {
    for (let number = 1; number <= pageCount; number += 1) {
      const page = await doc.getPage(number);
      if (ticket !== renderTicket) return;
      const scale = (fitWidth / page.getViewport({ scale: 1 }).width) * zoom;
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
      if (ticket !== renderTicket) return;
      container.append(canvas);
    }
  } catch (error) {
    if (ticket !== renderTicket) return; // the document went while drawing
    throw error;
  }

  // Read the place only now: the reader may have scrolled while this drew.
  const old = body.querySelector(".pdf-pages");
  const anchor = old instanceof HTMLElement ? scrollAnchor(pageBoxes(old), body.scrollTop) : { page: 0, offset: 0 };
  const across = body.scrollWidth > 0 ? (body.scrollLeft + body.clientWidth / 2) / body.scrollWidth : 0.5;
  body.replaceChildren(container);
  el("pdf-page-count").textContent = pageCount === 1 ? "1 page" : `${pageCount} pages`;
  el("pdf-controls").hidden = false;
  body.scrollTop = anchorScrollTop(pageBoxes(container), anchor);
  body.scrollLeft = across * body.scrollWidth - body.clientWidth / 2;
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
  el("pdf-zoom-in").addEventListener("click", () => setZoom(zoomStep(zoom, 1)));
  el("pdf-zoom-out").addEventListener("click", () => setZoom(zoomStep(zoom, -1)));
  el("pdf-zoom-level").addEventListener("click", () => setZoom(1));

  const body = el("pdf-body");
  let width = body.clientWidth;
  /** @type {number | undefined} */
  let settle;
  new ResizeObserver(() => {
    if (body.clientWidth === width) return; // a height change leaves the fit alone
    width = body.clientWidth;
    clearTimeout(settle);
    settle = window.setTimeout(redraw, RESIZE_SETTLE_MS);
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
    markedLine = requireEditor().addLineClass(line - 1, "background", ERROR_LINE_CLASS);
  }
  el("full-log").textContent = record.log || "";
  el("full-log-details").open = false;
}

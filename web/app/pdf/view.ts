// The PDF pane's logic: which document it shows, how its pages are drawn and
// redrawn, and the zoom. components/workspace/PdfView.tsx renders the pane
// and hands its elements over through attachPdfPane(); what the pane says
// (a message, the loading spinner, the pages) and the zoom live in the store.

import { flushSync } from "react-dom";
import { mapLine } from "../../shared/line-diff.ts";
import { anchorScrollTop, scrollAnchor, ZOOM_STEPS, zoomStep } from "../../shared/pdf-viewport.ts";
import { sourceLine, type TextRun } from "../../shared/source-match.ts";
import { type PageRect, type Synctex, sourceAt } from "../../shared/synctex.ts";
import { buildKeyLabel } from "../modules/dom.ts";
import { getEditor, requireEditor } from "../modules/editor-api.ts";
import { type BuildErrorState, type PdfPaneContent, store, type WorkspaceState } from "../store.ts";
import { pageText } from "./page-text.ts";
import { drawPages, markChanges, PAGE_MARGIN, type PageSize, pageBoxes } from "./pages.ts";
import { openDocument, type PdfDocument, type PdfLoadingTask } from "./pdfjs.ts";

export { renderPngPages } from "./pages.ts";

/** How long a pane resize must settle before the pages redraw, in ms. */
const RESIZE_SETTLE_MS = 150;

/** The pane's two elements: the scrolling body, and the host the drawn pages go into. */
interface PaneElements {
  body: HTMLElement;
  pages: HTMLElement;
}

let pane: PaneElements | null = null;

/**
 * The document the pane shows, or is about to show, with the task that
 * loaded it: destroying the task is what frees the document, and the number
 * of its pages the pane draws. Its SyncTeX, and the text of each page a
 * double-click has read, go with it. Null for a placeholder.
 */
let shown: {
  task: PdfLoadingTask;
  doc: PdfDocument;
  pageCount: number;
  /** The source and scenario the document was built from, for the double-click. */
  source: string;
  path: string | null;
  synctex: Synctex | null;
  text: Map<number, Promise<TextRun[]>>;
} | null = null;

/** The pane width the shown pages were fitted to; 0 when drawn while hidden. */
let drawnWidth = 0;

/** Each drawn page's size in PDF points, in page order. */
let drawnSizes: PageSize[] = [];

// Tickets let the newest request win. A document load that finishes after a
// newer showPdf or clearPdf is dropped; a render that finishes after a newer
// render (a zoom, a resize, the next build) is dropped before it swaps in.
let loadTicket = 0;
let renderTicket = 0;

let errorSeq = 0;

function requirePane(): PaneElements {
  if (pane === null) throw new Error("The PDF pane is not mounted yet.");
  return pane;
}

/** Writes the store and renders it at once: the pane measures its pages right after. */
function commit(partial: Partial<WorkspaceState>): void {
  flushSync(() => store.setState(partial));
}

/** What the PDF pane says with nothing built yet. */
export function emptyMessage(): string {
  return `No PDF yet. Press Build PDF or ${buildKeyLabel()}.`;
}

/**
 * Hands the pane's elements over when its component mounts, and wires what
 * needs them: the reader's place, kept while the pane is hidden, and a redraw
 * when the pane's width changes. The returned function undoes it.
 */
export function attachPdfPane(body: HTMLElement, pages: HTMLElement): () => void {
  pane = { body, pages };

  // Hiding the pane (the welcome screen over a scenario left open) takes its
  // width to 0 and its scroll to the top. Neither is the reader's doing: the
  // pages stay as drawn, and the place comes back with the pane.
  let place = { top: 0, left: 0 };
  let hidden = false;
  const onScroll = () => {
    if (body.clientWidth > 0) place = { top: body.scrollTop, left: body.scrollLeft };
  };
  body.addEventListener("scroll", onScroll);
  let settle: number | undefined;
  const observer = new ResizeObserver(() => {
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
  });
  observer.observe(body);
  pages.addEventListener("dblclick", jumpFromPage);

  return () => {
    observer.disconnect();
    body.removeEventListener("scroll", onScroll);
    pages.removeEventListener("dblclick", jumpFromPage);
    clearTimeout(settle);
    pane = null;
  };
}

/**
 * A double-click on a page moves the editor to the source line behind that
 * spot and flashes it. Silent when the shown PDF has no SyncTeX (the published
 * one), is not the open scenario's, or the spot maps to no line.
 *
 * SyncTeX tags a multi-line macro argument (an italic blurb, a table) with its
 * last line, so the words under the point, read from the page's text, narrow
 * the line down, or, with no words to match, the point's row and column in a
 * table. A page whose text cannot be read keeps SyncTeX's line.
 */
async function jumpFromPage(event: MouseEvent): Promise<void> {
  const current = shown;
  const target = event.target;
  if (!current?.synctex || !(target instanceof HTMLElement) || !target.classList.contains("pdf-page")) return;
  // The document's own source and path, not the store's: a newer build sets
  // those before its document replaces this one.
  const { synctex, source, path } = current;
  if (path === null || path !== store.getState().chosenPath || !getEditor()) return;
  const index = [...requirePane().pages.querySelectorAll(".pdf-page")].indexOf(target);
  const size = drawnSizes[index];
  if (!size) return;

  const rect = target.getBoundingClientRect();
  const point = {
    x: ((event.clientX - rect.left) * size.width) / rect.width,
    y: ((event.clientY - rect.top) * size.height) / rect.height,
  };
  const built = sourceAt(synctex, path, index + 1, point, size);
  if (built === null) return;

  let refined = built;
  try {
    let text = current.text.get(index + 1);
    if (!text) {
      text = pageText(current.doc, index + 1);
      current.text.set(index + 1, text);
    }
    refined = sourceLine(source, built, await text, point);
  } catch (error) {
    current.text.delete(index + 1);
    console.warn("The page's text could not be read:", error);
  }
  // Another document or scenario may have come while reading.
  const editor = getEditor();
  if (shown !== current || path !== store.getState().chosenPath || !editor) return;
  const line = mapLine(source, editor.getText(), refined);
  editor.revealLine(line);
  editor.flashLine(line);

  // Stacked panes: the editor may be off screen. Side by side, it never is.
  const editorPane = document.querySelector("#editor-pane");
  if (!editorPane) return;
  const box = editorPane.getBoundingClientRect();
  const visible = box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
  if (!visible) editorPane.scrollIntoView({ block: "nearest" });
}

/** Drops the shown document and whatever render or load is in flight. */
function forgetDocument(): void {
  loadTicket += 1;
  renderTicket += 1;
  shown?.task.destroy();
  shown = null;
  pane?.pages.replaceChildren();
}

/** Replaces the pages with a centred message or the loading spinner. */
function showPlaceholder(content: PdfPaneContent): void {
  forgetDocument();
  store.setState({ pdfPane: content });
}

export function showPdfMessage(text: string): void {
  showPlaceholder({ kind: "message", text });
}

/** @param text what the pane says while it waits */
export function showPdfLoading(text: string): void {
  showPlaceholder({ kind: "loading", text });
}

/** Empties the PDF pane and the error panel. */
export function clearPdf(): void {
  store.setState({
    lastPdf: null,
    pdfSource: null,
    pdfUploads: null,
    pdfPath: null,
    pdfDropsLastPage: false,
    downloadDisabled: true,
    buildError: null,
  });
  showPlaceholder({ kind: "empty" });
  clearErrorLine();
}

/**
 * What the shown PDF was built from, as submitBlockers takes it: the text
 * and the uploads of an in-app build. Null when no PDF is shown, or when the
 * shown one is the published PDF, which proves nothing about this copy.
 */
export function builtFingerprint(): { text: string; uploads: string } | null {
  // An empty text or an empty uploads signature (no uploads) is still set.
  const { lastPdf, pdfSource, pdfUploads } = store.getState();
  if (!lastPdf || pdfSource === null || pdfUploads === null) return null;
  return { text: pdfSource, uploads: pdfUploads };
}

/** Removes the failed build's line mark, if any. */
export function clearErrorLine(): void {
  getEditor()?.markErrorLine(null);
}

/** Puts the editor's cursor on a line and scrolls it into view, 1-based as TeX counts. */
export function jumpToLine(line: number): void {
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
 * @param blob PDF bytes, tagged application/pdf
 * @param source the editor source the PDF stands for; an edit away from it
 *   makes the PDF stale
 * @param options dropLastPage leaves the last page undrawn and uncounted,
 *   never the only one: the published PDF ends on a feedback page an
 *   in-browser build does not make. path is the scenario the PDF shows, which
 *   names the download; it defaults to the one in the editor. changes are the
 *   places, by 1-based page, to mark briefly once the pages are drawn. uploads
 *   is the uploadsSignature an in-app build compiled with; a published PDF
 *   has none. synctex is the build's parsed SyncTeX, which a double-click on a
 *   page reads to find the source line; a published PDF has none
 */
export async function showPdf(
  blob: Blob,
  source: string,
  {
    dropLastPage = false,
    path = store.getState().chosenPath,
    changes,
    uploads,
    synctex = null,
  }: {
    dropLastPage?: boolean;
    path?: string | null;
    changes?: Map<number, PageRect[]>;
    uploads?: string;
    synctex?: Synctex | null;
  } = {},
): Promise<void> {
  store.setState({
    lastPdf: blob,
    pdfSource: source,
    pdfUploads: uploads ?? null,
    pdfPath: path,
    pdfDropsLastPage: dropLastPage,
    downloadDisabled: false,
  });
  loadTicket += 1;
  const ticket = loadTicket;
  let task: PdfLoadingTask | null = null;
  try {
    const opened = await openDocument(blob);
    task = opened.task;
    const doc = await opened.ready;
    if (ticket !== loadTicket) {
      task.destroy();
      return;
    }
    // The old pages are already drawn, so the old document can go now.
    shown?.task.destroy();
    const pageCount = dropLastPage ? Math.max(doc.numPages - 1, 1) : doc.numPages;
    shown = { task, doc, pageCount, source, path, synctex, text: new Map() };
    const drawn = await renderPages();
    if (drawn && changes) markChanges(requirePane().pages, drawnSizes, changes);
  } catch (error) {
    // A task that never became the shown document has nothing else to free it.
    if (task && shown?.task !== task) task.destroy();
    if (ticket !== loadTicket) return;
    console.warn("The PDF could not be drawn:", error);
    showPdfMessage("This PDF cannot be shown here. Download it to read it.");
  }
}

/**
 * Draws the shown document's pages at the current zoom into fresh
 * canvases, then swaps them in at once and scrolls back to the reader's
 * place. Dropped unfinished when a newer render starts.
 *
 * @returns whether these pages are the ones on screen
 */
async function renderPages(): Promise<boolean> {
  if (!shown) return false;
  const { doc, pageCount } = shown;
  const { body, pages: host } = requirePane();
  renderTicket += 1;
  const ticket = renderTicket;
  // A hidden pane has no width yet; the resize observer redraws once it has one.
  const paneWidth = body.clientWidth;
  const fitWidth = Math.max(paneWidth - 2 * PAGE_MARGIN, 100);

  let drawn: Awaited<ReturnType<typeof drawPages>>;
  try {
    drawn = await drawPages(doc, pageCount, fitWidth, store.getState().pdfZoom, () => ticket === renderTicket);
  } catch (error) {
    if (ticket !== renderTicket) return false; // the document went while drawing
    throw error;
  }
  if (drawn === null) return false;

  // Read the place only now: the reader may have scrolled while this drew.
  const old = host.querySelector(".pdf-pages");
  const anchor = old instanceof HTMLElement ? scrollAnchor(pageBoxes(old), body.scrollTop) : { page: 0, offset: 0 };
  const across = body.scrollWidth > 0 ? (body.scrollLeft + body.clientWidth / 2) / body.scrollWidth : 0.5;
  // The placeholder leaves the pane before the pages are measured.
  commit({ pdfPane: { kind: "pages" }, pdfPageCount: pageCount });
  host.replaceChildren(drawn.container);
  drawnWidth = paneWidth;
  drawnSizes = drawn.sizes;
  body.scrollTop = anchorScrollTop(pageBoxes(drawn.container), anchor);
  body.scrollLeft = across * body.scrollWidth - body.clientWidth / 2;
  return true;
}

/** Redraws the shown pages, if any, keeping the reader's place. */
function redraw(): void {
  if (!shown) return;
  const ticket = loadTicket;
  renderPages().catch((error) => {
    if (ticket !== loadTicket) return;
    console.warn("The PDF could not be redrawn:", error);
  });
}

/** @param value share of the fit-to-width size */
export function setZoom(value: number): void {
  store.setState({ pdfZoom: value });
  redraw();
}

/** One step in or out from the current zoom. */
export function stepZoom(direction: 1 | -1): void {
  setZoom(zoomStep(store.getState().pdfZoom, direction));
}

/** Whether the zoom can go no further out, and no further in. */
export function zoomLimits(zoom: number): { min: boolean; max: boolean } {
  return { min: zoom <= ZOOM_STEPS[0], max: zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] };
}

/**
 * Shows the build's first error. With an errorLine it is a button that
 * jumps the editor there, and that line stays marked until the next build.
 */
export function showError(record: Pick<BuildRecord, "firstError" | "errorLine" | "log">): void {
  clearErrorLine();
  const error: BuildErrorState = {
    id: (errorSeq += 1),
    firstError: record.firstError || "The build failed, but no specific LaTeX error line was found in the log.",
    errorLine: record.errorLine ?? null,
    log: record.log || "",
  };
  store.setState({ buildError: error });
  // The mark stays until the next build, and follows its line through edits.
  if (error.errorLine !== null) requireEditor().markErrorLine(error.errorLine);
}

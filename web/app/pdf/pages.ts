import { PNG_DPI } from "../../shared/page-images.ts";
import type { PageBox } from "../../shared/pdf-viewport.ts";
import { type PageRect, pageHighlights } from "../../shared/synctex.ts";
import { openDocument, type PdfDocument } from "./pdfjs.ts";

/** Space around and between pages, in px. Matches .pdf-pages in styles/app.css. */
export const PAGE_MARGIN = 12;

/** How far a change mark reaches past the box it marks, in px. */
const CHANGE_MARK_OUTSET = 2;

/** A page's size in PDF points. */
export interface PageSize {
  width: number;
  height: number;
}

/** The top and height of every page in the pane's scrolled content. */
export function pageBoxes(pages: HTMLElement): PageBox[] {
  return [...pages.querySelectorAll<HTMLElement>(".pdf-page")].map((page) => ({
    top: page.offsetTop,
    height: page.offsetHeight,
  }));
}

/**
 * Draws a document's first `pageCount` pages into fresh canvases, one
 * container, fitted to `fitWidth` at `zoom`. Stops and returns null as soon
 * as `current()` says a newer render has begun.
 */
export async function drawPages(
  doc: PdfDocument,
  pageCount: number,
  fitWidth: number,
  zoom: number,
  current: () => boolean,
): Promise<{ container: HTMLDivElement; sizes: PageSize[] } | null> {
  const pixelRatio = window.devicePixelRatio || 1;
  const container = document.createElement("div");
  container.className = "pdf-pages";
  const sizes: PageSize[] = [];

  for (let number = 1; number <= pageCount; number += 1) {
    const page = await doc.getPage(number);
    if (!current()) return null;
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
    if (!current()) return null;
    container.append(canvas);
  }
  return { container, sizes };
}

/**
 * Marks places on the drawn pages for a moment. The marks share one layer,
 * which fades out and removes itself; a redraw drops it if still showing.
 *
 * @param container the .pdf-pages element
 * @param sizes each drawn page's size in PDF points, in page order
 * @param changes rects in PDF points, by 1-based page
 */
export function markChanges(container: HTMLElement, sizes: PageSize[], changes: Map<number, PageRect[]>): void {
  const pages = container.querySelectorAll(".pdf-page");
  const layer = document.createElement("div");
  layer.className = "pdf-changes";
  for (const [number, rects] of changes) {
    const page = pages[number - 1];
    const size = sizes[number - 1];
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

/** Encodes a canvas as PNG bytes. */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
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
 * @param blob PDF bytes, tagged application/pdf
 * @param options dropLastPage excludes the last page, never the only one, the
 *   same rule the pane uses to exclude a published PDF's feedback page. onPage
 *   reports progress before each page renders, 1-based, against the total
 *   exported.
 * @returns one PNG per exported page, in page order
 */
export async function renderPngPages(
  blob: Blob,
  { dropLastPage = false, onPage }: { dropLastPage?: boolean; onPage?: (page: number, total: number) => void } = {},
): Promise<Uint8Array[]> {
  const { task, ready } = await openDocument(blob);
  try {
    const doc = await ready;
    const total = dropLastPage ? Math.max(doc.numPages - 1, 1) : doc.numPages;
    const scale = PNG_DPI / 72;
    const pages: Uint8Array[] = [];
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

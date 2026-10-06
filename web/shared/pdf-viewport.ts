/**
 * Zoom levels the PDF pane steps through, as a share of the width that fits
 * the pane. 1 is "fit to width", where a new pane starts.
 */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

/**
 * The next zoom level up or down from `current`. A level between two steps
 * moves to the nearer step in that direction; the ends stay where they are.
 *
 * @param direction 1 zooms in, -1 zooms out
 */
export function zoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 1e-9) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-9) ?? ZOOM_STEPS[0];
}

/**
 * Where the reader is in the document, independent of zoom and of page size:
 * the page at the top edge of the view and how far down it the edge sits.
 */
export interface PdfAnchor {
  /** zero-based index of the page at the top edge */
  page: number;
  /** how far down that page the top edge is, 0 to 1 */
  offset: number;
}

export interface PageBox {
  /** the page's top in the scrolled content, in px */
  top: number;
  height: number;
}

/**
 * The anchor for a scroll position. Above the first page (its margin) is the
 * first page's top; in a gap between pages it is the next page's top.
 *
 * @param pages in document order
 */
export function scrollAnchor(pages: PageBox[], scrollTop: number): PdfAnchor {
  for (let page = 0; page < pages.length; page += 1) {
    const { top, height } = pages[page];
    if (scrollTop < top + height) {
      const offset = height > 0 ? (scrollTop - top) / height : 0;
      return { page, offset: Math.min(1, Math.max(0, offset)) };
    }
  }
  return pages.length ? { page: pages.length - 1, offset: 1 } : { page: 0, offset: 0 };
}

/**
 * The scroll position that puts `anchor` back at the top edge. An anchor on a
 * page the document no longer has goes to the last page's end.
 *
 * @param pages in document order
 */
export function anchorScrollTop(pages: PageBox[], anchor: PdfAnchor): number {
  if (!pages.length) return 0;
  if (anchor.page >= pages.length) {
    const last = pages[pages.length - 1];
    return last.top + last.height;
  }
  const { top, height } = pages[anchor.page];
  // Page 0 at offset 0 keeps the margin above it in view.
  if (anchor.page === 0 && anchor.offset === 0) return 0;
  return top + anchor.offset * height;
}

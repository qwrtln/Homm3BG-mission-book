// The text runs of a PDF page, as pdf.js extracts them, in PDF points from the
// page's top-left: what a double-click reads to tell which words it hit.

import type { TextRun } from "../../shared/source-match.ts";
import type { PdfDocument } from "./pdfjs.ts";

/**
 * Reads one page's text runs.
 *
 * @param number 1-based page
 */
export async function pageText(doc: PdfDocument, number: number): Promise<TextRun[]> {
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const [a, b, c, d, e, f] = item.transform;
    const [x, y] = viewport.convertToViewportPoint(e, f);
    runs.push({
      str: item.str,
      x,
      y,
      width: item.width || Math.hypot(a, b) * item.str.length * 0.5,
      height: item.height || Math.hypot(c, d),
    });
  }
  return runs;
}

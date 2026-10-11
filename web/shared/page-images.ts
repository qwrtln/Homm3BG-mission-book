// File names for the PNG export: one image per shown PDF page, zipped when
// there is more than one. Kept here, not in app/pdf/view.ts, so tier
// 1 can test the naming rule without a DOM.

/** The scale a PNG export renders at: PNG_DPI / 72 against PDF points. */
export const PNG_DPI = 200;

/**
 * The file name one exported page gets, inside the zip or on its own.
 *
 * @param stem the download's base name, without extension
 * @param page 1-based page number
 * @returns e.g. "bloody_grail_1.png"
 */
export function pageImageName(stem: string, page: number): string {
  return `${stem}_${page}.png`;
}

/**
 * The zip's file name when a PNG export holds more than one page.
 *
 * @param stem the download's base name, without extension
 * @returns e.g. "bloody_grail.zip"
 */
export function pageArchiveName(stem: string): string {
  return `${stem}.zip`;
}

// The subset of pdf.js (app/vendor/pdfjs/, PDFJS_VERSION in web/vendor.env)
// that app/modules/pdf-view.js calls. The module is imported by URL at run
// time, so the type checker never reads the vendored build itself.

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  /** `data` is transferred to the worker: pass a copy the caller can lose. */
  getDocument(source: { data: Uint8Array; verbosity?: number }): PdfLoadingTask;
}

/** Owns the document it loads: destroying the task frees the document and its worker. */
interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface PdfDocument {
  numPages: number;
  /** One-based, as pdf.js counts. */
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfPageViewport;
  render(params: { canvas: HTMLCanvasElement; viewport: PdfPageViewport; transform?: number[] }): PdfRenderTask;
}

/** A page's size at one scale, in CSS pixels. */
interface PdfPageViewport {
  width: number;
  height: number;
}

interface PdfRenderTask {
  promise: Promise<void>;
  cancel(): void;
}

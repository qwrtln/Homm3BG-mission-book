// pdf.js is imported lazily, when the first PDF shows, so a page load that
// never reaches a PDF never fetches its chunk or its worker.
export type PdfJsModule = typeof import("pdfjs-dist");
export type PdfLoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask;
export type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;

let pdfjsReady: Promise<PdfJsModule> | null = null;

/** Loads pdf.js and points it at its worker, once. A failed load is tried again by the next call. */
export function loadPdfJs(): Promise<PdfJsModule> {
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

/** Hands PDF bytes to pdf.js. It sends its data to a worker, which detaches it, so this copy is its own and the blob stays whole. */
export async function openDocument(blob: Blob): Promise<{ task: PdfLoadingTask; ready: Promise<PdfDocument> }> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  return { task, ready: task.promise };
}

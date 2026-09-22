import { el, escapeHtml } from "./dom.js";
import { state } from "./state.js";

/** Empties the PDF pane and the error panel. @returns {void} */
export function clearPdf() {
  state.lastPdf = null;
  el("download").disabled = true;
  el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">No PDF yet. Press Build PDF.</div>';
  el("error-panel").hidden = true;
}

/**
 * @param {Blob} blob PDF bytes, tagged application/pdf
 * @returns {void}
 */
export function showPdf(blob) {
  state.lastPdf = blob;
  const url = URL.createObjectURL(blob);
  el("pdf-body").innerHTML = `<embed class="pdf-view" type="application/pdf" src="${url}">`;
  el("download").disabled = false;
}

/**
 * @param {string} text what the pane says while it waits
 * @returns {void}
 */
export function showPdfLoading(text) {
  el("pdf-body").innerHTML =
    `<div class="empty-pdf loading"><span class="spinner big"></span><p>${escapeHtml(text)}</p></div>`;
}

/**
 * @param {Pick<BuildRecord, "firstError" | "log">} record
 * @returns {void}
 */
export function showError(record) {
  el("error-panel").hidden = false;
  el("first-error").textContent =
    record.firstError || "The build failed, but no specific LaTeX error line was found in the log.";
  el("full-log").textContent = record.log || "";
  el("full-log-details").open = false;
}

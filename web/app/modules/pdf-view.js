import { state } from "./state.js";
import { el, escapeHtml } from "./dom.js";

export function clearPdf() {
  state.lastPdf = null;
  state.lastResult = null;
  el("download").disabled = true;
  el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">No PDF yet. Press Build PDF.</div>';
  el("error-panel").hidden = true;
}

export function showPdf(blob) {
  state.lastPdf = blob;
  const url = URL.createObjectURL(blob);
  el("pdf-body").innerHTML = `<embed class="pdf-view" type="application/pdf" src="${url}">`;
  el("download").disabled = false;
}

export function showPdfLoading(text) {
  el("pdf-body").innerHTML = `<div class="empty-pdf loading"><span class="spinner big"></span><p>${escapeHtml(text)}</p></div>`;
}

export function showError(record) {
  el("error-panel").hidden = false;
  el("first-error").textContent = record.firstError || "The build failed, but no specific LaTeX error line was found in the log.";
  el("full-log").textContent = record.log || "";
  el("full-log-details").open = false;
}

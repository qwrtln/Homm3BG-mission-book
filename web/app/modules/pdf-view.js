import { el, escapeHtml } from "./dom.js";
import { requireEditor, state } from "./state.js";

/** Empties the PDF pane and the error panel. @returns {void} */
export function clearPdf() {
  state.lastPdf = null;
  el("download").disabled = true;
  el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">No PDF yet. Press Build PDF.</div>';
  el("error-panel").hidden = true;
  clearErrorLine();
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

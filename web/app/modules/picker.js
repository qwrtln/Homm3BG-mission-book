import { collectReferencedAssets, collectReferencedGlyphs, glyphFilesFor } from "../../shared/build-plan.js";
import { TEMPLATES, publishedPdfUrl } from "./config.js";
import { state } from "./state.js";
import { errorMessage } from "../../shared/errors.js";
import { validateScenarioName } from "../../shared/scenario-name.js";
import { el, basenameNoExt } from "./dom.js";
import { preloadFile, preloadText } from "./files.js";
import { commitEntry } from "./workspace.js";

// A pick only marks a pending choice, no fetch yet; "Let's go!" needs a pick
// plus a valid name — see validateScenarioName. Picking a real scenario does
// already start downloading its pictures/PDF though — see startScenarioPrefetch.
/** @type {string | null} */
let pendingPath = null;
/** @type {string | null} draft-scenarios subdir for a template pick; null for a real entry */
let pendingCategory = null;

/**
 * Enables "Let's go!" when there is a pick and a valid name, and says which of
 * the two is missing rather than leaving a greyed-out button unexplained.
 *
 * @returns {void}
 */
export function updateGoButton() {
  const typed = el("scenario-name").value;
  const check = validateScenarioName(typed);
  const nameError = el("name-error");
  // An empty field is not yet a mistake: the go hint asks for the name instead.
  const showNameError = !check.valid && typed.trim().length > 0;
  nameError.textContent = showNameError ? check.message : "";
  nameError.hidden = !showNameError;
  el("scenario-name").setAttribute("aria-invalid", showNameError ? "true" : "false");

  el("go").disabled = !pendingPath || !check.valid;
  el("go-hint").textContent = !pendingPath
    ? "Pick a scenario or a blank template first."
    : check.message;
}

/**
 * Marks a pick without fetching the source yet, and starts its prefetch.
 *
 * @param {string} path the entry's repository path
 * @param {string} title what the picked row says
 * @param {string | null} [category] template picks only
 * @returns {void}
 */
export function selectPending(path, title, category = null) {
  pendingPath = path;
  pendingCategory = category;
  // The search box itself shows the pick: what was typed to find it is spent.
  el("search").value = title;
  el("search-results").hidden = true;
  updateGoButton();
  // A template has no pictures and no published branch to fetch.
  const isTemplate = Object.values(TEMPLATES).some((t) => t.path === path);
  if (!isTemplate) startScenarioPrefetch(path);
}

// commitEntry awaits this same promise rather than fetching again. Picking a
// second scenario aborts the first's in-flight requests (one AbortController
// per prefetch); nothing already finished is discarded, since preloadFile
// only writes to the cache once its own fetch has completed.
/**
 * @param {string} path
 * @returns {void}
 */
export function startScenarioPrefetch(path) {
  if (state.scenarioPrefetch) {
    if (state.scenarioPrefetch.path === path) return; // already running (or done) for this exact pick
    state.scenarioPrefetch.controller.abort();
  }
  const controller = new AbortController();
  state.scenarioPrefetch = { path, controller, promise: prefetchScenario(path, controller.signal) };
}

/**
 * Downloads one scenario's pictures and its published PDF, if there is one.
 * Never throws: a miss here is retried at build time.
 *
 * @param {string} path
 * @param {AbortSignal} signal
 * @returns {Promise<{pdfBlob: Blob | null}>}
 */
export async function prefetchScenario(path, signal) {
  try {
    const source = await preloadText(path, signal);
    const filePaths = [...collectReferencedAssets(source), ...glyphFilesFor(collectReferencedGlyphs(source))];
    for (const filePath of filePaths) {
      if (signal.aborted) return { pdfBlob: null };
      try {
        await preloadFile(filePath, signal);
      } catch {
        // genuine miss: retried at Build time through the same cache
      }
    }
    if (signal.aborted) return { pdfBlob: null };

    const response = await fetch(publishedPdfUrl(basenameNoExt(path)), { signal });
    if (!response.ok) return { pdfBlob: null };
    // GitHub's raw CDN serves this as octet-stream; showPdf's <embed> needs
    // it tagged application/pdf for the browser to pick a plugin for it.
    const raw = await response.blob();
    return { pdfBlob: raw.type === "application/pdf" ? raw : raw.slice(0, raw.size, "application/pdf") };
  } catch (error) {
    if (signal.aborted) return { pdfBlob: null };
    // Not fatal: opens normally without a preview until Build PDF is pressed.
    console.warn(`No published PDF for "${basenameNoExt(path)}":`, errorMessage(error));
    return { pdfBlob: null };
  }
}

/** Wires the welcome screen's picker controls. @returns {void} */
export function initPicker() {
  el("scenario-name").addEventListener("input", updateGoButton);
  updateGoButton(); // the cold-load hint: nothing is picked yet

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = /** @type {HTMLElement} */ (button).dataset.category ?? null;
      selectPending(TEMPLATES.scenario.path, TEMPLATES.scenario.title, category);
    });
  });
  el("scratch-campaign").addEventListener("click", () => {
    selectPending(TEMPLATES.campaign.path, TEMPLATES.campaign.title, "campaigns");
  });

  el("go").addEventListener("click", () => {
    if (!pendingPath || !validateScenarioName(el("scenario-name").value).valid) return;
    commitEntry(pendingPath, el("scenario-name").value, pendingCategory);
  });
}

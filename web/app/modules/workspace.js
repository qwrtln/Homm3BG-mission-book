import { withScenarioTitle } from "../../shared/build-plan.js";
import { newScenarioDir } from "../../shared/scenario-name.js";
import { TEMPLATES } from "./config.js";
import { clearClean, markClean } from "./dirty.js";
import { el, sanitizeFilename, setStatus } from "./dom.js";
import { loadDraft, saveDraft } from "./drafts.js";
import { preloadFile } from "./files.js";
import { githubSaveState, resetGithubSaveState, setSaveControlsVisible } from "./github-save-state.js";
import { clearPdf, showPdf, showPdfLoading } from "./pdf-view.js";
import { prefetchScenario } from "./picker.js";
import { clearRoute, endRouteLoading, reflectRoute } from "./route.js";
import { requireEditor, state } from "./state.js";
import { resetUploads } from "./uploads.js";

/**
 * Swaps the welcome screen for the workspace, resolving once the transition
 * has finished so a caller can measure the editor afterwards.
 *
 * The welcome screen asks once and commits: nothing in the workspace offers
 * a way back. Reloading returns to welcome; picking the same entry again
 * restores its autosaved draft.
 *
 * @returns {Promise<void>}
 */
export function showWorkspace() {
  return new Promise((resolve) => {
    const welcome = el("welcome");
    const workspace = el("workspace");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      welcome.hidden = true;
      workspace.hidden = false;
      setSaveControlsVisible(true);
      endRouteLoading();
      resolve();
      return;
    }
    welcome.classList.add("leaving");
    setTimeout(() => {
      welcome.hidden = true;
      welcome.classList.remove("leaving");
      workspace.hidden = false;
      setSaveControlsVisible(true);
      endRouteLoading();
      workspace.classList.remove("entering");
      void workspace.offsetWidth; // force reflow, so repeat visits replay the animation
      workspace.classList.add("entering");
      resolve();
    }, 220);
  });
}

/**
 * Loads a picked entry into the editor and shows the workspace.
 *
 * `name` is mandatory: it becomes the .tex file's identity (include path,
 * autosave key, download filename), replacing the entry's own name.
 *
 * @param {string} path the picked entry's repository path
 * @param {string} name what the contributor typed
 * @param {string | null} [category] draft-scenarios subdir, template picks only
 * @returns {Promise<void>}
 */
export async function commitEntry(path, name, category) {
  const template = Object.values(TEMPLATES).find((t) => t.path === path);
  /** @type {ScenarioEntry | TemplateEntry | undefined} */
  const entry = template
    ? { path: template.path, title: template.title, isTemplate: true }
    : state.entries.find((e) => e.path === path);
  if (!entry) return;

  const cm = requireEditor();

  await showWorkspace();
  cm.refresh(); // CodeMirror mismeasures while its host was display:none
  el("header-actions").hidden = false;

  // Keep the .tex extension: TeX's \input only appends one if missing, so a
  // name without it would 404 twice.
  const dir = newScenarioDir(entry.path, template ? category : null);
  const identity = `${dir}/${sanitizeFilename(name)}.tex`;

  resetGithubSaveState();
  state.chosenPath = identity;
  // Always the typed name: a save must never stay tied to the entry it started from.
  state.chosenTitle = name.trim();
  document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
  reflectRoute();
  el("build").disabled = state.building;
  el("download").disabled = true;
  setStatus("Loading…");

  const fetched = await preloadFile(entry.path);
  const pristineSource = /** @type {string} */ (fetched.content);

  const draft = loadDraft(identity);
  const pristine = withScenarioTitle(pristineSource, name.trim());
  cm.setValue(draft !== null ? draft : pristine);
  el("draft-note").hidden = draft === null;
  cm.focus();

  resetUploads();
  clearPdf();
  markClean(pristine); // a restored autosave differs from this, and says so

  if (!template) await showPrefetchedPdf(path);

  setStatus("Ready.");
}

/**
 * A real pick always has a prefetch already running (or done) by now, started
 * the moment it was picked. This just waits on that same promise. The
 * fallback (starting one fresh here) is only for a real pick this session
 * somehow never called selectPending for.
 *
 * @param {string} path
 * @returns {Promise<void>}
 */
async function showPrefetchedPdf(path) {
  setStatus("Finishing this scenario's downloads…", { spinning: true });
  showPdfLoading("Finishing this scenario's downloads…");
  const prefetch =
    state.scenarioPrefetch && state.scenarioPrefetch.path === path
      ? state.scenarioPrefetch
      : { path, controller: new AbortController(), promise: null };
  const promise = prefetch.promise ?? prefetchScenario(path, prefetch.controller.signal);
  prefetch.promise = promise;
  const { pdfBlob } = await promise;
  if (pdfBlob) showPdf(pdfBlob);
  else clearPdf();
}

/**
 * Opens an existing scenario to be changed where it lies: its own path, its
 * own title, no rename. What it opens is the caller's choice (the Mission
 * Book's copy, or an earlier edit branch's), so it arrives as `source`.
 *
 * A locally autosaved copy is deliberately not offered here: it would hide
 * the very source the member just chose.
 *
 * @param {string} path the scenario's repository path
 * @param {string} title
 * @param {string} source the text to put in the editor
 * @param {{startOver: boolean}} edit what the save must do about an existing edit branch
 * @returns {Promise<void>}
 */
export async function openForEdit(path, title, source, edit) {
  const cm = requireEditor();

  await showWorkspace();
  cm.refresh();
  el("header-actions").hidden = false;

  resetGithubSaveState();
  githubSaveState.edit = edit;
  state.chosenPath = path;
  state.chosenTitle = title;
  document.title = `${title} - Heroes III: The Board Game`;
  reflectRoute();
  el("build").disabled = state.building;
  el("download").disabled = true;

  cm.setValue(source);
  el("draft-note").hidden = true;
  cm.focus();

  resetUploads();
  clearPdf();
  markClean();

  await showPrefetchedPdf(path);
  setStatus("Ready.");
}

/**
 * Leaves the workspace for the welcome screen. Everything the workspace held
 * is dropped; a local autosave of the scenario stays in the browser.
 *
 * @returns {void}
 */
export function showWelcome() {
  clearTimeout(state.saveTimer ?? undefined);
  if (state.chosenPath && state.cm) saveDraft(state.chosenPath, state.cm.getValue());

  state.chosenPath = null;
  state.chosenTitle = "";
  clearClean();
  resetGithubSaveState();
  resetUploads();
  clearPdf();
  clearRoute();
  document.title = "Heroes III: The Board Game - Scenario Builder";
  el("header-actions").hidden = true;
  setSaveControlsVisible(false);
  el("build").disabled = true;
  el("download").disabled = true;
  el("draft-note").hidden = true;
  el("edit-branch-prompt").hidden = true;
  setStatus("Ready.");

  el("workspace").hidden = true;
  const welcome = el("welcome");
  welcome.hidden = false;
  welcome.classList.remove("leaving");
}

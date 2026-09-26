import { withScenarioTitle } from "../../shared/build-plan.js";
import { newScenarioDir } from "../../shared/scenario-name.js";
import { TEMPLATES } from "./config.js";
import { markClean } from "./dirty.js";
import { el, sanitizeFilename, setStatus } from "./dom.js";
import { loadDraft, saveDraft } from "./drafts.js";
import { preloadFile } from "./files.js";
import { githubSaveState, resetGithubSaveState, setSaveControlsVisible } from "./github-save-state.js";
import { setScenarioTitle } from "./header.js";
import { clearPdf, showPdf, showPdfLoading } from "./pdf-view.js";
import { prefetchScenario } from "./picker.js";
import { clearRoute, endRouteLoading, reflectRoute } from "./route.js";
import { requireEditor, state } from "./state.js";
import { resetUploads } from "./uploads.js";

/**
 * Whether the welcome screen shows over a scenario left open behind it: its
 * editor, uploads, save target and PDF all kept for "Back to editing".
 */
let parked = false;

/**
 * @returns {boolean} true while a scenario waits behind the welcome screen
 */
export function isParked() {
  return parked;
}

/**
 * Swaps the welcome screen for the workspace, resolving once the transition
 * has finished so a caller can measure the editor afterwards. Whatever the
 * caller opens next replaces the scenario left behind the welcome screen.
 *
 * @returns {Promise<void>}
 */
export function showWorkspace() {
  parked = false;
  el("back-to-editing").hidden = true;
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
  setScenarioTitle(name.trim());
  reflectRoute();
  el("build").disabled = false; // Build, or Stop mid-build: both apply
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

  const shown = !template && (await showPrefetchedPdf(path, pristineSource));

  // The published PDF is the entry's own, never the renamed copy in the editor.
  const differs = shown && cm.getValue() !== pristineSource;
  setStatus(differs ? `Published PDF of ${entry.title}. Build to see your changes.` : "Ready.");
}

/**
 * A real pick always has a prefetch already running (or done) by now, started
 * the moment it was picked. This just waits on that same promise. The
 * fallback (starting one fresh here) is only for a real pick this session
 * somehow never called selectPending for.
 *
 * @param {string} path
 * @param {string} source the text the published PDF was built from, before
 *   any rename or edit
 * @returns {Promise<boolean>} whether a published PDF is shown
 */
async function showPrefetchedPdf(path, source) {
  setStatus("Finishing this scenario's downloads…", { spinning: true });
  showPdfLoading("Finishing this scenario's downloads…");
  const prefetch =
    state.scenarioPrefetch && state.scenarioPrefetch.path === path
      ? state.scenarioPrefetch
      : { path, controller: new AbortController(), promise: null };
  const promise = prefetch.promise ?? prefetchScenario(path, prefetch.controller.signal);
  prefetch.promise = promise;
  const { pdfBlob } = await promise;
  // The nightly build behind it appends a feedback page; drop it, so the
  // pages match what Build PDF makes from the same source.
  if (!pdfBlob) {
    clearPdf();
    return false;
  }
  await showPdf(pdfBlob, source, { dropLastPage: true, path });
  return true;
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
  setScenarioTitle(title);
  reflectRoute();
  el("build").disabled = false; // Build, or Stop mid-build: both apply
  el("download").disabled = true;

  cm.setValue(source);
  el("draft-note").hidden = true;
  cm.focus();

  resetUploads();
  clearPdf();
  markClean();

  await showPrefetchedPdf(path, source);
  setStatus("Ready.");
}

/**
 * Leaves the workspace for the welcome screen. The scenario stays open behind
 * it, untouched, until another one is opened: "Back to editing" returns to
 * it. Its autosave is flushed now, as a reload drops what the page holds.
 *
 * @returns {void}
 */
export function showWelcome() {
  clearTimeout(state.saveTimer ?? undefined);
  if (state.chosenPath && state.cm) saveDraft(state.chosenPath, state.cm.getValue());

  parked = state.chosenPath !== null;
  const back = el("back-to-editing");
  back.title = `Back to editing “${state.chosenTitle}”`;
  back.setAttribute("aria-label", back.title);
  back.hidden = !parked;
  clearRoute();
  el("header-actions").hidden = true;
  setSaveControlsVisible(false);
  el("edit-branch-prompt").hidden = true;

  el("workspace").hidden = true;
  const welcome = el("welcome");
  welcome.hidden = false;
  welcome.classList.remove("leaving");
}

/**
 * Returns to the scenario left behind the welcome screen, as it was: the
 * editor, its uploads, its save target and its PDF.
 *
 * @returns {Promise<void>}
 */
export async function returnToParked() {
  if (!parked) return;
  const cm = requireEditor();
  await showWorkspace();
  cm.refresh(); // CodeMirror mismeasures while its host was display:none
  el("header-actions").hidden = false;
  reflectRoute();
  cm.focus();
}

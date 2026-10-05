import { withScenarioTitle } from "../../shared/build-plan.ts";
import { newScenarioDir, withScenarioKind } from "../../shared/scenario-name.ts";
import { store } from "../store.ts";
import { syncCategoryControl } from "./category.ts";
import { TEMPLATES } from "./config.ts";
import { markClean } from "./dirty.ts";
import { buildKeyLabel, el, readyStatus, sanitizeFilename, setStatus } from "./dom.js";
import { flushDraft, saveDraft } from "./drafts.ts";
import { preloadFile } from "./files.ts";
import { githubSaveState, resetGithubSaveState, setSaveControlsVisible } from "./github-save-state.js";
import { setScenarioTitle } from "./header.ts";
import { clearUploads, saveText, saveUploads } from "./local-store.ts";
import { clearPdf, showPdf, showPdfLoading } from "./pdf-view.js";
import { prefetchScenario } from "./picker.js";
import { offerDraftOverCopy, offerLocalDraft } from "./recovery.js";
import { clearRoute, endRouteLoading, reflectRoute } from "./route.ts";
import { requireEditor, state } from "./state.ts";
import { resetUploads, restoreUploads } from "./uploads.js";

/**
 * Whether the welcome screen shows over a scenario left open behind it: its
 * editor, uploads, save target and PDF all kept for "Back to editing". The
 * header renders its "Back to editing" button from the same store field.
 *
 * @returns {boolean} true while a scenario waits behind the welcome screen
 */
export function isParked() {
  return store.getState().parked;
}

/**
 * Swaps the welcome screen for the workspace, resolving once the transition
 * has finished so a caller can measure the editor afterwards. Whatever the
 * caller opens next replaces the scenario left behind the welcome screen.
 *
 * @returns {Promise<void>}
 */
export function showWorkspace() {
  store.setState({ parked: false });
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
 * The opening steps every new scenario shares, whatever its text comes from:
 * the workspace shown, the identity derived from the typed name and the
 * category, the title, the category control and the route set. The editor
 * still holds whatever it held before; the caller puts the text in.
 *
 * @param {string} name what the contributor typed
 * @param {string} category draft-scenarios subdir the new scenario lands in
 * @returns {Promise<{cm: CodeMirrorEditor, identity: string}>}
 */
async function openNewScenario(name, category) {
  const cm = requireEditor();

  await showWorkspace();
  cm.refresh(); // CodeMirror mismeasures while its host was display:none
  store.setState({ actionsVisible: true });

  // Keep the .tex extension: TeX's \input only appends one if missing, so a
  // name without it would 404 twice.
  const identity = newScenarioPath(name, category);

  resetGithubSaveState();
  state.chosenPath = identity;
  // Always the typed name: a save must never stay tied to the entry it started from.
  setScenarioTitle(name.trim());
  syncCategoryControl();
  // Not movable until the text is in the editor: a move now would carry
  // whatever the editor held before.
  store.setState({ categoryHold: true });
  reflectRoute();
  store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply
  return { cm, identity };
}

/**
 * The repository path a new scenario with this name is filed at.
 *
 * @param {string} name what the contributor typed
 * @param {string} category one of DRAFT_CATEGORIES
 * @returns {string} "draft-scenarios/<category>/<file>.tex"
 */
export function newScenarioPath(name, category) {
  return `${newScenarioDir(category)}/${sanitizeFilename(name)}.tex`;
}

/**
 * Loads a picked entry into the editor and shows the workspace.
 *
 * `name` is mandatory: it becomes the .tex file's identity (include path,
 * autosave key, download filename), replacing the entry's own name.
 *
 * @param {string} path the picked entry's repository path
 * @param {string} name what the contributor typed
 * @param {string} category draft-scenarios subdir the new scenario lands in
 * @returns {Promise<void>}
 */
export async function commitEntry(path, name, category) {
  const template = Object.values(TEMPLATES).find((t) => t.path === path);
  /** @type {ScenarioEntry | TemplateEntry | undefined} */
  const entry = template
    ? { path: template.path, title: template.title, isTemplate: true }
    : state.entries.find((e) => e.path === path);
  if (!entry) return;

  const { cm, identity } = await openNewScenario(name, category);
  setStatus("Loading…");

  const fetched = await preloadFile(entry.path);
  const pristineSource = /** @type {string} */ (fetched.content);

  // The heading names the kind of the category it is filed under, not its source's.
  const pristine = withScenarioKind(withScenarioTitle(pristineSource, name.trim()), category);
  const local = await offerDraftOverCopy(identity, name.trim(), entry.title, pristine);
  cm.setValue(local ? local.text : pristine);
  store.setState({ draftNote: local !== null });
  syncCategoryControl();
  cm.focus();

  resetUploads();
  restoreUploads(local ? local.uploads : []);
  clearPdf();
  markClean(pristine); // a restored autosave differs from this, and says so
  if (local === null) {
    // A replaced draft is gone from the editor; written at once so a crash
    // within the next 400 ms cannot bring it back under this key.
    saveDraft(identity, pristine);
    await saveText(identity, pristine);
    await clearUploads(identity);
  }

  // The draft may hold another scenario altogether: the published PDF goes
  // only with a fresh copy.
  const shown = !template && local === null && (await showPrefetchedPdf(path, pristineSource));

  // The published PDF is the entry's own, never the renamed copy in the editor.
  const differs = shown && cm.getValue() !== pristineSource;
  setStatus(
    differs
      ? `Published PDF of ${entry.title}. Press Build PDF or ${buildKeyLabel()} to see your changes.`
      : readyStatus(),
  );
}

/**
 * Opens a new scenario whose text was made here, by the start wizard, rather
 * than fetched. It exists nowhere else, so it is saved to the local draft at
 * once and counts as unsaved work; the files the wizard collected are staged
 * through the upload popover, which then lists them.
 *
 * @param {string} name what the contributor typed
 * @param {string} category draft-scenarios subdir the new scenario lands in
 * @param {string} source the scenario's complete .tex text
 * @param {{path: string, bytes: Uint8Array}[]} uploads files to stage, at the paths the text references
 * @returns {Promise<void>}
 */
export async function commitGeneratedEntry(name, category, source, uploads) {
  const { cm, identity } = await openNewScenario(name, category);
  cm.setValue(source);
  store.setState({ draftNote: false });
  syncCategoryControl();
  cm.focus();

  // In this order: resetUploads() would wipe anything staged before it, and
  // the clean state must see the staged files.
  resetUploads();
  restoreUploads(uploads);
  clearPdf();
  saveDraft(identity, source);
  await saveText(identity, source);
  await saveUploads(identity, uploads);
  markClean(null); // no clean copy anywhere: the text was never saved anywhere else
  setStatus(readyStatus());
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
 * A locally autosaved copy that differs from `source` is offered before it
 * would replace that copy, so edits left over from a crash or an earlier
 * session are never silently lost.
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
  store.setState({ actionsVisible: true });

  resetGithubSaveState();
  githubSaveState.edit = edit;
  state.chosenPath = path;
  setScenarioTitle(title);
  syncCategoryControl();
  reflectRoute();
  store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply

  const local = await offerLocalDraft(path, title, source);
  cm.setValue(local ? local.text : source);
  store.setState({ draftNote: local !== null });
  cm.focus();

  resetUploads();
  restoreUploads(local ? local.uploads : []);
  clearPdf();
  if (local !== null) {
    markClean(source, "");
  } else {
    // Gone from the editor; written at once so a crash within the next 400
    // ms cannot leave the old local text under this key.
    saveDraft(path, source);
    await saveText(path, source);
    await clearUploads(path);
    markClean();
  }

  await showPrefetchedPdf(path, source);
  setStatus(readyStatus());
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
  if (state.chosenPath && state.cm) void flushDraft(state.chosenPath, state.cm.getValue());

  clearRoute();
  store.setState({ parked: state.chosenPath !== null, actionsVisible: false });
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
  if (!isParked()) return;
  const cm = requireEditor();
  await showWorkspace();
  cm.refresh(); // CodeMirror mismeasures while its host was display:none
  store.setState({ actionsVisible: true });
  syncCategoryControl();
  reflectRoute();
  cm.focus();
}

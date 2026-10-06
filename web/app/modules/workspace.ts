import { flushSync } from "react-dom";
import { withScenarioTitle } from "../../shared/build-plan.ts";
import { newScenarioDir, withScenarioKind } from "../../shared/scenario-name.ts";
import { clearPdf, showPdf, showPdfLoading } from "../pdf/view.ts";
import { store } from "../store.ts";
import { syncCategoryControl } from "./category.ts";
import { TEMPLATES } from "./config.ts";
import { markClean } from "./dirty.ts";
import { buildKeyLabel, readyStatus, sanitizeFilename } from "./dom.ts";
import { cancelScheduledSave, flushDraft, saveDraft } from "./drafts.ts";
import { type EditorApi, getEditor, requireEditor } from "./editor-api.ts";
import { preloadFile } from "./files.ts";
import { githubSaveState, resetGithubSaveState, setSaveControlsVisible } from "./github-save-state.ts";
import { setScenarioTitle } from "./header.ts";
import { clearUploads, saveText, saveUploads } from "./local-store.ts";
import { prefetchScenario } from "./picker.ts";
import { offerDraftOverCopy, offerLocalDraft } from "./recovery.ts";
import { clearRoute, endRouteLoading, reflectRoute } from "./route.ts";
import { setStatus } from "./status.ts";
import { resetUploads, restoreUploads } from "./uploads.ts";

/**
 * Whether the welcome screen shows over a scenario left open behind it: its
 * editor, uploads, save target and PDF all kept for "Back to editing". The
 * header renders its "Back to editing" button from the same store field.
 *
 * @returns true while a scenario waits behind the welcome screen
 */
export function isParked(): boolean {
  return store.getState().parked;
}

/**
 * Swaps the welcome screen for the workspace, resolving once the transition
 * has finished so a caller can measure the editor afterwards. Whatever the
 * caller opens next replaces the scenario left behind the welcome screen.
 */
export function showWorkspace(): Promise<void> {
  store.setState({ parked: false });
  return new Promise((resolve) => {
    // Synchronous renders: the welcome screen is hidden and the workspace is in the page when resolve() runs.
    const enter = (): void => {
      flushSync(() =>
        store.setState((state) => ({
          workspaceShown: true,
          welcomeLeaving: false,
          workspaceEntrance: state.workspaceEntrance + 1,
        })),
      );
      setSaveControlsVisible(true);
      endRouteLoading();
      resolve();
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enter();
      return;
    }
    store.setState({ welcomeLeaving: true });
    setTimeout(enter, 220);
  });
}

/**
 * The opening steps every new scenario shares, whatever its text comes from:
 * the workspace shown, the identity derived from the typed name and the
 * category, the title, the category control and the route set. The editor
 * still holds whatever it held before; the caller puts the text in.
 *
 * @param name what the contributor typed
 * @param category draft-scenarios subdir the new scenario lands in
 */
async function openNewScenario(name: string, category: string): Promise<{ editor: EditorApi; identity: string }> {
  const editor = requireEditor();

  await showWorkspace();
  store.setState({ actionsVisible: true });

  // Keep the .tex extension: TeX's \input only appends one if missing, so a
  // name without it would 404 twice.
  const identity = newScenarioPath(name, category);

  resetGithubSaveState();
  store.setState({ chosenPath: identity });
  // Always the typed name: a save must never stay tied to the entry it started from.
  setScenarioTitle(name.trim());
  syncCategoryControl();
  // Not movable until the text is in the editor: a move now would carry
  // whatever the editor held before.
  store.setState({ categoryHold: true });
  reflectRoute();
  store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply
  return { editor, identity };
}

/**
 * The repository path a new scenario with this name is filed at.
 *
 * @param name what the contributor typed
 * @param category one of DRAFT_CATEGORIES
 * @returns "draft-scenarios/<category>/<file>.tex"
 */
export function newScenarioPath(name: string, category: string): string {
  return `${newScenarioDir(category)}/${sanitizeFilename(name)}.tex`;
}

/**
 * Loads a picked entry into the editor and shows the workspace.
 *
 * `name` is mandatory: it becomes the .tex file's identity (include path,
 * autosave key, download filename), replacing the entry's own name.
 *
 * @param path the picked entry's repository path
 * @param name what the contributor typed
 * @param category draft-scenarios subdir the new scenario lands in
 */
export async function commitEntry(path: string, name: string, category: string): Promise<void> {
  const template = Object.values(TEMPLATES).find((t) => t.path === path);
  const entry: ScenarioEntry | TemplateEntry | undefined = template
    ? { path: template.path, title: template.title, isTemplate: true }
    : store.getState().entries.find((e) => e.path === path);
  if (!entry) return;

  const { editor, identity } = await openNewScenario(name, category);
  setStatus("Loading…");

  const fetched = await preloadFile(entry.path);
  const pristineSource = fetched.content as string;

  // The heading names the kind of the category it is filed under, not its source's.
  const pristine = withScenarioKind(withScenarioTitle(pristineSource, name.trim()), category);
  const local = await offerDraftOverCopy(identity, name.trim(), entry.title, pristine);
  editor.setText(local ? local.text : pristine);
  store.setState({ draftNote: local !== null });
  syncCategoryControl();
  editor.focus();

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
  const differs = shown && editor.getText() !== pristineSource;
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
 * @param name what the contributor typed
 * @param category draft-scenarios subdir the new scenario lands in
 * @param source the scenario's complete .tex text
 * @param uploads files to stage, at the paths the text references
 */
export async function commitGeneratedEntry(
  name: string,
  category: string,
  source: string,
  uploads: { path: string; bytes: Uint8Array }[],
): Promise<void> {
  const { editor, identity } = await openNewScenario(name, category);
  editor.setText(source);
  store.setState({ draftNote: false });
  syncCategoryControl();
  editor.focus();

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
 * @param path
 * @param source the text the published PDF was built from, before any rename or edit
 * @returns whether a published PDF is shown
 */
async function showPrefetchedPdf(path: string, source: string): Promise<boolean> {
  setStatus("Finishing this scenario's downloads…", { spinning: true });
  showPdfLoading("Finishing this scenario's downloads…");
  const stored = store.getState().scenarioPrefetch;
  const prefetch = stored && stored.path === path ? stored : { path, controller: new AbortController(), promise: null };
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
 * @param path the scenario's repository path
 * @param title
 * @param source the text to put in the editor
 * @param edit what the save must do about an existing edit branch
 */
export async function openForEdit(
  path: string,
  title: string,
  source: string,
  edit: { startOver: boolean },
): Promise<void> {
  const editor = requireEditor();

  await showWorkspace();
  store.setState({ actionsVisible: true });

  resetGithubSaveState();
  githubSaveState.edit = edit;
  store.setState({ chosenPath: path });
  setScenarioTitle(title);
  syncCategoryControl();
  reflectRoute();
  store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply

  const local = await offerLocalDraft(path, title, source);
  editor.setText(local ? local.text : source);
  store.setState({ draftNote: local !== null });
  editor.focus();

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
 */
export function showWelcome(): void {
  const { chosenPath } = store.getState();
  cancelScheduledSave();
  const editor = getEditor();
  if (chosenPath && editor) void flushDraft(chosenPath, editor.getText());

  clearRoute();
  store.setState({
    parked: chosenPath !== null,
    actionsVisible: false,
    editBranch: null,
    workspaceShown: false,
    welcomeLeaving: false,
  });
  setSaveControlsVisible(false);
}

/**
 * Returns to the scenario left behind the welcome screen, as it was: the
 * editor, its uploads, its save target and its PDF.
 */
export async function returnToParked(): Promise<void> {
  if (!isParked()) return;
  const editor = requireEditor();
  await showWorkspace();
  store.setState({ actionsVisible: true });
  syncCategoryControl();
  reflectRoute();
  editor.focus();
}

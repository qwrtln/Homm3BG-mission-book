// The welcome screen's picker logic: what is picked, and where it is filed.
// components/welcome/{PickerMain,SearchCombobox,ModeChoice}.tsx render from
// the store fields this writes; this module holds the behavior the modules
// not yet migrated (github/*.ts) still call into.

import { collectReferencedAssets, collectReferencedGlyphs, glyphFilesFor } from "../../shared/build-plan.ts";
import { errorMessage } from "../../shared/errors.ts";
import { categoryOfPath } from "../../shared/scenario-name.ts";
import { store } from "../store.ts";
import { publishedPdfUrl, TEMPLATES } from "./config.ts";
import { basenameNoExt } from "./dom.ts";
import { preloadFile, preloadText } from "./files.ts";
import { showPicker } from "./wizard.ts";

/** Set by the GitHub module, which owns the edit flow. */
let editHandler: ((path: string, title: string) => void) | null = null;

/** Registers what "Open editor" runs in edit mode. */
export function onEditPick(handler: (path: string, title: string) => void): void {
  editHandler = handler;
}

/** Runs the registered edit handler, if "Open editor" was pressed in edit mode with a pick. */
export function openEditPick(path: string, title: string): void {
  editHandler?.(path, title);
}

/**
 * @param path
 * @returns whether path names one of config.ts's TEMPLATES rather than a real entry
 */
export function isTemplatePath(path: string): boolean {
  return Object.values(TEMPLATES).some((t) => t.path === path);
}

/**
 * Whether a blank template can be picked now. Edit mode opens an existing
 * scenario, so it has no blank templates.
 */
export function blanksAllowed(): boolean {
  return store.getState().pickerMode === "new";
}

/**
 * Switches between adding a new scenario and editing an existing one. Edit
 * mode has no name step and no blank templates: the scenario keeps its own
 * name and path. Both stay on screen, greyed out, so the picker looks the
 * same in either mode.
 */
export function setPickerMode(mode: "new" | "edit"): void {
  const { pendingPath } = store.getState();
  store.setState({ pickerMode: mode, pickerError: null });
  // The wizard only starts new scenarios, so edit mode has no use for it: the
  // start choice (components/wizard/StartChoice.tsx) hides itself from pickerMode.
  if (mode === "edit") showPicker();
  store.setState({ editBranch: null });
  // A blank template picked in new mode is not something an edit can open.
  if (mode === "edit" && pendingPath && isTemplatePath(pendingPath)) {
    store.setState({ pendingPath: null, pendingTitle: "", chosenCategory: null });
  }
}

/**
 * Settles the welcome screen once membership is known: a member gets the
 * mode choice above the picker, everyone else sees nothing new.
 */
export function settleModes(isMember: boolean): void {
  store.setState({ isMember });
  setPickerMode("new");
}

/**
 * Marks a pick without fetching the source yet, and starts its prefetch.
 *
 * @param path the entry's repository path
 * @param title what the picked row says
 * @param category the category to file under; a copy defaults to its source's own
 */
export function selectPending(path: string, title: string, category: string | null = null): void {
  store.setState({
    pendingPath: path,
    pendingTitle: title,
    chosenCategory: category ?? categoryOfPath(path),
    pickerError: null,
  });
  // A template has no pictures and no published branch to fetch.
  if (!isTemplatePath(path)) startScenarioPrefetch(path);
}

/**
 * Picks the blank template for one category. The campaign has a template of
 * its own; every other category shares the scenario template.
 *
 * @param category draft-scenarios subdirectory, e.g. "clash" or "campaigns"
 */
export function pickBlank(category: string): void {
  const template = category === "campaigns" ? TEMPLATES.campaign : TEMPLATES.scenario;
  selectPending(template.path, template.title, category);
}

/**
 * A radio in the "Game mode" group was checked. A blank pick follows it,
 * since the campaign has a template of its own; a copy keeps its source.
 */
export function chooseCategory(category: string): void {
  const { pendingPath } = store.getState();
  if (pendingPath && isTemplatePath(pendingPath)) {
    pickBlank(category);
    return;
  }
  store.setState({ chosenCategory: category });
}

// commitEntry awaits this same promise rather than fetching again. Picking a
// second scenario aborts the first's in-flight requests (one AbortController
// per prefetch); nothing already finished is discarded, since preloadFile
// only writes to the cache once its own fetch has completed.
export function startScenarioPrefetch(path: string): void {
  const running = store.getState().scenarioPrefetch;
  if (running) {
    if (running.path === path) return; // already running (or done) for this exact pick
    running.controller.abort();
  }
  const controller = new AbortController();
  store.setState({ scenarioPrefetch: { path, controller, promise: prefetchScenario(path, controller.signal) } });
}

/**
 * Downloads one scenario's pictures and its published PDF, if there is one.
 * Never throws: a miss here is retried at build time.
 */
export async function prefetchScenario(path: string, signal: AbortSignal): Promise<{ pdfBlob: Blob | null }> {
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
    // GitHub's raw CDN serves this as octet-stream. pdf.js reads the bytes
    // either way; the tag is for Download, so the saved file opens as a PDF.
    const raw = await response.blob();
    return { pdfBlob: raw.type === "application/pdf" ? raw : raw.slice(0, raw.size, "application/pdf") };
  } catch (error) {
    if (signal.aborted) return { pdfBlob: null };
    // Not fatal: opens normally without a preview until Build PDF is pressed.
    console.warn(`No published PDF for "${basenameNoExt(path)}":`, errorMessage(error));
    return { pdfBlob: null };
  }
}

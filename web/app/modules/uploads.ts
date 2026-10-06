import { sanitizeFilename } from "../../shared/dom-strings.ts";
import { openDialog, store } from "../store.ts";
import { refreshUnsavedNote } from "./dirty.ts";
import { saveUploads } from "./local-store.ts";
import { state } from "./state.ts";
import { showToast } from "./toast.ts";
import { configureUploadPanel, resetUploadPanel, restoreUploadPanel } from "./upload-panel.ts";

// No server: a chosen file never leaves the browser, it just joins the
// virtual filesystem the build compiles from, under an editable target name.
// The cards, naming and drops are upload-panel.ts's and components/uploads/'s;
// the start wizard draws the same panel into its own panes.

// True between resetUploads() and the matching restoreUploads() of an open
// path. The panel's own reset/restore can each fire onChange while the
// staged map is in a transitional state (emptied, or only half restored);
// persisting then would store that transitional set over the one about to
// be offered, rather than a real user change.
let restoring = false;

/** Clears every staged upload and its controls. */
export function resetUploads(): void {
  restoring = true;
  store.getState().uploadedFiles.clear();
  resetUploadPanel("dialog");
}

/**
 * Puts a resumed draft's committed assets back into the upload controls, so
 * "Save again" keeps carrying them.
 */
export function restoreUploads(files: { path: string; bytes: Uint8Array }[]): void {
  restoreUploadPanel("dialog", files);
  restoring = false;
}

/**
 * Persists the staged map at once, as the uploads panel's own autosave.
 * Skipped while an open path is between resetUploads() and restoreUploads().
 */
function persistStagedUploads(): void {
  refreshUnsavedNote();
  if (restoring || !state.chosenPath) return;
  const assets = [...state.uploadedFiles].map(([path, bytes]) => ({ path, bytes }));
  void saveUploads(state.chosenPath, assets);
}

/** The header's "Upload images" button: opens the uploads dialog. */
export function openUploadDialog(): void {
  openDialog("upload");
}

/** Tells the uploads dialog's panel how to name its files and what to do when they change. */
export function initUploads(): void {
  configureUploadPanel("dialog", {
    slug: () => sanitizeFilename(state.chosenTitle),
    onChange: persistStagedUploads,
    notify: showToast,
  });
}

import { refreshUnsavedNote } from "./dirty.ts";
import { el, sanitizeFilename } from "./dom.js";
import { saveUploads } from "./local-store.ts";
import { state } from "./state.ts";
import { showToast } from "./toast.js";
import {
  createUploadPanel,
  MAP_EDITOR_URL,
  MAX_MAP_FILES,
  readAsUint8Array,
  sanitizeUploadName,
} from "./upload-panel.js";

// No server: a chosen file never leaves the browser, it just joins the
// virtual filesystem the build compiles from, under an editable target name.
// The cards, naming and drops are upload-panel.js's; the start wizard draws
// the same panel into its own panes.
export { MAX_MAP_FILES, readAsUint8Array, sanitizeUploadName };

const HEADER_HINT = "PNG or JPG. Named after the scenario; rename it if you like.";
const MAPS_HINT = `PNG exported from the <a href="${MAP_EDITOR_URL}" target="_blank" rel="noopener">map editor</a>. Add one image for the whole scenario, or one per player-count layout and tick the counts it is for.`;

/** @type {import("./upload-panel.js").UploadPanel | null} */
let popover = null;

/** @returns {import("./upload-panel.js").UploadPanel} the popover's panel, once initUploads ran */
function panel() {
  if (!popover) throw new Error("initUploads() has not run.");
  return popover;
}

// True between resetUploads() and the matching restoreUploads() of an open
// path. The panel's own reset/restore can each fire onChange while the
// staged map is in a transitional state (emptied, or only half restored);
// persisting then would store that transitional set over the one about to
// be offered, rather than a real user change.
let restoring = false;

/** Clears every staged upload and its controls. @returns {void} */
export function resetUploads() {
  restoring = true;
  state.uploadedFiles.clear();
  panel().reset();
}

/**
 * Puts a resumed draft's committed assets back into the upload controls, so
 * "Save again" keeps carrying them.
 *
 * @param {{path: string, bytes: Uint8Array}[]} files
 * @returns {void}
 */
export function restoreUploads(files) {
  panel().restore(files);
  restoring = false;
}

/**
 * Persists the staged map at once, as the uploads panel's own autosave.
 * Skipped while an open path is between resetUploads() and restoreUploads().
 *
 * @returns {void}
 */
function persistStagedUploads() {
  refreshUnsavedNote();
  if (restoring || !state.chosenPath) return;
  const assets = [...state.uploadedFiles].map(([path, bytes]) => ({ path, bytes }));
  void saveUploads(state.chosenPath, assets);
}

/** Wires the uploads dialog and its two file inputs. @returns {void} */
export function initUploads() {
  el("upload-open").addEventListener("click", () => el("upload-dialog").showModal());
  popover = createUploadPanel({
    elements: {
      headerInput: el("upload-header"),
      headerAdd: el("upload-header-add"),
      headerCard: el("upload-header-card"),
      headerName: el("upload-header-name"),
      headerOrig: el("upload-header-orig"),
      headerPreview: el("upload-header-preview"),
      headerRemove: el("upload-header-remove"),
      headerStatus: el("upload-header-status"),
      headerZone: el("upload-header-field"),
      mapsInput: el("upload-maps"),
      mapsAdd: el("upload-maps-add"),
      mapsList: el("upload-maps-names"),
      mapsStatus: el("upload-maps-status"),
      mapsZone: el("upload-maps-field"),
    },
    slug: () => sanitizeFilename(state.chosenTitle),
    staged: state.uploadedFiles,
    mapCodes: true,
    headerHint: HEADER_HINT,
    mapsHint: MAPS_HINT,
    onChange: persistStagedUploads,
    notify: showToast,
  });
}

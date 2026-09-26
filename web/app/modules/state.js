/**
 * The one shared mutable object the modules read and write. Its shape is
 * AppState, declared in web/types/app.d.ts.
 *
 * @type {AppState}
 */
export const state = {
  entries: [], // every scenario the search can offer (mission + draft, not templates)
  chosenPath: null, // path of the entry currently loaded in the editor
  chosenTitle: "",
  building: false,
  runner: null,
  lastPdf: null,
  pdfSource: null, // the editor source lastPdf was made from
  pdfPath: null, // the scenario lastPdf shows, which names its download
  cm: null, // CodeMirror instance, created once over #editor

  // Files a contributor added from their own machine, not the repository: a
  // new header image or new map art the scenario does not have committed
  // yet. Keyed by the repository path the build should see them at, so a
  // build both fetches around them and prefers them outright when a path
  // collides with a real repo file.
  uploadedFiles: new Map(), // path -> Uint8Array

  saveTimer: null,

  // {path, controller, promise}
  scenarioPrefetch: null,

  clean: null,
};

/**
 * The editor instance, for the paths that cannot run before initEditor has
 * made it. Throws rather than returning null, so no caller has to assert a
 * shape the type system cannot see.
 *
 * @returns {CodeMirrorEditor}
 */
export function requireEditor() {
  if (state.cm === null) throw new Error("The editor is not ready yet.");
  return state.cm;
}

/**
 * The one shared mutable object the modules read and write. Its shape is
 * AppState, declared in web/types/app.d.ts.
 *
 * @type {AppState}
 */
export const state = {
  entries: [],           // every scenario the search can offer (mission + draft, not templates)
  chosenPath: null,      // path of the entry currently loaded in the editor
  chosenTitle: "",
  building: false,
  runner: null,
  lastPdf: null,
  lastResult: null,      // read by the headless capture (window.__probeResults)
  cm: null,               // CodeMirror instance, created once over #editor

  // Files a contributor added from their own machine, not the repository: a
  // new header image or new map art the scenario does not have committed
  // yet. Keyed by the repository path the build should see them at, so a
  // build both fetches around them and prefers them outright when a path
  // collides with a real repo file.
  uploadedFiles: new Map(), // path -> Uint8Array

  saveTimer: null,

  // {path, controller, promise}
  scenarioPrefetch: null,
};

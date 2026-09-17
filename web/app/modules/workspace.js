import { TEMPLATES } from "./config.js";
import { state } from "./state.js";
import { el, setStatus, sanitizeFilename } from "./dom.js";
import { loadDraft } from "./drafts.js";
import { preloadFile } from "./files.js";
import { clearPdf, showPdf, showPdfLoading } from "./pdf-view.js";
import { resetUploads } from "./uploads.js";
import { resetGithubSaveState } from "./github-save-state.js";
import { prefetchScenario } from "./picker.js";

// The welcome screen asks once and commits: nothing in the workspace offers
// a way back. Reloading returns to welcome; picking the same entry again restores its autosaved draft.
export function showWorkspace() {
  return new Promise((resolve) => {
    const welcome = el("welcome");
    const workspace = el("workspace");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      welcome.hidden = true;
      workspace.hidden = false;
      resolve();
      return;
    }
    welcome.classList.add("leaving");
    setTimeout(() => {
      welcome.hidden = true;
      welcome.classList.remove("leaving");
      workspace.hidden = false;
      workspace.classList.remove("entering");
      void workspace.offsetWidth; // force reflow, so repeat visits replay the animation
      workspace.classList.add("entering");
      resolve();
    }, 220);
  });
}

// name is mandatory: it becomes the .tex file's identity (include path,
// autosave key, download filename), replacing the entry's own name.
export async function commitEntry(path, name, category) {
  const template = Object.values(TEMPLATES).find((t) => t.path === path);
  const entry = template
    ? { path: template.path, title: template.title, isTemplate: true }
    : state.entries.find((e) => e.path === path);
  if (!entry) return;

  await showWorkspace();
  state.cm.refresh(); // CodeMirror mismeasures while its host was display:none
  el("header-actions").hidden = false;

  // Keep the .tex extension: TeX's \input only appends one if missing, so a
  // name without it would 404 twice.
  const dir = template ? `draft-scenarios/${category}` : entry.path.split("/").slice(0, -1).join("/");
  const identity = `${dir}/${sanitizeFilename(name)}.tex`;

  resetGithubSaveState();
  state.chosenPath = identity;
  // Always the typed name: a save must never stay tied to the entry it started from.
  state.chosenTitle = name.trim();
  document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
  el("build").disabled = state.building;
  el("download").disabled = true;
  setStatus("Loading…");

  const fetched = await preloadFile(entry.path);
  const pristineSource = fetched.content;

  const draft = loadDraft(identity);
  state.cm.setValue(draft !== null ? draft : pristineSource);
  el("draft-note").hidden = draft === null;
  state.cm.focus();

  resetUploads();
  clearPdf();

  // A real pick always has a prefetch already running (or done) by now,
  // started the moment it was picked. This just waits on that same
  // promise. The fallback (starting one fresh here) is only for a real
  // pick this session somehow never called selectPending for.
  if (!template) {
    setStatus("Finishing this scenario's downloads…", { spinning: true });
    showPdfLoading("Finishing this scenario's downloads…");
    const prefetch = state.scenarioPrefetch && state.scenarioPrefetch.path === path
      ? state.scenarioPrefetch
      : { path, controller: new AbortController(), promise: null };
    if (!prefetch.promise) prefetch.promise = prefetchScenario(path, prefetch.controller.signal);
    const { pdfBlob } = await prefetch.promise;
    if (pdfBlob) showPdf(pdfBlob); else clearPdf();
  }

  setStatus("Ready.");
}

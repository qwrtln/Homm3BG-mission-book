import { BusyTexRunner, LuaLatex } from "../shared/vendor/texlyre-busytex.js";
import {
  GROUP_FILES, DRAFT_GROUP_FILES, parseScenarioIndex, scenarioHeading,
  ALWAYS_PRELOAD, CARRIED_TEXMF, CORE_GLYPHS, glyphFilesFor, collectReferencedAssets,
  collectReferencedGlyphs, planScenarioBuild, firstError, pageCount,
  missingFiles, newMissingPaths, MAX_FETCH_ON_MISS_ATTEMPTS,
} from "../shared/build-plan.js";
import { getToken, signIn, completeSignIn } from "../shared/github-auth.js";
import { saveScenarioToRepo, GithubApiError } from "../shared/github-contrib.js";

// The engine's data-package base path. serve.py (and any static file server
// rooted at the repository root) makes this reachable at a root-relative
// path. The engine payload itself is fetched from web/core/busytex/,
// gitignored locally and populated by the deploy workflow in production.
//
// GitHub Pages serves this project under a path prefix
// (/Homm3BG-mission-book/), so a root-absolute path like "/web/core/busytex"
// resolves against the wrong origin root and 404s in production, even
// though it works locally where there is no prefix.
//
// BASE also crosses into the BusyTeX worker's own script, which resolves
// it relative to the worker's URL (web/core/busytex/busytex_worker.js), not
// to this page. A plain relative string breaks there. Resolving it to a
// full URL up front, on this page, sidesteps the difference: an
// already-absolute URL resolves the same way wherever it is read from.
const BASE = new URL("../core/busytex", document.baseURI).href;
// web/repo/ does not exist as a real directory. Locally, serve.py aliases
// it to the repository root. In production, the deploy workflow copies the
// source directories the app reads there directly. REPO only ever resolves
// on this page, never inside the worker, so a plain relative path is safe
// here.
const REPO = "../repo";

// The two blank-start entry points. Each template file is itself a
// scenario-shaped .tex file, so it can be \include{}d by structure.tex the
// same way, with no special-casing in planScenarioBuild.
const TEMPLATES = {
  scenario: { path: "templates/default.tex", title: "Blank scenario" },
  campaign: { path: "templates/campaign.tex", title: "Blank campaign scenario" },
};

// The directory name each group table uses maps to the display category a
// user actually asked for: coop, clash, alliance, campaign. This is a
// different grouping than scenarioHeading's "kind" (the gameplay blurb
// printed in the book itself), which is prose, not a stable category.
const CATEGORY_LABELS = { coops: "Coop", clash: "Clash", campaigns: "Campaign", alliances: "Alliance" };
const CATEGORY_ORDER = ["Coop", "Clash", "Campaign", "Alliance"];

const el = (id) => document.getElementById(id);

let entries = [];           // every scenario the search can offer (mission + draft, not templates)
let chosenPath = null;      // path of the entry currently loaded in the editor
let chosenTitle = "";
let building = false;
let runner = null;
let lastPdf = null;
let lastResult = null;      // read by the headless capture (window.__probeResults)
let cm = null;               // CodeMirror instance, created once over #editor

// Files a contributor added from their own machine, not the repository: a
// new header image or new map art the scenario does not have committed
// yet. Keyed by the repository path the build should see them at, so a
// build both fetches around them and prefers them outright when a path
// collides with a real repo file.
let uploadedFiles = new Map(); // path -> Uint8Array

function storageKey(path) {
  return `wasm-scenario-builder:draft:${path}`;
}

function loadDraft(path) {
  try {
    return localStorage.getItem(storageKey(path));
  } catch {
    return null; // private mode, blocked storage: fall back to the pristine source
  }
}

function saveDraft(path, text) {
  try {
    localStorage.setItem(storageKey(path), text);
  } catch {
    // Storage can be full or blocked. Losing autosave is not fatal.
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!chosenPath) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(chosenPath, cm.getValue()), 400);
}

async function fetchRepoFile(path, signal) {
  return fetchAt(`${REPO}/${path}`, path, signal);
}

// Fetches a file by a URL relative to this page, rather than to REPO.
// web/shared/texmf/ is one such case: it ships alongside the app under
// web/, in both the local and the deployed layout, so it never needs
// REPO's aliasing.
//
// signal is optional: pass an AbortController's, and the caller can cancel
// this fetch mid-flight without that showing up as a real error. Nothing
// lands in preloadedFiles below unless a fetch actually finishes.
async function fetchAt(url, path, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const isText = /\.(tex|sty|cls|cfg|txt|map|enc|json|pdf_tex)$/.test(path);
  return isText
    ? { path, content: await response.text() }
    : { path, content: new Uint8Array(await response.arrayBuffer()) };
}

// --- Shared file cache ------------------------------------------------------
//
// Almost every file a build reads is the same no matter which scenario is
// picked: every font, metadata.tex, the carried texmf packages, and the
// whole glyph set. Only a scenario's own referenced pictures actually vary
// by pick. This cache holds whichever of those files have already been
// fetched, by path, so nothing is ever fetched twice.
const preloadedFiles = new Map(); // path -> {path, content}

async function preloadFile(path, signal) {
  if (preloadedFiles.has(path)) return preloadedFiles.get(path);
  const file = await fetchRepoFile(path, signal);
  preloadedFiles.set(path, file);
  return file;
}

async function preloadTexmfFile(name, signal) {
  const key = `texmf/${name}`;
  if (preloadedFiles.has(key)) return preloadedFiles.get(key);
  const file = await fetchAt(`../shared/texmf/${name}`, key, signal);
  preloadedFiles.set(key, file);
  return file;
}

// Runs once, in the background, from the moment the page opens: every file
// every scenario needs alike, fetched before any scenario is even picked.
// Only CORE_GLYPHS (the block every scenario draws, whatever it says) is
// worth fetching blind. A failure here is not fatal; runBuild's own fetch,
// through the same cache, surfaces it again if the file is still missing.
async function preloadCommonFiles() {
  const metadata = (await preloadFile("metadata.tex")).content;
  const commonPaths = [...ALWAYS_PRELOAD, ...collectReferencedAssets(metadata), ...glyphFilesFor(CORE_GLYPHS)];
  for (const path of commonPaths) {
    try { await preloadFile(path); } catch { /* retried, and surfaced if it matters, at build time */ }
  }
  for (const name of CARRIED_TEXMF) {
    try { await preloadTexmfFile(name); } catch { /* same */ }
  }
}

// The spinner is one persistent element, never rebuilt: an innerHTML
// replacement on every call creates a new spinner node each time, and a
// fresh node restarts its CSS animation from 0deg. Only its [hidden] state
// and the text beside it change here.
function setStatus(text, { spinning = false, tone = "" } = {}) {
  el("status-spinner").hidden = !spinning;
  const textEl = el("status-text");
  textEl.textContent = text;
  textEl.className = tone;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function setBuilding(value) {
  building = value;
  el("build").disabled = value || !chosenPath;
  el("build-overlay").hidden = !value;
  el("pdf-body").classList.toggle("dimmed", value);
}

// --- Dark / light mode -------------------------------------------------

const THEME_KEY = "wasm-scenario-builder:theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
  if (cm) cm.setOption("theme", theme === "dark" ? "material-darker" : "default");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just does not persist.
  }
}

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // fall through to the system preference
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

el("theme-toggle").addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

// --- Editor (CodeMirror, LaTeX mode) ------------------------------------

cm = CodeMirror.fromTextArea(el("editor"), {
  mode: "stex",
  lineNumbers: true,
  lineWrapping: true,
  indentUnit: 2,
  tabSize: 2,
  theme: initialTheme() === "dark" ? "material-darker" : "default",
});
cm.on("change", () => {
  scheduleSave();
});
cm.on("blur", () => {
  if (chosenPath) saveDraft(chosenPath, cm.getValue());
});

applyTheme(initialTheme());

function basenameNoExt(path) {
  const base = path.split("/").pop();
  return base.replace(/\.tex$/, "");
}

/**
 * Reads one group of main.tex files (the published book, or the draft book)
 * and returns every scenario it lists, tagged with the display category the
 * picker groups by.
 */
async function loadGroup(groupFiles, book) {
  const sources = [];
  for (const group of groupFiles) {
    sources.push({ path: group.path, source: (await fetchRepoFile(group.path)).content });
  }
  const index = parseScenarioIndex(sources, groupFiles);
  return Promise.all(index.map(async (item) => {
    const source = (await fetchRepoFile(item.path)).content;
    const heading = scenarioHeading(source);
    const categoryKey = item.dir.split("/").pop();
    return {
      path: item.path,
      book,
      category: CATEGORY_LABELS[categoryKey] || categoryKey,
      title: heading ? heading.title : item.path,
      isTemplate: false,
    };
  }));
}

async function loadEntries() {
  const [mission, draft] = await Promise.all([
    loadGroup(GROUP_FILES, "mission"),
    loadGroup(DRAFT_GROUP_FILES, "draft"),
  ]);
  entries = [...mission, ...draft];
}

// --- Fuzzy search combobox ----------------------------------------------
//
// A match is a plain substring (ranked by how early it appears) or, failing
// that, the query's letters found in order but not together (ranked after
// every substring match). Good enough for scenario titles a person half
// remembers, not a scored fuzzy algorithm like fzf's.
function matchScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return idx;
  let qi = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      if (first === -1) first = i;
      last = i;
      qi += 1;
    }
  }
  if (qi < q.length) return null;
  return 1000 + (last - first);
}

function groupedResults(query) {
  const groups = new Map(); // "book|category" -> {book, category, items: [{entry, score}]}
  for (const entry of entries) {
    const score = matchScore(query, entry.title);
    if (score === null) continue;
    const key = `${entry.book}|${entry.category}`;
    if (!groups.has(key)) groups.set(key, { book: entry.book, category: entry.category, items: [] });
    groups.get(key).items.push({ entry, score });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.book !== b.book) return a.book === "mission" ? -1 : 1;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

let activeItem = -1;

function renderResults() {
  const groups = groupedResults(el("search").value);
  const list = el("search-results");
  if (!groups.length) {
    list.innerHTML = '<div class="combobox-empty">No scenario matches.</div>';
  } else {
    list.innerHTML = groups.map((group) => `
      <div class="combobox-group-label">${group.book === "mission" ? "Mission Book" : "Draft Book"} — ${escapeHtml(group.category)}</div>
      ${group.items.map(({ entry }) =>
        `<button type="button" class="combobox-item" data-path="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</button>`
      ).join("")}
    `).join("");
  }
  list.hidden = false;
  activeItem = -1;
}

function moveActive(delta) {
  const items = [...el("search-results").querySelectorAll(".combobox-item")];
  if (!items.length) return;
  items.forEach((item) => item.classList.remove("active"));
  activeItem = (activeItem + delta + items.length) % items.length;
  items[activeItem].classList.add("active");
  items[activeItem].scrollIntoView({ block: "nearest" });
}

el("search").addEventListener("focus", renderResults);
el("search").addEventListener("input", renderResults);
el("search").addEventListener("keydown", (event) => {
  const items = () => [...el("search-results").querySelectorAll(".combobox-item")];
  if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
  else if (event.key === "Escape") { el("search-results").hidden = true; }
  else if (event.key === "Enter") {
    event.preventDefault();
    const list = items();
    const target = activeItem >= 0 ? list[activeItem] : list[0];
    if (target) selectPending(target.dataset.path, target.textContent);
  }
});
el("search-results").addEventListener("mousedown", (event) => {
  // mousedown, not click: fires before the input's blur hides the list.
  const button = event.target.closest("[data-path]");
  if (button) selectPending(button.dataset.path, button.textContent);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".combobox")) el("search-results").hidden = true;
});

// Turns the free-text scenario name into a safe .tex basename: lowercase,
// underscores for anything else, "untitled" if that leaves nothing.
function sanitizeFilename(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}

// --- Picking, before committing -------------------------------------------
//
// A pick (a search result, or a blank-start button) only marks a pending
// choice: no fetch, nothing over the network yet. Nothing opens until
// "Let's go!" fires, which needs both a pick and at least 3 characters in
// the mandatory name field. Picking a real scenario already starts
// downloading its own pictures and its published PDF, though — see
// startScenarioPrefetch.
const MIN_NAME_LENGTH = 3;
let pendingPath = null;

function updateGoButton() {
  el("go").disabled = !pendingPath || el("scenario-name").value.trim().length < MIN_NAME_LENGTH;
}

function selectPending(path, title) {
  pendingPath = path;
  el("selected-title").textContent = title;
  el("selected-row").hidden = false;
  el("search-results").hidden = true;
  updateGoButton();
  // A template has no pictures and no published branch to fetch.
  const isTemplate = Object.values(TEMPLATES).some((t) => t.path === path);
  if (!isTemplate) startScenarioPrefetch(path);
}

// --- Prefetching a picked scenario, before "Let's go!" ---------------------
//
// Starts the instant a real scenario is picked: this scenario's own
// pictures, its own \svg calls beyond CORE_GLYPHS, and its
// already-published PDF all begin downloading in the background right
// away. commitEntry awaits this same promise rather than starting its own
// fetch, so nothing is ever fetched twice.
//
// Picking a second scenario before the first finishes aborts that first
// one's still-in-flight requests, one AbortController per prefetch. Nothing
// already finished is discarded: preloadFile only ever writes a path into
// the shared cache once its own fetch has actually completed.
let scenarioPrefetch = null; // {path, controller, promise}

function startScenarioPrefetch(path) {
  if (scenarioPrefetch) {
    if (scenarioPrefetch.path === path) return; // already running (or done) for this exact pick
    scenarioPrefetch.controller.abort();
  }
  const controller = new AbortController();
  scenarioPrefetch = { path, controller, promise: prefetchScenario(path, controller.signal) };
}

async function prefetchScenario(path, signal) {
  try {
    const source = (await preloadFile(path, signal)).content;
    const filePaths = [...collectReferencedAssets(source), ...glyphFilesFor(collectReferencedGlyphs(source))];
    for (const filePath of filePaths) {
      if (signal.aborted) return { pdfBlob: null };
      try {
        await preloadFile(filePath, signal);
      } catch (error) {
        // Tolerated either way: a genuine miss is retried at Build time
        // through the same cache; an abort is caught for real just below.
      }
    }
    if (signal.aborted) return { pdfBlob: null };

    const response = await fetch(publishedPdfUrl(basenameNoExt(path)), { signal });
    if (!response.ok) return { pdfBlob: null };
    // GitHub's raw CDN serves this as application/octet-stream, never
    // application/pdf. showPdf's <embed> is hardcoded to
    // type="application/pdf", but a browser can still key its plugin
    // choice off the blob's own reported type, so the fetched blob needs
    // re-tagging here.
    const raw = await response.blob();
    return { pdfBlob: raw.type === "application/pdf" ? raw : raw.slice(0, raw.size, "application/pdf") };
  } catch (error) {
    if (signal.aborted) return { pdfBlob: null };
    // Not fatal: a scenario without a published PDF yet (or offline) still
    // opens normally, just without a preview until Build PDF is pressed.
    console.warn(`No published PDF for "${basenameNoExt(path)}":`, error.message);
    return { pdfBlob: null };
  }
}

el("scenario-name").addEventListener("input", updateGoButton);

el("scratch-scenario").addEventListener("click", () => {
  selectPending(TEMPLATES.scenario.path, TEMPLATES.scenario.title);
});
el("scratch-campaign").addEventListener("click", () => {
  selectPending(TEMPLATES.campaign.path, TEMPLATES.campaign.title);
});

el("go").addEventListener("click", () => {
  if (!pendingPath || el("scenario-name").value.trim().length < MIN_NAME_LENGTH) return;
  commitEntry(pendingPath, el("scenario-name").value);
});

// --- Committing to an entry ----------------------------------------------
//
// This app asks once, on a welcome screen, and commits: nothing in the
// workspace offers a way back to it. Reloading the page returns to the
// welcome screen, and picking the same entry again restores its autosaved
// draft.
/**
 * Fades the welcome screen out, then swaps it for the workspace with a
 * short rise-and-fade-in. The two screens are never both visible at once:
 * this only adds motion around that swap, skipped entirely for
 * prefers-reduced-motion.
 */
function showWorkspace() {
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

/**
 * @param {string} path a real entry's path, or a TEMPLATES path for a
 *   blank start
 * @param {string} name the mandatory typed name (the welcome screen's
 *   "Name this file" field). Becomes the .tex file's own identity: the
 *   include path baked into structure.tex, the autosave key, and the
 *   download's filename all follow it, in place of the entry's own name.
 */
async function commitEntry(path, name) {
  const template = Object.values(TEMPLATES).find((t) => t.path === path);
  const entry = template
    ? { path: template.path, title: template.title, isTemplate: true }
    : entries.find((e) => e.path === path);
  if (!entry) return;

  await showWorkspace();
  cm.refresh(); // CodeMirror mismeasures while its host was display:none
  el("header-actions").hidden = false;

  // entry.path itself always stays the fetch path below, real on the
  // server; identity is what the rest of the app treats this entry as.
  // Keeping the .tex extension matters: TeX's \input only appends one to
  // a name that lacks it already, so a name without it would 404 twice.
  const dir = entry.path.split("/").slice(0, -1).join("/") || "templates";
  const identity = `${dir}/${sanitizeFilename(name)}.tex`;

  chosenPath = identity;
  chosenTitle = template ? sanitizeFilename(name) : entry.title;
  document.title = `${chosenTitle} - Heroes III: The Board Game`;
  el("build").disabled = building;
  el("download").disabled = true;
  setStatus("Loading…");

  const fetched = await preloadFile(entry.path);
  const pristineSource = fetched.content;

  const draft = loadDraft(identity);
  cm.setValue(draft !== null ? draft : pristineSource);
  el("draft-note").hidden = draft === null;
  cm.focus();

  resetUploads();
  clearPdf();

  // A real pick always has a prefetch already running (or done) by now,
  // started the moment it was picked. This just waits on that same
  // promise. The fallback (starting one fresh here) is only for a real
  // pick this session somehow never called selectPending for.
  if (!template) {
    setStatus("Finishing this scenario's downloads…", { spinning: true });
    showPdfLoading("Finishing this scenario's downloads…");
    const prefetch = scenarioPrefetch && scenarioPrefetch.path === path
      ? scenarioPrefetch
      : { path, controller: new AbortController(), promise: null };
    if (!prefetch.promise) prefetch.promise = prefetchScenario(path, prefetch.controller.signal);
    const { pdfBlob } = await prefetch.promise;
    if (pdfBlob) showPdf(pdfBlob); else clearPdf();
  }

  setStatus("Ready.");
}

// --- Upload popover -------------------------------------------------------

el("upload-toggle").addEventListener("click", (event) => {
  event.stopPropagation();
  el("upload-popover").hidden = !el("upload-popover").hidden;
});
el("upload-popover").addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => { el("upload-popover").hidden = true; });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") el("upload-popover").hidden = true;
});

// --- Header and map uploads ---------------------------------------------
//
// No server means no real upload: a chosen file never leaves the browser.
// What it does is join the virtual filesystem the build compiles from,
// under the repository path the scenario source would reach it at. The
// target filename defaults to the file's own name but is editable.
const MAX_MAP_FILES = 6;

let headerUpload = null;  // {bytes, path} | null
let mapUploads = [];      // [{bytes, originalName, path}]

function resetUploads() {
  uploadedFiles.clear();
  headerUpload = null;
  mapUploads = [];
  el("upload-header").value = "";
  el("upload-header-name").value = "";
  el("upload-header-name").hidden = true;
  el("upload-maps").value = "";
  el("upload-maps-names").innerHTML = "";
  el("upload-maps-names").hidden = true;
  setUploadStatus("upload-header-status", "Goes to <code>assets/images/</code>.");
  setUploadStatus("upload-maps-status", "One file for the whole scenario, or up to six — one per player. Goes to <code>assets/maps/</code>.");
}

function setUploadStatus(id, html, tone = "") {
  const span = el(id);
  span.innerHTML = html;
  span.classList.toggle("bad", tone === "bad");
}

async function readAsUint8Array(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function restageHeader() {
  if (!headerUpload) return;
  if (headerUpload.path) uploadedFiles.delete(headerUpload.path);
  const name = el("upload-header-name").value.trim() || headerUpload.originalName;
  const path = `assets/images/${name}`;
  headerUpload.path = path;
  uploadedFiles.set(path, headerUpload.bytes);
  setUploadStatus("upload-header-status", `Staged: <code>${escapeHtml(path)}</code>`);
}

el("upload-header").addEventListener("change", async () => {
  const [file] = el("upload-header").files;
  if (!file) return;
  if (headerUpload && headerUpload.path) uploadedFiles.delete(headerUpload.path);
  headerUpload = { bytes: await readAsUint8Array(file), originalName: file.name, path: null };
  el("upload-header-name").hidden = false;
  el("upload-header-name").value = file.name;
  restageHeader();
});
el("upload-header-name").addEventListener("input", restageHeader);

function restageMaps() {
  for (const item of mapUploads) if (item.path) uploadedFiles.delete(item.path);
  const inputs = [...el("upload-maps-names").querySelectorAll(".upload-rename")];
  const seen = new Set();
  let collision = false;
  mapUploads.forEach((item, i) => {
    const name = (inputs[i] ? inputs[i].value.trim() : "") || item.originalName;
    const path = `assets/maps/${name}`;
    if (seen.has(path)) collision = true;
    seen.add(path);
    item.path = path;
    uploadedFiles.set(path, item.bytes); // a repeated name: the last file staged under it wins
  });
  setUploadStatus(
    "upload-maps-status",
    collision
      ? "Two files share the same target name — only the last one staged under it is kept."
      : `Staged: ${mapUploads.map((m) => `<code>${escapeHtml(m.path)}</code>`).join(", ")}`,
    collision ? "bad" : "",
  );
}

el("upload-maps").addEventListener("change", async () => {
  const files = [...el("upload-maps").files];
  if (!files.length) return;
  if (files.length > MAX_MAP_FILES) {
    setUploadStatus("upload-maps-status", `Chose ${files.length} files, more than the ${MAX_MAP_FILES}-player limit. None were staged — pick again.`, "bad");
    el("upload-maps").value = "";
    return;
  }
  for (const item of mapUploads) if (item.path) uploadedFiles.delete(item.path);
  mapUploads = await Promise.all(files.map(async (file) => ({
    bytes: await readAsUint8Array(file),
    originalName: file.name,
    path: null,
  })));
  const list = el("upload-maps-names");
  list.innerHTML = mapUploads.map((item, i) => `
    <div class="upload-rename-row">
      <span class="orig-name">${escapeHtml(item.originalName)} →</span>
      <input type="text" class="upload-rename" data-index="${i}" value="${escapeHtml(item.originalName)}">
    </div>
  `).join("");
  list.hidden = false;
  list.querySelectorAll(".upload-rename").forEach((input) => input.addEventListener("input", restageMaps));
  restageMaps();
});

function clearPdf() {
  lastPdf = null;
  lastResult = null;
  el("download").disabled = true;
  el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">No PDF yet. Press Build PDF.</div>';
  el("error-panel").hidden = true;
}

function showPdf(blob) {
  lastPdf = blob;
  const url = URL.createObjectURL(blob);
  el("pdf-body").innerHTML = `<embed class="pdf-view" type="application/pdf" src="${url}">`;
  el("download").disabled = false;
}

// Shown in the PDF pane itself while commitEntry fetches this scenario's
// pictures and its published PDF, right after "Let's go!".
function showPdfLoading(text) {
  el("pdf-body").innerHTML = `<div class="empty-pdf loading"><span class="spinner big"></span><p>${escapeHtml(text)}</p></div>`;
}

// README.md links to these same URLs: one branch per scenario, in a
// companion repository, built by build-individual-scenarios.yaml.
const PUBLISHED_PDF_REPO = "https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts";

function publishedPdfUrl(basename) {
  return `${PUBLISHED_PDF_REPO}/en-${basename}-color/${basename}_en.pdf`;
}

function showError(record) {
  el("error-panel").hidden = false;
  el("first-error").textContent = record.firstError || "The build failed, but no specific LaTeX error line was found in the log.";
  el("full-log").textContent = record.log || "";
  el("full-log-details").open = false;
}

async function startEngine() {
  setStatus("Downloading the engine (first time only, a few minutes)…", { spinning: true });
  runner = new BusyTexRunner({
    busytexBasePath: BASE,
    preloadDataPackages: [`${BASE}/texlive-extra.js`],
    verbose: true,
  });
  try {
    await runner.initialize(true);
  } catch (error) {
    runner = null;
    throw error;
  }
}

// The engine (its ~341 MB data package) is the slow part, not compiling.
// One in-flight promise, shared by the eager warm-up below and by a build
// that starts before it finishes, so a reader who presses Build early
// waits on the same download rather than starting a second one.
let enginePromise = null;
async function ensureEngine() {
  if (runner) return;
  if (!enginePromise) {
    enginePromise = startEngine().catch((error) => {
      enginePromise = null; // let a later call retry instead of staying stuck
      throw error;
    });
  }
  await enginePromise;
}

/**
 * Runs the whole build for the currently chosen entry: fetches the plan's
 * files, compiles, and retries once per file GitHub's log reports missing,
 * up to MAX_FETCH_ON_MISS_ATTEMPTS.
 */
async function runBuild() {
  if (building || !chosenPath) return;
  setBuilding(true);
  el("error-panel").hidden = true;
  try {
    await ensureEngine();

    setStatus("Preparing files…", { spinning: true });
    const source = cm.getValue();
    const metadata = (await preloadFile("metadata.tex")).content;

    const plan = planScenarioBuild({
      metadata,
      scenario: { path: chosenPath, source },
    });

    // Built through a path->content map, not straight into an array: an
    // upload must win over a same-path repository fetch, and every staged
    // upload must reach the engine even if collectReferencedAssets has not
    // yet seen an \includegraphics call for it in the source.
    const staged = new Map();
    const notFound = [];
    const totalFiles = plan.repoFiles.length + (plan.carriedTexmf || []).length;
    let loadedFiles = 0;
    const reportFileProgress = () => setStatus(`Loading files… ${loadedFiles}/${totalFiles}`, { spinning: true });
    reportFileProgress();
    for (const path of plan.repoFiles) {
      // The scenario/template itself is being edited in the browser: use
      // the editor's text, not a re-fetch of the pristine repository copy.
      if (path === chosenPath) {
        staged.set(path, { path, content: source });
      } else if (uploadedFiles.has(path)) {
        staged.set(path, { path, content: uploadedFiles.get(path) });
      } else {
        try {
          staged.set(path, await preloadFile(path));
        } catch (error) {
          notFound.push(path);
        }
      }
      loadedFiles += 1;
      reportFileProgress();
    }
    for (const name of plan.carriedTexmf || []) {
      try {
        const file = await preloadTexmfFile(name);
        staged.set(name, { path: name, content: file.content });
      } catch (error) {
        notFound.push(`texmf/${name}`);
      }
      loadedFiles += 1;
      reportFileProgress();
    }
    for (const [path, content] of Object.entries(plan.generated)) {
      staged.set(path, { path, content });
    }
    for (const [path, content] of uploadedFiles) {
      if (!staged.has(path)) staged.set(path, { path, content });
    }
    const additionalFiles = [...staged.values()];

    setStatus("Compiling (this can take a while the first time)…", { spinning: true });
    const started = performance.now();
    const lualatex = new LuaLatex(runner);

    let result;
    const tried = new Set();
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await lualatex.compile({
          input: plan.input,
          additionalFiles,
          verbose: "debug",
        });
      } catch (error) {
        result = { success: false, log: String(error), exitCode: -1 };
      }
      if (attempt >= MAX_FETCH_ON_MISS_ATTEMPTS) break;
      const toFetch = newMissingPaths(missingFiles(result.log), tried);
      if (!toFetch.length) break;
      let landed = 0;
      for (const path of toFetch) {
        tried.add(path);
        try {
          additionalFiles.push(await fetchRepoFile(path));
          landed += 1;
        } catch (error) {
          // genuine miss: not in the repository, left for firstError to report
        }
      }
      if (!landed) break;
      setStatus(`Retrying with ${landed} more file(s) fetched on demand…`, { spinning: true });
    }
    const seconds = (performance.now() - started) / 1000;

    const record = {
      ok: Boolean(result.success && result.pdf),
      bytes: result.pdf ? result.pdf.length : 0,
      pages: pageCount(result.log),
      seconds: Number(seconds.toFixed(1)),
      notFound,
      missing: missingFiles(result.log),
      firstError: firstError(result.log),
      log: result.log || "",
    };
    lastResult = record;
    window.__probeResults = { "scenario-svg": record }; // read by the headless capture

    if (record.ok) {
      showPdf(new Blob([result.pdf], { type: "application/pdf" }));
      setStatus(`Built ${record.pages} page(s) in ${record.seconds}s.`, { tone: "ok" });
    } else {
      el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">The build failed. See the error below.</div>';
      el("download").disabled = true;
      showError(record);
      setStatus("Build failed.", { tone: "bad" });
    }
  } catch (error) {
    lastResult = { ok: false, firstError: null, log: String(error && error.stack || error) };
    window.__probeResults = { "scenario-svg": lastResult };
    showError({ firstError: `Unexpected error: ${error.message || error}`, log: String(error && error.stack || error) });
    setStatus("Build failed.", { tone: "bad" });
  } finally {
    setBuilding(false);
  }
}

el("build").addEventListener("click", () => {
  runBuild();
});

// "Download PDF" — named after the chosen entry's basename, e.g.
// astral_run.pdf, or default.pdf / campaign.pdf for a blank-start template.
el("download").addEventListener("click", () => {
  if (!lastPdf || !chosenPath) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(lastPdf);
  link.download = `${basenameNoExt(chosenPath)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

// A headless-drivable hook analogous to the prototype's
// window.__probeRun/window.__probeResults, so tools/render_parity.sh's
// capture-pdf.mjs can drive this page. The app has no step ladder, so the
// first argument is accepted and ignored; the second is the scenario path
// to build.
window.__probeRun = async (_stepId, scenarioPath) => {
  if (scenarioPath) {
    await commitEntry(scenarioPath);
  }
  await runBuild();
  return window.__probeResults["scenario-svg"];
};

// capture-pdf.mjs clicks "#save-pdf" to trigger the download it captures.
// The app's own visible control is named "#download". A hidden alias under
// the id capture-pdf.mjs expects forwards to it.
const saveAlias = document.createElement("button");
saveAlias.id = "save-pdf";
saveAlias.hidden = true;
saveAlias.addEventListener("click", () => el("download").click());
document.body.appendChild(saveAlias);

// --- GitHub sign-in, save-to-fork, sign-out ------------------------------

function renderGithubHeader() {
  const signedIn = Boolean(getToken());
  el("github-signin").hidden = signedIn;
  el("github-status").hidden = !signedIn;
}

el("github-signin").addEventListener("click", signIn);

let lastSaveTarget = null;
window.__lastSaveTarget = () => lastSaveTarget; // read by the PR-open/update step

el("github-save").addEventListener("click", async () => {
  if (!chosenPath) return;
  const token = getToken();
  if (!token) return;
  const button = el("github-save");
  button.disabled = true;
  setStatus("Saving to your fork…", { spinning: true });
  try {
    const scenarioName = basenameNoExt(chosenPath);
    lastSaveTarget = await saveScenarioToRepo(token, {
      scenarioName,
      texPath: chosenPath,
      texContent: cm.getValue(),
      uploadedFiles,
    });
    setStatus(
      `Saved to ${lastSaveTarget.owner}/${lastSaveTarget.repo}@${lastSaveTarget.branch}.`,
      { tone: "ok" },
    );
  } catch (error) {
    const message = error instanceof GithubApiError ? error.message : `Save failed: ${error.message}`;
    setStatus(message, { tone: "bad" });
  } finally {
    button.disabled = false;
  }
});

completeSignIn()
  .catch((error) => {
    setStatus(`GitHub sign-in failed: ${error.message}`, { tone: "bad" });
  })
  .finally(renderGithubHeader);

loadEntries()
  .then(() => {
    if (!entries.length) setStatus("No scenarios found.", { tone: "bad" });
  })
  .catch((error) => {
    el("search-results").innerHTML = `<div class="combobox-empty">Could not read the scenario list: ${escapeHtml(error.message)}</div>`;
    el("search-results").hidden = false;
  });

// Eager engine warm-up: starts the moment the page opens, not on the first
// Build click. Errors surface for real at Build time instead, through
// ensureEngine's shared promise.
ensureEngine().catch(() => {});

// Eager common-file preload: the same background timing as the engine
// warm-up above. By the time a scenario is picked and built, everything
// but that scenario's own pictures is already sitting in preloadedFiles.
preloadCommonFiles().catch(() => {});

import { untilAborted } from "../../shared/abort.ts";
import {
  auxState,
  builtStatus,
  DATA_PACKAGE,
  errorInAuxState,
  errorLine,
  firstError,
  MAX_FETCH_ON_MISS_ATTEMPTS,
  MAX_TEX_PASSES,
  missingFiles,
  needsRerun,
  newMissingPaths,
  pageCount,
  planScenarioBuild,
} from "../../shared/build-plan.ts";
import { errorMessage, errorTrace } from "../../shared/errors.ts";
import { changedLines } from "../../shared/line-diff.ts";
import { pageArchiveName, pageImageName } from "../../shared/page-images.ts";
import { gunzipText, lineRects, parseSynctex } from "../../shared/synctex.ts";
import { uploadsSignature } from "../../shared/unsaved.ts";
import { busytexBase } from "./config.ts";
import { basenameNoExt, el, setBuilding, setBuildPhase, setStatus } from "./dom.js";
import { fetchRepoFile, loadCarriedTexmf, preloadFile, preloadText } from "./files.ts";
import {
  clearErrorLine,
  clearPdf,
  renderPngPages,
  showError,
  showPdf,
  showPdfLoading,
  showPdfMessage,
} from "./pdf-view.js";
import { requireEditor, state } from "./state.ts";
import { refreshSubmitDialog } from "./submit.js";

// client-zip is imported lazily, when the first PNG export with more than one
// page runs, so a session that exports no PNG, or exports only one page,
// never fetches its chunk.
/** @typedef {typeof import("client-zip")} ClientZipModule */

/** @type {Promise<ClientZipModule> | null} */
let clientZipReady = null;

/** @returns {Promise<ClientZipModule>} */
function loadClientZip() {
  clientZipReady ??= import("client-zip").catch((error) => {
    clientZipReady = null; // let the next export try again
    throw error;
  });
  return clientZipReady;
}

// The engine wrapper stays out of the bundle: it is loaded by URL, resolved
// against the page like the engine files it fetches, so the deploy's copy and
// the test stub (which matches this path's suffix) both reach it.
// The wrapper's types come from its .d.ts, through type-only imports.
/** @typedef {typeof import("../../shared/vendor/texlyre-busytex.js")} EngineModule */
/** @typedef {import("../../shared/vendor/texlyre-busytex.js").BusyTexRunner} EngineRunner */

/** @type {Promise<EngineModule> | null} */
let engineModuleReady = null;

/** @returns {Promise<EngineModule>} */
function loadEngineModule() {
  engineModuleReady ??= import(
    /* @vite-ignore */ new URL("../shared/vendor/texlyre-busytex.js", document.baseURI).href
  ).catch((error) => {
    engineModuleReady = null; // let the next start try again
    throw error;
  });
  return engineModuleReady;
}

// Set while a PNG export runs. A build that ends meanwhile re-enables
// Download (showPdf), so the menu alone cannot keep a second export out.
let exporting = false;

/**
 * Downloads and starts the WASM engine, leaving it on state.runner.
 *
 * @returns {Promise<void>}
 */
async function startEngine() {
  setStatus("Downloading the engine (first time only, about a minute)…", { spinning: true });
  const { BusyTexRunner } = await loadEngineModule();
  const base = busytexBase();
  state.runner = new BusyTexRunner({
    busytexBasePath: base,
    preloadDataPackages: [`${base}/${DATA_PACKAGE}.js`],
    verbose: false,
  });
  try {
    await state.runner.initialize(true);
  } catch (error) {
    state.runner = null;
    throw error;
  }
}

// The engine's ~93 MB data package is the slow part. One shared in-flight
// promise so a Build pressed before warm-up finishes waits on it instead of starting a second download.
/** @type {Promise<void> | null} */
let enginePromise = null;

/**
 * Resolves once the engine can compile, starting it on the first call and
 * sharing that one in-flight promise with every later caller.
 *
 * @returns {Promise<void>}
 */
export async function ensureEngine() {
  if (state.runner) return;
  if (!enginePromise) {
    enginePromise = startEngine().catch((error) => {
      enginePromise = null; // let a later call retry instead of staying stuck
      throw error;
    });
  }
  await enginePromise;
}

/**
 * Throws the engine away mid-compile: the worker is killed, so the compile
 * stops using the CPU, and a fresh engine starts warming for the next Build.
 * The data package is cached by then, so the restart skips the big download.
 *
 * @param {EngineRunner} runner the runner the stopped compile was using
 * @returns {void}
 */
function discardEngine(runner) {
  runner.terminate();
  if (state.runner === runner) {
    state.runner = null;
    enginePromise = null;
  }
  ensureEngine().catch(() => {}); // errors surface at the next Build, as on page load
}

// Each scenario's aux files from its last good build, by repository path. A
// rebuild that starts from them usually settles in one TeX pass.
/** @type {Map<string, StagedFile[]>} */
const auxByScenario = new Map();

// Each scenario's source at its last good build, by repository path. The
// next build marks on its pages what changed since.
/** @type {Map<string, string>} */
const sourceByScenario = new Map();

/**
 * Where on the new PDF's pages the lines changed since the last build
 * landed, read from the compile's SyncTeX file. Empty when there is nothing
 * to compare against or to read: the marks are a courtesy, never a failure.
 *
 * @param {Uint8Array | null | undefined} synctex the compile's .synctex.gz bytes
 * @param {string} path the scenario's repository path
 * @param {string | undefined} before its source at the last good build
 * @param {string} after its source now
 * @returns {Promise<Map<number, import("../../shared/synctex.ts").PageRect[]>>}
 */
async function changeMarks(synctex, path, before, after) {
  if (!synctex || before === undefined) return new Map();
  const lines = changedLines(before, after);
  if (lines.size === 0) return new Map();
  try {
    return lineRects(parseSynctex(await gunzipText(synctex)), path, lines);
  } catch (error) {
    console.warn("The SyncTeX file could not be read:", error);
    return new Map();
  }
}

/**
 * Reports a build step twice: short on the PDF pane, where the reader looks,
 * and in full in the status bar.
 *
 * @param {string} short
 * @param {string} [full] the status bar's wording, when it differs
 * @returns {void}
 */
function reportPhase(short, full = short) {
  setBuildPhase(short);
  setStatus(full, { spinning: true });
}

// The running build's controller; null when no build runs.
/** @type {AbortController | null} */
let buildController = null;

/**
 * Stops the running build, if any. The build ends at once with the PDF pane
 * as it was before Build was pressed.
 *
 * @returns {void}
 */
export function stopBuild() {
  buildController?.abort();
}

/**
 * Compiles whatever is in the editor, staging every file the plan asks for
 * and retrying around files the engine finds missing. stopBuild() ends it
 * early.
 *
 * @returns {Promise<void>}
 */
export async function runBuild() {
  if (state.building || !state.chosenPath) return;
  const chosenPath = state.chosenPath;
  const cm = requireEditor();
  const controller = new AbortController();
  const { signal } = controller;
  buildController = controller;
  setBuilding(true);
  el("error-panel").hidden = true;
  clearErrorLine();
  // The last PDF stays readable while this builds; with none, the pane says why it waits.
  // The status bar keeps the engine download's own wording until the first step.
  const firstPhase = state.runner ? "Preparing files…" : "Waiting for the engine…";
  if (!state.lastPdf) showPdfLoading(firstPhase);
  setBuildPhase(firstPhase);
  try {
    // A stop here leaves the engine warming: page load started it, not this build.
    await untilAborted(ensureEngine(), signal);

    reportPhase("Preparing files…");
    // One snapshot of text and uploads: an upload changed mid-build must not
    // reach this compile, or the PDF would not match the proof it records.
    const source = cm.getValue();
    const uploads = new Map(state.uploadedFiles);
    const metadata = await untilAborted(preloadText("metadata.tex"), signal);

    const plan = planScenarioBuild({
      metadata,
      scenario: { path: chosenPath, source },
    });

    // A path->content map, not an array: an upload must win over a same-path
    // repo fetch, and reach the engine even if collectReferencedAssets missed it.
    /** @type {Map<string, StagedFile>} */
    const staged = new Map();
    /** @type {string[]} */
    const notFound = [];
    const totalFiles = plan.repoFiles.length + 1; // + the carried TeX Live bundle
    let loadedFiles = 0;
    const reportFileProgress = () => reportPhase(`Loading files… ${loadedFiles}/${totalFiles}`);
    reportFileProgress();
    for (const path of plan.repoFiles) {
      // Use the editor's text for the scenario itself, not a re-fetch of the pristine copy.
      const uploaded = uploads.get(path);
      if (path === chosenPath) {
        staged.set(path, { path, content: source });
      } else if (uploaded) {
        staged.set(path, { path, content: uploaded });
      } else {
        try {
          staged.set(path, await preloadFile(path));
        } catch {
          notFound.push(path);
        }
      }
      signal.throwIfAborted();
      loadedFiles += 1;
      reportFileProgress();
    }
    try {
      for (const file of await untilAborted(loadCarriedTexmf(), signal)) staged.set(file.path, file);
    } catch (error) {
      if (signal.aborted) throw error;
      notFound.push(`texmf/${plan.carriedBundle}`);
    }
    loadedFiles += 1;
    reportFileProgress();
    for (const [path, content] of Object.entries(plan.generated)) {
      staged.set(path, { path, content });
    }
    for (const [path, content] of uploads) {
      if (!staged.has(path)) staged.set(path, { path, content });
    }
    const additionalFiles = [...staged.values()];

    reportPhase("Compiling…", "Compiling (this can take a while the first time)…");
    const started = performance.now();
    // ensureEngine above resolves only once state.runner is set.
    const runner = /** @type {EngineRunner} */ (state.runner);
    const { LuaLatex } = await loadEngineModule();
    const lualatex = new LuaLatex(runner);
    // Only the engine can end a compile, so a stop from here on kills it.
    const onStop = () => discardEngine(runner);
    signal.addEventListener("abort", onStop, { once: true });

    /** @type {import("../../shared/vendor/texlyre-busytex.js").CompileResult} */
    let result;
    /** @type {Set<string>} */
    const tried = new Set();
    let aux = auxByScenario.get(chosenPath) ?? [];
    let fetchRounds = 0;
    let passes = 0;
    let retriedClean = false;
    // One TeX pass per compile: the engine's own rerun loop always ran four.
    for (;;) {
      try {
        result = await untilAborted(
          lualatex.compile({
            input: plan.input,
            additionalFiles: [...additionalFiles, ...aux],
            rerun: false,
            verbose: "silent",
          }),
          signal,
        );
      } catch (error) {
        if (signal.aborted) throw error;
        result = { success: false, log: String(error), exitCode: -1 };
      }
      const toFetch = fetchRounds < MAX_FETCH_ON_MISS_ATTEMPTS ? newMissingPaths(missingFiles(result.log), tried) : [];
      let landed = 0;
      for (const path of toFetch) {
        tried.add(path);
        try {
          additionalFiles.push(await fetchRepoFile(path));
          landed += 1;
        } catch {
          // genuine miss: not in the repository, left for firstError to report
        }
        signal.throwIfAborted();
      }
      if (landed) {
        fetchRounds += 1;
        const more = `${landed} more ${landed === 1 ? "file" : "files"}`;
        reportPhase(`Retrying with ${more}…`, `Retrying with ${more} fetched on demand…`);
        continue;
      }
      if (result.success) {
        aux = auxState(await untilAborted(runner.readProjectFiles(), signal));
        passes += 1;
        if (passes >= MAX_TEX_PASSES || !needsRerun(result.log)) break;
        reportPhase("Updating references…", "Compiling again to update references…");
        continue;
      }
      // Stale state from an earlier build can break a sound source: drop it and try once more.
      if (aux.length && !retriedClean && errorInAuxState(result.log)) {
        aux = [];
        retriedClean = true;
        continue;
      }
      break;
    }
    if (result.success) auxByScenario.set(chosenPath, aux);
    else auxByScenario.delete(chosenPath);
    const seconds = (performance.now() - started) / 1000;

    const pages = pageCount(result.log);
    const roundedSeconds = Number(seconds.toFixed(1));
    /** @type {BuildRecord} */
    const record = {
      ok: Boolean(result.success && result.pdf),
      bytes: result.pdf ? result.pdf.length : 0,
      pages,
      seconds: roundedSeconds,
      notFound,
      missing: missingFiles(result.log),
      firstError: firstError(result.log),
      errorLine: errorLine(result.log, chosenPath, source.split("\n").length),
      log: result.log || "",
    };

    if (record.ok) {
      const changes = await changeMarks(result.synctex, chosenPath, sourceByScenario.get(chosenPath), source);
      sourceByScenario.set(chosenPath, source);
      // record.ok is Boolean(result.success && result.pdf), so pdf is set here.
      await showPdf(
        new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (result.pdf)], { type: "application/pdf" }),
        source,
        { changes, uploads: uploadsSignature(uploads) },
      );
      setStatus(builtStatus(pages, roundedSeconds), { tone: "ok" });
    } else {
      // A last good PDF stays on screen, and downloadable, above the error.
      if (!state.lastPdf) showPdfMessage("The build failed. See the error below.");
      showError(record);
      setStatus("Build failed.", { tone: "bad" });
    }
  } catch (error) {
    if (signal.aborted) {
      // A stop is not a failure: the pane goes back to what it showed before.
      if (!state.lastPdf) clearPdf();
      setStatus("Build stopped.");
      return;
    }
    if (!state.lastPdf) showPdfMessage("The build failed. See the error below.");
    const trace = errorTrace(error);
    showError({ firstError: `Unexpected error: ${errorMessage(error)}`, log: trace });
    setStatus("Build failed.", { tone: "bad" });
  } finally {
    buildController = null;
    setBuilding(false);
    // A build that was running when the submit dialog opened changes what it must say.
    refreshSubmitDialog();
  }
}

/**
 * Saves a blob to disk through a temporary, clicked `<a download>`. The
 * object URL is revoked right after the click starts the save.
 *
 * @param {Blob} blob
 * @param {string} name
 * @returns {void}
 */
function saveBlob(blob, name) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Renders the shown PDF to PNG and saves the pages: one PNG file when there
 * is only one page, a zip of them when there are more. Download stays
 * disabled for the run, and is re-enabled afterwards only if a PDF is still
 * shown — a build or a scenario switch during the export may have cleared it.
 *
 * @param {Blob} blob captured up front, so a later build cannot change what this run exports
 * @param {string} stem the download's base name, without extension
 * @param {boolean} dropLastPage whether to exclude the shown PDF's last page
 * @returns {Promise<void>}
 */
async function exportPng(blob, stem, dropLastPage) {
  exporting = true;
  el("download").disabled = true;
  try {
    const pages = await renderPngPages(blob, {
      dropLastPage,
      onPage: (page, total) => setStatus(`Rendering page ${page} of ${total}…`, { spinning: true }),
    });
    let name;
    if (pages.length === 1) {
      name = pageImageName(stem, 1);
      saveBlob(new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (pages[0])], { type: "image/png" }), name);
    } else {
      const { downloadZip } = await loadClientZip();
      const files = pages.map((bytes, index) => ({ name: pageImageName(stem, index + 1), input: bytes }));
      const zipBlob = await downloadZip(files).blob();
      name = pageArchiveName(stem);
      const typed = zipBlob.type === "application/zip" ? zipBlob : new Blob([zipBlob], { type: "application/zip" });
      saveBlob(typed, name);
    }
    setStatus(`Saved ${name}.`, { tone: "ok" });
  } catch (error) {
    console.error("The PNG export failed:", error);
    setStatus(`The PNG export failed: ${errorMessage(error)}`, { tone: "bad" });
  } finally {
    exporting = false;
    el("download").disabled = !state.lastPdf;
  }
}

/** Wires the Build/Stop and Download controls. @returns {void} */
export function initBuild() {
  el("build").addEventListener("click", () => {
    if (state.building) stopBuild();
    else runBuild();
  });

  el("download-pdf").addEventListener("click", () => {
    // Named after the scenario the PDF shows: a published PDF is the
    // original's, not the renamed copy's.
    const path = state.pdfPath ?? state.chosenPath;
    if (!state.lastPdf || !path) return;
    saveBlob(state.lastPdf, `${basenameNoExt(path)}.pdf`);
  });

  el("download-png").addEventListener("click", () => {
    const path = state.pdfPath ?? state.chosenPath;
    if (exporting || !state.lastPdf || !path) return;
    exportPng(state.lastPdf, basenameNoExt(path), state.pdfDropsLastPage);
  });
}

import { untilAborted } from "../../shared/abort.js";
import {
  errorLine,
  firstError,
  MAX_FETCH_ON_MISS_ATTEMPTS,
  missingFiles,
  newMissingPaths,
  pageCount,
  planScenarioBuild,
} from "../../shared/build-plan.js";
import { errorMessage, errorTrace } from "../../shared/errors.js";
import { BusyTexRunner, LuaLatex } from "../../shared/vendor/texlyre-busytex.js";
import { busytexBase } from "./config.js";
import { basenameNoExt, el, setBuilding, setStatus } from "./dom.js";
import { fetchRepoFile, preloadFile, preloadTexmfFile, preloadText } from "./files.js";
import { clearErrorLine, showError, showPdf } from "./pdf-view.js";
import { requireEditor, state } from "./state.js";

/**
 * Downloads and starts the WASM engine, leaving it on state.runner.
 *
 * @returns {Promise<void>}
 */
async function startEngine() {
  setStatus("Downloading the engine (first time only, a few minutes)…", { spinning: true });
  const base = busytexBase();
  state.runner = new BusyTexRunner({
    busytexBasePath: base,
    preloadDataPackages: [`${base}/texlive-extra.js`],
    verbose: false,
  });
  try {
    await state.runner.initialize(true);
  } catch (error) {
    state.runner = null;
    throw error;
  }
}

// The engine's ~341 MB data package is the slow part. One shared in-flight
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
 * @param {BusyTexRunner} runner the runner the stopped compile was using
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
  try {
    // A stop here leaves the engine warming: page load started it, not this build.
    await untilAborted(ensureEngine(), signal);

    setStatus("Preparing files…", { spinning: true });
    const source = cm.getValue();
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
    const totalFiles = plan.repoFiles.length + (plan.carriedTexmf || []).length;
    let loadedFiles = 0;
    const reportFileProgress = () => setStatus(`Loading files… ${loadedFiles}/${totalFiles}`, { spinning: true });
    reportFileProgress();
    for (const path of plan.repoFiles) {
      // Use the editor's text for the scenario itself, not a re-fetch of the pristine copy.
      const uploaded = state.uploadedFiles.get(path);
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
    for (const name of plan.carriedTexmf || []) {
      try {
        const file = await preloadTexmfFile(name);
        staged.set(name, { path: name, content: file.content });
      } catch {
        notFound.push(`texmf/${name}`);
      }
      signal.throwIfAborted();
      loadedFiles += 1;
      reportFileProgress();
    }
    for (const [path, content] of Object.entries(plan.generated)) {
      staged.set(path, { path, content });
    }
    for (const [path, content] of state.uploadedFiles) {
      if (!staged.has(path)) staged.set(path, { path, content });
    }
    const additionalFiles = [...staged.values()];

    setStatus("Compiling (this can take a while the first time)…", { spinning: true });
    const started = performance.now();
    // ensureEngine above resolves only once state.runner is set.
    const runner = /** @type {BusyTexRunner} */ (state.runner);
    const lualatex = new LuaLatex(runner);
    // Only the engine can end a compile, so a stop from here on kills it.
    const onStop = () => discardEngine(runner);
    signal.addEventListener("abort", onStop, { once: true });

    /** @type {import("../../shared/vendor/texlyre-busytex.js").CompileResult} */
    let result;
    /** @type {Set<string>} */
    const tried = new Set();
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await untilAborted(
          lualatex.compile({
            input: plan.input,
            additionalFiles,
            verbose: "debug",
          }),
          signal,
        );
      } catch (error) {
        if (signal.aborted) throw error;
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
        } catch {
          // genuine miss: not in the repository, left for firstError to report
        }
        signal.throwIfAborted();
      }
      if (!landed) break;
      setStatus(`Retrying with ${landed} more file(s) fetched on demand…`, { spinning: true });
    }
    const seconds = (performance.now() - started) / 1000;

    /** @type {BuildRecord} */
    const record = {
      ok: Boolean(result.success && result.pdf),
      bytes: result.pdf ? result.pdf.length : 0,
      pages: pageCount(result.log),
      seconds: Number(seconds.toFixed(1)),
      notFound,
      missing: missingFiles(result.log),
      firstError: firstError(result.log),
      errorLine: errorLine(result.log, chosenPath, source.split("\n").length),
      log: result.log || "",
    };

    if (record.ok) {
      // record.ok is Boolean(result.success && result.pdf), so pdf is set here.
      showPdf(new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (result.pdf)], { type: "application/pdf" }));
      setStatus(`Built ${record.pages} page(s) in ${record.seconds}s.`, { tone: "ok" });
    } else {
      el("pdf-body").innerHTML = '<div class="empty-pdf" id="pdf-empty">The build failed. See the error below.</div>';
      el("download").disabled = true;
      showError(record);
      setStatus("Build failed.", { tone: "bad" });
    }
  } catch (error) {
    if (signal.aborted) {
      setStatus("Build stopped.");
      return;
    }
    const trace = errorTrace(error);
    showError({ firstError: `Unexpected error: ${errorMessage(error)}`, log: trace });
    setStatus("Build failed.", { tone: "bad" });
  } finally {
    buildController = null;
    setBuilding(false);
  }
}

/** Wires the Build/Stop and Download controls. @returns {void} */
export function initBuild() {
  el("build").addEventListener("click", () => {
    if (state.building) stopBuild();
    else runBuild();
  });

  el("download").addEventListener("click", () => {
    if (!state.lastPdf || !state.chosenPath) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(state.lastPdf);
    link.download = `${basenameNoExt(state.chosenPath)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

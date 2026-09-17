import { BusyTexRunner, LuaLatex } from "../../shared/vendor/texlyre-busytex.js";
import {
  planScenarioBuild, firstError, pageCount,
  missingFiles, newMissingPaths, MAX_FETCH_ON_MISS_ATTEMPTS,
} from "../../shared/build-plan.js";

import { BASE } from "./config.js";
import { state } from "./state.js";
import { el, setStatus, setBuilding, basenameNoExt } from "./dom.js";
import { fetchRepoFile, preloadFile, preloadTexmfFile } from "./files.js";
import { clearPdf, showPdf, showError } from "./pdf-view.js";
import { commitEntry } from "./workspace.js";

async function startEngine() {
  setStatus("Downloading the engine (first time only, a few minutes)…", { spinning: true });
  state.runner = new BusyTexRunner({
    busytexBasePath: BASE,
    preloadDataPackages: [`${BASE}/texlive-extra.js`],
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
let enginePromise = null;
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

export async function runBuild() {
  if (state.building || !state.chosenPath) return;
  setBuilding(true);
  el("error-panel").hidden = true;
  try {
    await ensureEngine();

    setStatus("Preparing files…", { spinning: true });
    const source = state.cm.getValue();
    const metadata = (await preloadFile("metadata.tex")).content;

    const plan = planScenarioBuild({
      metadata,
      scenario: { path: state.chosenPath, source },
    });

    // A path->content map, not an array: an upload must win over a same-path
    // repo fetch, and reach the engine even if collectReferencedAssets missed it.
    const staged = new Map();
    const notFound = [];
    const totalFiles = plan.repoFiles.length + (plan.carriedTexmf || []).length;
    let loadedFiles = 0;
    const reportFileProgress = () => setStatus(`Loading files… ${loadedFiles}/${totalFiles}`, { spinning: true });
    reportFileProgress();
    for (const path of plan.repoFiles) {
      // Use the editor's text for the scenario itself, not a re-fetch of the pristine copy.
      if (path === state.chosenPath) {
        staged.set(path, { path, content: source });
      } else if (state.uploadedFiles.has(path)) {
        staged.set(path, { path, content: state.uploadedFiles.get(path) });
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
    for (const [path, content] of state.uploadedFiles) {
      if (!staged.has(path)) staged.set(path, { path, content });
    }
    const additionalFiles = [...staged.values()];

    setStatus("Compiling (this can take a while the first time)…", { spinning: true });
    const started = performance.now();
    const lualatex = new LuaLatex(state.runner);

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
    state.lastResult = record;
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
    state.lastResult = { ok: false, firstError: null, log: String(error && error.stack || error) };
    window.__probeResults = { "scenario-svg": state.lastResult };
    showError({ firstError: `Unexpected error: ${error.message || error}`, log: String(error && error.stack || error) });
    setStatus("Build failed.", { tone: "bad" });
  } finally {
    setBuilding(false);
  }
}

export function initBuild() {
  el("build").addEventListener("click", () => {
    runBuild();
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

  // Drives tools/render_parity.sh's capture-pdf.mjs; no step ladder here so the first arg is unused.
  window.__probeRun = async (_stepId, scenarioPath) => {
    if (scenarioPath) {
      // Basename as name keeps identity == scenarioPath, matching what tools/build.sh -s builds.
      await commitEntry(scenarioPath, basenameNoExt(scenarioPath));
    }
    await runBuild();
    return window.__probeResults["scenario-svg"];
  };

  // capture-pdf.mjs clicks "#save-pdf"; forward it to the app's real "#download" control.
  const saveAlias = document.createElement("button");
  saveAlias.id = "save-pdf";
  saveAlias.hidden = true;
  saveAlias.addEventListener("click", () => el("download").click());
  document.body.appendChild(saveAlias);
}

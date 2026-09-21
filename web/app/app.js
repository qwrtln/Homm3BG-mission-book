import { errorMessage } from "../shared/errors.js";
import { state } from "./modules/state.js";
import { el, setStatus, escapeHtml } from "./modules/dom.js";
import { preloadCommonFiles } from "./modules/files.js";
import { initTheme, applyTheme, initialTheme } from "./modules/theme.js";
import { initEditor } from "./modules/editor.js";
import { loadEntries } from "./modules/entries.js";
import { initSearch } from "./modules/search.js";
import { initPicker } from "./modules/picker.js";
import { initUploads } from "./modules/uploads.js";
import { initBuild, ensureEngine } from "./modules/build.js";
import { initGithub, openRoute } from "./modules/github.js";

initTheme();
initEditor();
applyTheme(initialTheme());
initSearch();
initPicker();
initUploads();
initBuild();
const githubReady = initGithub();

const entriesReady = loadEntries()
  .then(() => {
    if (!state.entries.length) setStatus("No scenarios found.", { tone: "bad" });
  })
  .catch((error) => {
    el("search-results").innerHTML = `<div class="combobox-empty">Could not read the scenario list: ${escapeHtml(errorMessage(error))}</div>`;
    el("search-results").hidden = false;
  });

// The address may name a scenario; open it once both the entries and GitHub are known.
Promise.allSettled([githubReady, entriesReady]).then(openRoute);

// Starts on page load, not on Build click; errors surface later via ensureEngine's shared promise.
ensureEngine().catch(() => {});

// Same eager timing as the warm-up above; fills preloadedFiles before a scenario is picked.
preloadCommonFiles().catch(() => {});

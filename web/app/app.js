import { errorMessage } from "../shared/errors.js";
import { initAbout } from "./modules/about.js";
import { initAutocomplete } from "./modules/autocomplete.js";
import { ensureEngine, initBuild } from "./modules/build.js";
import { initCategory } from "./modules/category.js";
import { el, escapeHtml, setStatus } from "./modules/dom.js";
import { initEditor } from "./modules/editor.js";
import { loadEntries } from "./modules/entries.js";
import { initFeedback } from "./modules/feedback.js";
import { preloadCommonFiles } from "./modules/files.js";
import { initGithub, openRoute } from "./modules/github.js";
import { initHeaderMenu } from "./modules/header.js";
import { initHelp } from "./modules/help.js";
import { initPanes } from "./modules/panes.js";
import { initPdfView } from "./modules/pdf-view.js";
import { initPicker } from "./modules/picker.js";
import { initSearch } from "./modules/search.js";
import { initShortcuts } from "./modules/shortcuts.js";
import { state } from "./modules/state.js";
import { initSubmit } from "./modules/submit.js";
import { applyTheme, initialTheme, initTheme } from "./modules/theme.js";
import { initUploads } from "./modules/uploads.js";
import { initWizard } from "./modules/wizard.js";

initTheme();
initHeaderMenu();
initCategory();
initAbout();
initHelp();
initFeedback();
initEditor();
initPanes();
initPdfView();
initAutocomplete();
applyTheme(initialTheme());
initSearch();
initPicker();
initWizard();
initUploads();
initBuild();
initShortcuts();
initSubmit();
const githubReady = initGithub();

const entriesReady = loadEntries()
  .then(() => {
    if (!state.entries.length) setStatus("No scenarios found.", { tone: "bad" });
  })
  .catch((error) => {
    el("search-results").innerHTML =
      `<div class="combobox-empty">Could not read the scenario list: ${escapeHtml(errorMessage(error))}</div>`;
    el("search-results").hidden = false;
  });

// The address may name a scenario; open it once both the entries and GitHub are known.
Promise.allSettled([githubReady, entriesReady]).then(openRoute);

// Starts on page load, not on Build click; errors surface later via ensureEngine's shared promise.
ensureEngine().catch(() => {});

// Same eager timing as the warm-up above; fills preloadedFiles before a scenario is picked.
preloadCommonFiles().catch(() => {});

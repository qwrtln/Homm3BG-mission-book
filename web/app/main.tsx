import { errorMessage } from "../shared/errors.ts";
import { AboutDialog } from "./components/AboutDialog.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { FeedbackDialog } from "./components/FeedbackDialog.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { Header } from "./components/header/Header.tsx";
import { Toaster } from "./components/Toaster.tsx";
import { ModeChoice } from "./components/welcome/ModeChoice.tsx";
import { PickerMain } from "./components/welcome/PickerMain.tsx";
import { initGithub, openRoute } from "./github/index.ts";
import { initAutocomplete } from "./modules/autocomplete.js";
import { ensureEngine } from "./modules/build.js";
import { initCategory } from "./modules/category.ts";
import { setStatus } from "./modules/dom.js";
import { initEditor } from "./modules/editor.js";
import { loadEntries } from "./modules/entries.ts";
import { preloadCommonFiles } from "./modules/files.ts";
import { loadRecord, saveText, saveUploads } from "./modules/local-store.ts";
import { initPanes } from "./modules/panes.js";
import { initPdfView } from "./modules/pdf-view.js";
import { initShortcuts } from "./modules/shortcuts.js";
import { state } from "./modules/state.ts";
import { initSubmit } from "./modules/submit.js";
import { applyTheme, initialTheme } from "./modules/theme.ts";
import { initUploads } from "./modules/uploads.js";
import { initWizard } from "./modules/wizard.js";
import { mountRegion } from "./mount.tsx";
import { store } from "./store.ts";

// Test hooks, like __lastSaveTarget: the build bundles the modules, so a test
// cannot import its own copy of them from the page.
window.__state = state;
window.__localStore = { loadRecord, saveText, saveUploads };

initCategory();
mountRegion("header", <Header />);
mountRegion(
  "overlays",
  <>
    <AboutDialog />
    <HelpDialog />
    <FeedbackDialog />
    <ConfirmDialog />
    <Toaster />
  </>,
);
mountRegion("welcome-mode", <ModeChoice />);
mountRegion("welcome-pick", <PickerMain />);
initEditor();
initPanes();
initPdfView();
initAutocomplete();
applyTheme(initialTheme());
initWizard();
initUploads();
initShortcuts();
initSubmit();
const githubReady = initGithub();

const entriesReady = loadEntries()
  .then(() => {
    if (!state.entries.length) setStatus("No scenarios found.", { tone: "bad" });
  })
  .catch((error) => {
    store.setState({ entriesError: errorMessage(error) });
  });

// The address may name a scenario; open it once both the entries and GitHub are known.
Promise.allSettled([githubReady, entriesReady]).then(openRoute);

// Starts on page load, not on Build click; errors surface later via ensureEngine's shared promise.
ensureEngine().catch(() => {});

// Same eager timing as the warm-up above; fills preloadedFiles before a scenario is picked.
preloadCommonFiles().catch(() => {});

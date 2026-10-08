import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { errorMessage } from "../shared/errors.ts";
import { App } from "./App.tsx";
import { initGithub, openRoute } from "./github/index.ts";
import { ensureEngine } from "./modules/build.ts";
import { initCategory } from "./modules/category.ts";
import { loadEntries } from "./modules/entries.ts";
import { preloadCommonFiles } from "./modules/files.ts";
import { listRecords, loadRecord, saveText, saveUploads, setBaseSha } from "./modules/local-store.ts";
import { initShortcuts } from "./modules/shortcuts.ts";
import { setStatus } from "./modules/status.ts";
import { applyTheme, initialTheme } from "./modules/theme.ts";
import { initUploads } from "./modules/uploads.ts";
import { initWizard } from "./modules/wizard.ts";
import { store } from "./store.ts";
import "./styles/app.css";

// Test hooks, like __lastSaveTarget: the build bundles the modules, so a test
// cannot import its own copy of them from the page.
Object.defineProperty(window, "__state", { get: () => store.getState() });
window.__localStore = { listRecords, loadRecord, saveText, saveUploads, setBaseSha };

initCategory();
// Synchronous, so the page's DOM and the effects of its components exist when the init*() calls below run.
const root = document.getElementById("root");
if (root === null) throw new Error('app/index.html has no element with id "root".');
flushSync(() => createRoot(root).render(<App />));
applyTheme(initialTheme());
initWizard();
initUploads();
initShortcuts();
const githubReady = initGithub();

const entriesReady = loadEntries()
  .then(() => {
    if (!store.getState().entries.length) setStatus("No scenarios found.", { tone: "bad" });
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

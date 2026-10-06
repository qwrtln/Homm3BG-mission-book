import { errorMessage } from "../shared/errors.ts";
import { AboutDialog } from "./components/AboutDialog.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { FeedbackDialog } from "./components/FeedbackDialog.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { Header } from "./components/header/Header.tsx";
import { Toaster } from "./components/Toaster.tsx";
import { UploadDialog } from "./components/uploads/UploadDialog.tsx";
import { ModeChoice } from "./components/welcome/ModeChoice.tsx";
import { PickerMain } from "./components/welcome/PickerMain.tsx";
import { StartChoice } from "./components/wizard/StartChoice.tsx";
import { Wizard } from "./components/wizard/Wizard.tsx";
import { SubmitDialog } from "./components/workspace/SubmitDialog.tsx";
import { Workspace } from "./components/workspace/Workspace.tsx";
import { initGithub, openRoute } from "./github/index.ts";
import { ensureEngine } from "./modules/build.ts";
import { initCategory } from "./modules/category.ts";
import { loadEntries } from "./modules/entries.ts";
import { preloadCommonFiles } from "./modules/files.ts";
import { loadRecord, saveText, saveUploads } from "./modules/local-store.ts";
import { initShortcuts } from "./modules/shortcuts.ts";
import { state } from "./modules/state.ts";
import { initStaleStatus, setStatus } from "./modules/status.ts";
import { applyTheme, initialTheme } from "./modules/theme.ts";
import { initUploads } from "./modules/uploads.ts";
import { initWizard } from "./modules/wizard.ts";
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
    <UploadDialog />
    <ConfirmDialog />
    <SubmitDialog />
    <Toaster />
  </>,
);
mountRegion("welcome-mode", <ModeChoice />);
mountRegion("welcome-start", <StartChoice />);
mountRegion("welcome-pick", <PickerMain />);
mountRegion("welcome-wizard", <Wizard />);
mountRegion("workspace", <Workspace />);
initStaleStatus();
applyTheme(initialTheme());
initWizard();
initUploads();
initShortcuts();
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

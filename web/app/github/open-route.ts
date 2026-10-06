import { getToken } from "../../shared/github-auth.ts";
import { parseRoute, slugToPath } from "../../shared/route.ts";
import { syncCategoryControl } from "../modules/category.ts";
import { markClean } from "../modules/dirty.ts";
import { basenameNoExt, readyStatus } from "../modules/dom.ts";
import { loadDraft } from "../modules/drafts.ts";
import { requireEditor } from "../modules/editor-api.ts";
import { resetGithubSaveState } from "../modules/github-save-state.ts";
import { setScenarioTitle } from "../modules/header.ts";
import { loadRecord } from "../modules/local-store.ts";
import { clearRoute, endRouteLoading, reflectRoute } from "../modules/route.ts";
import { setStatus } from "../modules/status.ts";
import { resetUploads, restoreUploads } from "../modules/uploads.ts";
import { showWorkspace } from "../modules/workspace.ts";
import { clearPdf } from "../pdf/view.ts";
import { store } from "../store.ts";
import { getGithubContext, ROUTE_KEY } from "./context.ts";
import { openResumableDraft, startEdit } from "./resume.ts";

/**
 * Reopens what was being edited before a sign-in redirect. From localStorage
 * only, no server fetch: for a scenario never yet saved anywhere but here.
 *
 * @returns false when there is nothing stored for it
 */
export async function reopenLocalDraft(path: string, title?: string): Promise<boolean> {
  const record = await loadRecord(path);
  const content = record.text ?? loadDraft(path);
  if (content === null) return false;

  const editor = requireEditor();
  await showWorkspace();
  store.setState({ actionsVisible: true });
  resetGithubSaveState();

  store.setState({ chosenPath: path });
  setScenarioTitle(title || basenameNoExt(path));
  syncCategoryControl();
  reflectRoute();
  store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply
  editor.setText(content);
  store.setState({ draftNote: true });
  resetUploads();
  restoreUploads(record.uploads ?? []);
  clearPdf();
  markClean(null); // no clean copy here: the draft was never saved anywhere else
  setStatus(readyStatus());
  return true;
}

/**
 * Opens whatever the URL's "#/drafts/<name>" or "#/updates/<name>" names, once
 * the entries and the GitHub context are known. When nothing matches, the
 * address is dropped and the welcome screen stays.
 */
export async function openRoute(): Promise<void> {
  try {
    await resolveRoute();
  } finally {
    endRouteLoading(); // whatever happened, the loading screen must not outlive the lookup
  }
}

async function resolveRoute(): Promise<void> {
  if (store.getState().chosenPath) return; // a sign-in reopen already opened something
  try {
    const kept = localStorage.getItem(ROUTE_KEY);
    localStorage.removeItem(ROUTE_KEY);
    if (kept && !parseRoute(location.hash) && parseRoute(kept)) location.hash = kept;
  } catch {
    /* blocked storage: nothing was kept */
  }
  const route = parseRoute(location.hash);
  if (!route) {
    if (location.hash.startsWith("#/")) clearRoute();
    return;
  }
  const context = getGithubContext();
  // Signed in but the account lookup failed: the address may still be valid, so keep it.
  if (getToken() && !context) return;
  const path = slugToPath(route.kind, route.slug);
  const remote = (context?.drafts ?? []).filter((d) => d.texPath === path);

  if (route.kind === "drafts") {
    const branch = remote.find((d) => d.kind === "new");
    if (branch) {
      await openResumableDraft(branch);
      if (store.getState().chosenPath) return;
    }
    if (await reopenLocalDraft(path)) return;
  } else if (context?.isMember) {
    const branch = remote.find((d) => d.kind === "edit");
    if (branch) {
      await openResumableDraft(branch);
      if (store.getState().chosenPath) return;
    }
    const entry = store.getState().entries.find((e) => e.path === path);
    if (entry) {
      await startEdit(entry.path, entry.title);
      if (store.getState().chosenPath) return;
    }
  }
  clearRoute();
}

import { clearToken, signIn } from "../../shared/github-auth.ts";
import { parseRoute } from "../../shared/route.ts";
import { isDirty } from "../modules/dirty.ts";
import { confirmAction } from "../modules/dom.ts";
import { cancelScheduledSave, deleteDraft, flushDraft } from "../modules/drafts.ts";
import { getEditor } from "../modules/editor-api.ts";
import { resetGithubSaveState } from "../modules/github-save-state.ts";
import { deleteRecord } from "../modules/local-store.ts";
import { settleModes } from "../modules/picker.ts";
import { isParked, showWelcome } from "../modules/workspace.ts";
import { setResume, store } from "../store.ts";
import { REOPEN_KEY, ROUTE_KEY, setGithubContext, syncGithubHeader } from "./context.ts";
import { refreshWelcomeData } from "./resume.ts";

/**
 * The sign-in button. The redirect to GitHub unloads the page, so what is
 * open is remembered first: the address, and the editor's text.
 */
export async function startSignIn(): Promise<void> {
  try {
    if (parseRoute(location.hash)) localStorage.setItem(ROUTE_KEY, location.hash);
  } catch {
    /* blocked storage: sign-in still proceeds */
  }
  // A scenario left behind the welcome screen is not reopened: the member left it.
  const editor = getEditor();
  const { chosenPath, chosenTitle } = store.getState();
  if (chosenPath && editor && !isParked()) {
    cancelScheduledSave();
    // Awaited: the redirect below unloads the page, which can abort an
    // IndexedDB write still in flight.
    await flushDraft(chosenPath, editor.getText());
    try {
      localStorage.setItem(REOPEN_KEY, JSON.stringify({ path: chosenPath, title: chosenTitle }));
    } catch {
      /* private mode, blocked storage: sign-in still proceeds */
    }
  }
  signIn();
}

/**
 * Sign out. Signed out mid-edit, the autosaved copy belongs to the account
 * that just left, so purge it and go back to welcome. A reload is the only
 * reset that clears the editor, uploads and module state together. The
 * IndexedDB delete is awaited before it, as a delete started just before an
 * unload can abort.
 */
export async function handleSignOut(): Promise<void> {
  clearToken();
  setGithubContext(null);
  resetGithubSaveState();
  setResume({ visible: false });
  settleModes(false);
  if (store.getState().workspaceShown || isParked()) {
    cancelScheduledSave();
    const path = store.getState().chosenPath;
    if (path) deleteDraft(path);
    try {
      localStorage.removeItem(REOPEN_KEY);
    } catch {
      /* blocked storage: nothing to remove */
    }
    if (path) await deleteRecord(path);
    location.reload();
    return;
  }
  syncGithubHeader();
}

/** "Back" from the workspace. Asks first when there is something unsaved. */
export async function leaveWorkspace(): Promise<void> {
  if (isDirty()) {
    const leave = await confirmAction({
      title: "Leave with unsaved changes?",
      message: `"${store.getState().chosenTitle}" has changes that are not saved. A copy stays in this browser's autosave.`,
      warning: "",
      okLabel: "Leave",
      danger: false,
    });
    if (!leave) return;
  }
  showWelcome();
  void refreshWelcomeData();
}

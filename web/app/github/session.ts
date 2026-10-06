import { clearToken, getToken, revokeToken, signIn, storeToken } from "../../shared/github-auth.ts";
import { validateTokenContext } from "../../shared/github-contrib.ts";
import { parseRoute } from "../../shared/route.ts";
import { isDirty } from "../modules/dirty.ts";
import { confirmAction } from "../modules/dom.ts";
import { cancelScheduledSave, deleteDraft, flushDraft } from "../modules/drafts.ts";
import { getEditor } from "../modules/editor-api.ts";
import { resetGithubSaveState } from "../modules/github-save-state.ts";
import { deleteRecord } from "../modules/local-store.ts";
import { settleModes } from "../modules/picker.ts";
import { showToast } from "../modules/toast.ts";
import { isParked, showWelcome } from "../modules/workspace.ts";
import { setResume, store } from "../store.ts";
import { REOPEN_KEY, ROUTE_KEY, setGithubContext, syncGithubHeader } from "./context.ts";
import { refreshWelcomeData, renderResumeDrafts } from "./resume.ts";
import { stopPullRequestRecheck } from "./save.ts";

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
 * Signs in with a pasted token, without leaving the page: validates it, then
 * does what start-up does after an OAuth redirect. On failure it throws and
 * changes nothing. The open editor and draft are untouched.
 *
 * @throws GithubApiError with a user-facing message
 */
export async function signInWithToken(raw: string): Promise<void> {
  const context = await validateTokenContext(raw);
  storeToken(raw.trim(), "token");
  setGithubContext(context);
  renderResumeDrafts();
  setResume({ searching: false, visible: context.drafts.length > 0 });
  settleModes(context.isMember);
  syncGithubHeader();
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
  stopPullRequestRecheck();
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

/**
 * Sign out under a pasted token, and revoke the token on GitHub first. Asks
 * before, since a revoked token cannot come back. When GitHub refuses the
 * request, the user stays signed in and is told to delete the token by hand.
 */
export async function handleSignOutAndRevoke(): Promise<void> {
  const token = getToken();
  if (!token) return;
  const revoke = await confirmAction({
    title: "Revoke this token?",
    message: "The builder signs you out and asks GitHub to revoke the token. GitHub emails you when it is done.",
    warning:
      store.getState().workspaceShown || isParked()
        ? "A revoked token cannot be used again. You need a new token to sign in. Your open scenario closes, and edits not saved to GitHub are lost."
        : "A revoked token cannot be used again. You need a new token to sign in.",
    okLabel: "Revoke and sign out",
    danger: true,
  });
  if (!revoke) return;
  if (!(await revokeToken(token))) {
    showToast("GitHub did not revoke the token. Delete it on github.com instead.", "bad");
    return;
  }
  await handleSignOut();
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

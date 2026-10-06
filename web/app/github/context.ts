import { errorMessage } from "../../shared/errors.ts";
import { clearToken, getToken } from "../../shared/github-auth.ts";
import { GithubApiError } from "../../shared/github-contrib.ts";
import { setSaveControlsVisible } from "../modules/github-save-state.ts";
import { settleModes } from "../modules/picker.ts";
import { setResume, store } from "../store.ts";

// Sign-in is a full-page redirect, dropping chosenPath and the autosave debounce. Flush and remember what was open.
export const REOPEN_KEY = "wasm-scenario-builder:pending-reopen";
// The redirect back from GitHub carries no fragment, so the scenario address is kept here across it.
// The inline pre-paint script in app/index.html reads this literal too: rename both together.
export const ROUTE_KEY = "wasm-scenario-builder:pending-route";

export const SIGN_IN_EXPIRED = "Your GitHub sign-in has expired. Sign in again.";

/** What the account lookup found once the member signed in; null while signed out or before it answers. */
let githubContext: GithubContext | null = null;

export function getGithubContext(): GithubContext | null {
  return githubContext;
}

export function setGithubContext(context: GithubContext | null): void {
  githubContext = context;
}

/** Tells the header whether a token is held (sign-in button, or save controls and Sign out), and whether a scenario is open. */
export function syncGithubHeader(): void {
  store.setState({ signedIn: Boolean(getToken()) });
  setSaveControlsVisible(store.getState().workspaceShown);
}

/**
 * GitHub revokes a token on its own (the oldest past ten per user and app, or
 * a year unused), so any call can meet a 401, not only the one at page load.
 * Signed-in chrome over a dead token would hide the account's work; drop the
 * token and offer sign-in instead. Unsaved editor work is left alone.
 *
 * @returns true when the error was a revoked sign-in, now handled
 */
export function dropRevokedToken(error: unknown): boolean {
  if (!(error instanceof GithubApiError && error.status === 401)) return false;
  clearToken();
  githubContext = null;
  setResume({ visible: false });
  settleModes(false);
  syncGithubHeader();
  return true;
}

/**
 * What to tell the user about a failed GitHub call.
 *
 * @param prefix leads the message for a failure that is not GitHub's
 */
export function githubFailure(error: unknown, prefix: string): string {
  if (dropRevokedToken(error)) return SIGN_IN_EXPIRED;
  return error instanceof GithubApiError ? error.message : `${prefix}: ${errorMessage(error)}`;
}

import { errorMessage } from "../../shared/errors.ts";
import { completeSignIn, getToken } from "../../shared/github-auth.ts";
import { discoverGithubContext } from "../../shared/github-contrib.ts";
import { parseRoute } from "../../shared/route.ts";
import { el } from "../modules/dom.ts";
import { githubSaveState } from "../modules/github-save-state.ts";
import { onEditPick, settleModes } from "../modules/picker.ts";
import { setStatus } from "../modules/status.ts";
import {
  dropRevokedToken,
  getGithubContext,
  REOPEN_KEY,
  SIGN_IN_EXPIRED,
  setGithubContext,
  syncGithubHeader,
} from "./context.ts";
import { reopenLocalDraft } from "./open-route.ts";
import { initResumeList, renderResumeDrafts, showResumeSearching, startEdit } from "./resume.ts";

export { openRoute } from "./open-route.ts";

/**
 * Wires the GitHub flow that is not a header button (the header components
 * call github/session.ts and github/save.ts themselves), then completes a
 * pending sign-in.
 *
 * @returns settles once sign-in and the draft search are done
 */
export function initGithub(): Promise<void> {
  (() => {
    let pending: { path?: string; title?: string } | null = null;
    try {
      const raw = localStorage.getItem(REOPEN_KEY);
      localStorage.removeItem(REOPEN_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch {
      /* nothing to reopen */
    }
    if (pending?.path) reopenLocalDraft(pending.path, pending.title);
  })();

  onEditPick(startEdit);

  window.__lastSaveTarget = () => githubSaveState.lastSaveTarget;

  initResumeList();

  // Before the account lookup finishes, not after: a signed-in user must not see "Sign in" while it runs.
  syncGithubHeader();
  if (getToken()) {
    showResumeSearching();
    if (parseRoute(location.hash)) setStatus("Opening your scenario…", { spinning: true });
  }
  return completeSignIn()
    .then(async (token) => {
      if (!token) return;
      showResumeSearching();
      try {
        setGithubContext(await discoverGithubContext(token));
        renderResumeDrafts();
      } catch (error) {
        const message = dropRevokedToken(error)
          ? SIGN_IN_EXPIRED
          : `Could not read your GitHub account: ${errorMessage(error)}`;
        setStatus(message, { tone: "bad" });
      }
    })
    .catch((error) => {
      setStatus(`GitHub sign-in failed: ${errorMessage(error)}`, { tone: "bad" });
    })
    .finally(() => {
      const context = getGithubContext();
      // Whatever happened, the searching state must not outlive the search.
      el("resume-loading").hidden = true;
      el("resume-hint").hidden = false;
      el("resume-drafts").hidden = !context || context.drafts.length === 0;
      // Whatever happened, the picker must not stay held back by the search.
      settleModes(Boolean(context?.isMember));
      syncGithubHeader();
    });
}

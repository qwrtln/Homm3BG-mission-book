import { el } from "./dom.js";

// {owner, repo, branch, isMember} of the last save/resumed draft: what "Save
// again" pushes to and "Open PR" opens against. Shared state, so a mutable object, not a plain let.
export const githubSaveState = { lastSaveTarget: null };

// On sign-out or picking a different scenario: neither carries over the previous branch/PR/button state.
export function resetGithubSaveState() {
  githubSaveState.lastSaveTarget = null;
  el("github-save").textContent = "💾 Save";
  el("github-open-pr").hidden = true;
  el("github-pr-link").hidden = true;
}

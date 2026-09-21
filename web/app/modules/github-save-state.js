import { el } from "./dom.js";

/**
 * Where the last save or resumed draft landed: what "Save again" pushes to
 * and "Open PR" opens against. Shared state, so a mutable object, not a
 * plain let.
 *
 * `edit` is set while a member is editing an existing scenario in place, and
 * `startOver` there means the first save must reset the branch to the default
 * branch. The save that does it clears it, so later saves build on top.
 *
 * @type {{lastSaveTarget: SaveTarget | null, edit: {startOver: boolean} | null}}
 */
export const githubSaveState = { lastSaveTarget: null, edit: null };

/**
 * On sign-out or picking a different scenario: neither carries over the
 * previous branch/PR/button state.
 *
 * @returns {void}
 */
export function resetGithubSaveState() {
  githubSaveState.lastSaveTarget = null;
  githubSaveState.edit = null;
  el("github-save").textContent = "💾 Save";
  el("github-open-pr").hidden = true;
  el("github-pr-link").hidden = true;
}

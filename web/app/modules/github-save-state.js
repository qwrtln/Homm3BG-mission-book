import { el } from "./dom.js";

/**
 * Where the last save or resumed draft landed: what "Save again" pushes to
 * and "Open PR" opens against. Shared state, so a mutable object, not a
 * plain let.
 *
 * @type {{lastSaveTarget: SaveTarget | null}}
 */
export const githubSaveState = { lastSaveTarget: null };

/**
 * On sign-out or picking a different scenario: neither carries over the
 * previous branch/PR/button state.
 *
 * @returns {void}
 */
export function resetGithubSaveState() {
  githubSaveState.lastSaveTarget = null;
  el("github-save").textContent = "💾 Save";
  el("github-open-pr").hidden = true;
  el("github-pr-link").hidden = true;
}

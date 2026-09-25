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
 * `committedUploads` holds the upload paths the branch carries: a resumed
 * draft's assets, then whatever the last save pushed. One missing from the
 * uploads dialog at the next save was dropped or renamed, and comes off the
 * branch.
 *
 * @type {{lastSaveTarget: SaveTarget | null, edit: {startOver: boolean} | null, committedUploads: Set<string>}}
 */
export const githubSaveState = { lastSaveTarget: null, edit: null, committedUploads: new Set() };

/**
 * On sign-out or picking a different scenario: neither carries over the
 * previous branch/PR/button state.
 *
 * @returns {void}
 */
export function resetGithubSaveState() {
  githubSaveState.lastSaveTarget = null;
  githubSaveState.edit = null;
  githubSaveState.committedUploads = new Set();
  el("github-open-pr").hidden = true;
  el("github-pr-link").hidden = true;
}

/**
 * Save, Open PR, the way back to scenario selection and the scenario's name
 * belong to an open scenario, so they show only while one is open. The app's own title shows only while none is.
 * Signed out, the sign-in button stands where Save would, so with a scenario
 * open it says that signing in is how to save.
 *
 * @param {boolean} visible
 * @returns {void}
 */
export function setSaveControlsVisible(visible) {
  const segment = el("github-save").parentElement;
  if (segment) segment.hidden = !visible;
  el("header-scenario").hidden = !visible;
  el("header-titles").hidden = visible;
  const signinLabel = el("github-signin").querySelector(".label");
  if (signinLabel) signinLabel.textContent = visible ? "Sign in to save" : "Sign in with GitHub";
}

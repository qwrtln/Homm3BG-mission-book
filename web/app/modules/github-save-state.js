import { store } from "../store.ts";

/** @typedef {import("../store.ts").SaveState} SaveState */

/**
 * The save fields of the store, as the old modules read and write them:
 * where the last save landed, the in-place edit, the upload paths the branch
 * carries, and whether a save is on its way. The fields are documented on
 * SaveState in app/store.ts. A mutation inside one (`edit.startOver = false`)
 * does not notify subscribers; assign a new value to do so.
 *
 * @type {SaveState}
 */
export const githubSaveState = new Proxy(/** @type {SaveState} */ ({}), {
  get: (_target, key) => store.getState()[/** @type {keyof SaveState} */ (key)],
  set: (_target, key, value) => {
    store.setState({ [key]: value });
    return true;
  },
});

/**
 * On sign-out or picking a different scenario: neither carries over the
 * previous branch/PR/button state. Subscribers of the store (the header)
 * see the cleared fields.
 *
 * @returns {void}
 */
export function resetGithubSaveState() {
  store.setState({ lastSaveTarget: null, edit: null, committedUploads: new Set(), openPrVisible: false, prUrl: null });
}

/**
 * Save, Open PR, the way back to scenario selection and the scenario's name
 * belong to an open scenario, so they show only while one is open. The app's own title shows only while none is.
 * Signed out, the sign-in button stands where Save would, so with a scenario
 * open it says that signing in is how to save. The header renders all of this
 * from the store.
 *
 * @param {boolean} visible
 * @returns {void}
 */
export function setSaveControlsVisible(visible) {
  store.setState({ scenarioHeaderVisible: visible });
}

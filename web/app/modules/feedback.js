import { el } from "./dom.js";

/**
 * Wires the menu's Send feedback item to the dialog that links to a new
 * GitHub issue, to Discord and to BoardGameGeek. A link opens in a new tab
 * and closes the dialog, so the contributor comes back to the app, not to
 * the dialog.
 *
 * @returns {void}
 */
export function initFeedback() {
  const dialog = el("feedback-dialog");
  el("feedback-open").addEventListener("click", () => dialog.showModal());
  for (const link of [el("feedback-github"), el("feedback-discord"), el("feedback-bgg")]) {
    link.addEventListener("click", () => dialog.close());
  }
}

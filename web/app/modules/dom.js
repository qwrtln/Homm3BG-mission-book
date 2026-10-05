import { basenameNoExt, escapeHtml, sanitizeFilename } from "../../shared/dom-strings.ts";
import { isMacPlatform, keyLabel, shortcutKeys } from "../../shared/keymap.ts";
import { state } from "./state.ts";

export { basenameNoExt, escapeHtml, sanitizeFilename };

/**
 * Whether the browser is running on macOS or iOS, read from the platform the
 * browser itself reports.
 *
 * @returns {boolean}
 */
export function isMac() {
  return isMacPlatform(navigator.userAgentData?.platform || navigator.platform);
}

/**
 * The build key's label for this platform, e.g. "Ctrl+Enter" or "⌘↩".
 *
 * @returns {string}
 */
export function buildKeyLabel() {
  const mac = isMac();
  return keyLabel(shortcutKeys("build", mac)[0], mac);
}

/**
 * The status shown once a scenario is open and nothing differs from what is
 * shown, naming how to start a build.
 *
 * @returns {string}
 */
export function readyStatus() {
  return `Ready. Press Build PDF or ${buildKeyLabel()} to start.`;
}

/** The idle Build button's title, once computed. Empty until initBuildTitle() runs. */
let idleBuildTitle = "";

/**
 * Computes and sets the Build button's idle title, naming the build key for
 * this platform (e.g. "Build PDF (Ctrl+Enter)"). Call once at init, since
 * setBuilding may not run before the first build.
 *
 * @param {boolean} mac true to name the macOS key alternative
 * @returns {void}
 */
export function initBuildTitle(mac) {
  const label = keyLabel(shortcutKeys("build", mac)[0], mac);
  idleBuildTitle = `Build PDF (${label})`;
  el("build").title = idleBuildTitle;
}

/**
 * One element by id, typed from the id itself: `el("build")` is an
 * HTMLButtonElement, `el("search")` an HTMLInputElement. The mapping lives in
 * web/types/dom-ids.d.ts, so a mistyped id fails the type check.
 *
 * The result is not nullable, because a missing element throws here instead
 * of returning null. Nothing checks the map against app/index.html, so drift
 * between the two is possible; this is where it surfaces, named, rather than
 * as an undefined property access further on.
 *
 * @template {keyof ElementIdMap} K
 * @param {K} id
 * @returns {ElementIdMap[K]}
 */
export function el(id) {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`app/index.html has no element with id "${id}".`);
  return /** @type {ElementIdMap[K]} */ (element);
}

/**
 * The nearest ancestor of an event's target matching `selector`, for
 * delegated handlers. Null when the event did not start on an element, or
 * when nothing up the tree matches.
 *
 * @param {Event} event
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export function closestTo(event, selector) {
  const { target } = event;
  if (!(target instanceof Element)) return null;
  const match = target.closest(selector);
  return match instanceof HTMLElement ? match : null;
}

/**
 * Writes the status bar. The spinner element is reused, never rebuilt: a
 * fresh node via innerHTML would restart the CSS animation.
 *
 * @param {string} text
 * @param {{spinning?: boolean, tone?: "" | "ok" | "bad"}} [options]
 * @returns {void}
 */
export function setStatus(text, { spinning = false, tone = "" } = {}) {
  el("status-spinner").hidden = !spinning;
  const textEl = el("status-text");
  textEl.textContent = text;
  textEl.className = tone;
}

/**
 * Enters or leaves the building state: the button and the progress bar
 * together. While building, the Build button turns into Stop. The PDF pane
 * stays readable under the bar.
 *
 * @param {boolean} value
 * @returns {void}
 */
export function setBuilding(value) {
  state.building = value;
  const build = el("build");
  build.disabled = !value && !state.chosenPath;
  // Pin the Build width while the shorter "Stop" shows, measured, not guessed:
  // fonts differ, and a shrinking button slides its neighbours under the pointer.
  build.style.minWidth = value ? `${build.getBoundingClientRect().width}px` : "";
  el("build-label").textContent = value ? "Stop" : "Build PDF";
  build.title = value ? "Stop the build" : idleBuildTitle;
  build.classList.toggle("stop", value);
  el("build-progress").hidden = !value;
  el("build-phase").hidden = !value;
}

/**
 * Names the build's current step on the PDF pane: in the label over the
 * pages, and in the caption under the spinner when the pane has no PDF yet.
 *
 * @param {string} text short: it sits over the PDF
 * @returns {void}
 */
export function setBuildPhase(text) {
  el("build-phase-text").textContent = text;
  const caption = document.querySelector("#pdf-body .empty-pdf.loading p");
  if (caption) caption.textContent = text;
}

/**
 * Asks the contributor to confirm a destructive action in the page's own
 * modal. Escape, the backdrop-less Cancel button and closing all answer no.
 *
 * @param {string} message what is about to be deleted
 * @returns {Promise<boolean>} true only when "Delete" was pressed
 */
export function confirmDelete(message) {
  return confirmAction({
    title: "Delete this work in progress?",
    message,
    warning: "This cannot be undone.",
    okLabel: "Delete",
    danger: true,
  });
}

/**
 * Asks in the page's own modal. Escape and Cancel answer no; Cancel has focus.
 *
 * @param {{title: string, message: string, warning: string, okLabel: string, cancelLabel?: string, danger: boolean}} options
 * @returns {Promise<boolean>} true only when the confirming button was pressed
 */
export function confirmAction({ title, message, warning, okLabel, cancelLabel = "Cancel", danger }) {
  const dialog = el("confirm-dialog");
  el("confirm-title").textContent = title;
  el("confirm-message").textContent = message;
  el("confirm-warning").textContent = warning;
  el("confirm-warning").hidden = warning === "";
  el("confirm-ok").textContent = okLabel;
  el("confirm-cancel").textContent = cancelLabel;
  el("confirm-ok").classList.toggle("danger", danger);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.returnValue = "cancel";
    dialog.showModal();
    el("confirm-cancel").focus(); // the safe default
  });
}

import { state } from "./state.js";

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
 * Escapes the three characters that could break out of an HTML text node.
 *
 * @param {unknown} text anything; stringified first, as call sites pass
 *   element textContent, which is nullable
 * @returns {string}
 */
export function escapeHtml(text) {
  /** @type {Record<string, string>} */
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  return String(text).replace(/[&<>]/g, (c) => replacements[c]);
}

/**
 * Enters or leaves the building state: button, overlay and dimming together.
 *
 * @param {boolean} value
 * @returns {void}
 */
export function setBuilding(value) {
  state.building = value;
  el("build").disabled = value || !state.chosenPath;
  el("build-overlay").hidden = !value;
  el("pdf-body").classList.toggle("dimmed", value);
}

/**
 * The filename part of a path, without its .tex extension.
 *
 * @param {string} path
 * @returns {string}
 */
export function basenameNoExt(path) {
  // split always yields at least one element, so pop never returns undefined.
  const base = /** @type {string} */ (path.split("/").pop());
  return base.replace(/\.tex$/, "");
}

/**
 * Safe .tex basename: lowercase, underscores for anything else, "untitled"
 * if that leaves nothing.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
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
 * @param {{title: string, message: string, warning: string, okLabel: string, danger: boolean}} options
 * @returns {Promise<boolean>} true only when the confirming button was pressed
 */
export function confirmAction({ title, message, warning, okLabel, danger }) {
  const dialog = el("confirm-dialog");
  el("confirm-title").textContent = title;
  el("confirm-message").textContent = message;
  el("confirm-warning").textContent = warning;
  el("confirm-warning").hidden = warning === "";
  el("confirm-ok").textContent = okLabel;
  el("confirm-ok").classList.toggle("danger", danger);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.returnValue = "cancel";
    dialog.showModal();
    el("confirm-cancel").focus(); // the safe default
  });
}

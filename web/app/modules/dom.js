import { state } from "./state.js";

/**
 * One element by id, typed from the id itself: `el("build")` is an
 * HTMLButtonElement, `el("search")` an HTMLInputElement. The mapping lives in
 * web/types/dom-ids.d.ts, so a mistyped id fails the type check.
 *
 * Every id in that map is present in app/index.html, so the result is not
 * treated as nullable. It resolves to null only if the markup and the map
 * have drifted, which is what keeping the map in step prevents.
 *
 * @template {keyof ElementIdMap} K
 * @param {K} id
 * @returns {ElementIdMap[K]}
 */
export const el = (id) => /** @type {ElementIdMap[K]} */ (document.getElementById(id));

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
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}

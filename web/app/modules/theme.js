import { state } from "./state.js";
import { el } from "./dom.js";

export const THEME_KEY = "wasm-scenario-builder:theme";

/**
 * @typedef {"dark" | "light"} Theme
 */

/**
 * Applies a theme to the document, the editor and the toggle, and remembers
 * it.
 *
 * @param {Theme} theme
 * @returns {void}
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
  if (state.cm) state.cm.setOption("theme", theme === "dark" ? "github-dark" : "github-light");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just does not persist.
  }
}

/**
 * The saved theme, or the system preference when there is none.
 *
 * @returns {Theme}
 */
export function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // fall through to the system preference
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Wires the toggle. @returns {void} */
export function initTheme() {
  el("theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
}

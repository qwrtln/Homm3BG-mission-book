import { state } from "./state.js";
import { el } from "./dom.js";

export const THEME_KEY = "wasm-scenario-builder:theme";

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
  if (state.cm) state.cm.setOption("theme", theme === "dark" ? "material-darker" : "default");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just does not persist.
  }
}

export function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // fall through to the system preference
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initTheme() {
  el("theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
}

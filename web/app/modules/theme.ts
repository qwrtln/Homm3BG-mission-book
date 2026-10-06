import { store } from "../store.ts";

export const THEME_KEY = "wasm-scenario-builder:theme";

export type Theme = "dark" | "light";

/**
 * Applies a theme to the document and the store (which the menu's "Dark mode"
 * checkbox and the editor render from), and remembers it.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  store.setState({ theme });
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just does not persist.
  }
}

/** The saved theme, or the system preference when there is none. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // fall through to the system preference
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Flips between the light and the dark theme. */
export function toggleTheme(): void {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

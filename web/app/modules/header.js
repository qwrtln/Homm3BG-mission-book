import { el } from "./dom.js";
import { state } from "./state.js";

const APP_TITLE = "Heroes III: The Board Game – Scenario Builder";

/**
 * Names the open scenario: the shared state, the header and the tab title.
 * An empty title means no scenario is open, and the tab gets the app's name.
 *
 * @param {string} title
 * @returns {void}
 */
export function setScenarioTitle(title) {
  state.chosenTitle = title;
  el("scenario-title").textContent = title;
  document.title = title ? `${title} – Heroes III: The Board Game` : APP_TITLE;
}

/**
 * The menu's items a contributor can reach now: hidden ones are skipped.
 *
 * @param {HTMLElement} menu
 * @returns {HTMLElement[]}
 */
function menuItems(menu) {
  const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]');
  return /** @type {HTMLElement[]} */ ([...items]).filter((item) => !item.hidden);
}

/**
 * @param {HTMLElement} toggle
 * @param {HTMLElement} menu
 * @param {boolean} open
 * @param {{focus?: "first" | "last" | "toggle" | "none"}} [options] where focus goes
 * @returns {void}
 */
function setMenuOpen(toggle, menu, open, { focus = "none" } = {}) {
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  const items = menuItems(menu);
  if (focus === "first") items[0]?.focus();
  if (focus === "last") items[items.length - 1]?.focus();
  if (focus === "toggle") toggle.focus();
}

/**
 * Moves focus to the item `step` places from the focused one, wrapping.
 *
 * @param {HTMLElement} menu
 * @param {number} step
 * @returns {void}
 */
function moveFocus(menu, step) {
  const items = menuItems(menu);
  if (!items.length) return;
  const current = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  items[(current + step + items.length) % items.length].focus();
}

/**
 * Wires one ARIA menu: its toggle opens and closes it, arrow keys move
 * through it, and Escape, Tab, a pick or a click outside close it. Used for
 * both the overflow (kebab) menu and the download menu.
 *
 * @param {HTMLElement} toggle
 * @param {HTMLElement} menu
 * @returns {void}
 */
export function initMenu(toggle, menu) {
  toggle.addEventListener("click", () => {
    setMenuOpen(toggle, menu, menu.hidden, { focus: menu.hidden ? "first" : "none" });
  });
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMenuOpen(toggle, menu, true, { focus: event.key === "ArrowDown" ? "first" : "last" });
    }
  });

  menu.addEventListener("keydown", (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(menu, moves[/** @type {"ArrowDown" | "ArrowUp"} */ (event.key)]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = menuItems(menu);
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(toggle, menu, false, { focus: "toggle" });
    } else if (event.key === "Tab") {
      setMenuOpen(toggle, menu, false);
    }
  });

  // Capture phase: the menu closes, and focus returns to its button, before
  // the item's own handler runs. Focus is never left on a hidden item, and a
  // dialog an item opens later hands focus back to the button.
  menu.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest("[role^='menuitem']")) {
        setMenuOpen(toggle, menu, false, { focus: "toggle" });
      }
    },
    true,
  );

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (event.target instanceof Node && (menu.contains(event.target) || toggle.contains(event.target))) return;
    setMenuOpen(toggle, menu, false);
  });
}

/**
 * Wires the overflow menu and the download menu, each its own ARIA menu
 * sharing initMenu's open/close/keyboard behaviour.
 *
 * @returns {void}
 */
export function initHeaderMenu() {
  initMenu(el("header-menu-toggle"), el("header-menu"));
  initMenu(el("download"), el("download-menu"));
}

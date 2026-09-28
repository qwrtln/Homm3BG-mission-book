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
 * @returns {HTMLElement[]}
 */
function menuItems() {
  const items = el("header-menu").querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]');
  return /** @type {HTMLElement[]} */ ([...items]).filter((item) => !item.hidden);
}

/**
 * @param {boolean} open
 * @param {{focus?: "first" | "last" | "toggle" | "none"}} [options] where focus goes
 * @returns {void}
 */
function setMenuOpen(open, { focus = "none" } = {}) {
  el("header-menu").hidden = !open;
  el("header-menu-toggle").setAttribute("aria-expanded", String(open));
  const items = menuItems();
  if (focus === "first") items[0]?.focus();
  if (focus === "last") items[items.length - 1]?.focus();
  if (focus === "toggle") el("header-menu-toggle").focus();
}

/**
 * Moves focus to the item `step` places from the focused one, wrapping.
 *
 * @param {number} step
 * @returns {void}
 */
function moveFocus(step) {
  const items = menuItems();
  if (!items.length) return;
  const current = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  items[(current + step + items.length) % items.length].focus();
}

/**
 * Wires the overflow menu: the kebab button opens it, arrow keys move
 * through it, and Escape, Tab, a pick or a click outside close it.
 *
 * @returns {void}
 */
export function initHeaderMenu() {
  const toggle = el("header-menu-toggle");
  const menu = el("header-menu");

  toggle.addEventListener("click", () => {
    setMenuOpen(menu.hidden, { focus: menu.hidden ? "first" : "none" });
  });
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMenuOpen(true, { focus: event.key === "ArrowDown" ? "first" : "last" });
    }
  });

  menu.addEventListener("keydown", (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[/** @type {"ArrowDown" | "ArrowUp"} */ (event.key)]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = menuItems();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false, { focus: "toggle" });
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  });

  // Capture phase: the menu closes, and focus returns to its button, before
  // the item's own handler runs. Focus is never left on a hidden item, and a
  // dialog an item opens later hands focus back to the button.
  menu.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest("[role^='menuitem']")) {
        setMenuOpen(false, { focus: "toggle" });
      }
    },
    true,
  );

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (event.target instanceof Node && (menu.contains(event.target) || toggle.contains(event.target))) return;
    setMenuOpen(false);
  });
}

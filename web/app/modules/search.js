import { DRAFT_CATEGORIES } from "../../shared/scenario-name.ts";
import { groupedResults as groupedResultsFor, matchScore } from "../../shared/search.ts";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./config.ts";
import { closestTo, el, escapeHtml } from "./dom.js";
import { blanksAllowed, pickBlank, selectPending } from "./picker.js";
import { state } from "./state.ts";

export { matchScore };

/**
 * Every matching entry, grouped by book and category, each group's items
 * sorted best-match first.
 *
 * @param {string} query
 * @returns {import("../../shared/search.ts").ResultGroup[]}
 */
export function groupedResults(query) {
  return groupedResultsFor(state.entries, query, CATEGORY_ORDER);
}

/**
 * The empty state: nothing matched, so offer a blank template instead of a
 * dead end. Edit mode opens an existing scenario only, so it offers none.
 *
 * @returns {string} HTML
 */
function noMatchHtml() {
  const message = '<div class="combobox-empty">No scenario matches.</div>';
  if (!blanksAllowed()) return message;
  const buttons = DRAFT_CATEGORIES.map(
    (category) =>
      `<button type="button" class="combobox-blank" data-blank="${category}">Start a blank ${escapeHtml(CATEGORY_LABELS[category])} scenario</button>`,
  ).join("");
  return `${message}<div class="combobox-blanks">${buttons}</div>`;
}

/** Index of the keyboard-highlighted row, or -1 for none. */
let activeItem = -1;

/** Redraws the dropdown from the search box's current value. @returns {void} */
export function renderResults() {
  const groups = groupedResults(el("search").value);
  const list = el("search-results");
  if (!groups.length) {
    list.innerHTML = noMatchHtml();
  } else {
    list.innerHTML = groups
      .map(
        (group) => `
      <div class="combobox-group-label">${group.book === "mission" ? "Mission Book" : "Draft Book"}: ${escapeHtml(group.category)}</div>
      ${group.items
        .map(
          ({ entry }) =>
            `<button type="button" class="combobox-item" data-path="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</button>`,
        )
        .join("")}
    `,
      )
      .join("");
  }
  list.hidden = false;
  activeItem = -1;
}

/**
 * Moves the keyboard highlight, wrapping at both ends.
 *
 * @param {number} delta rows to move by; negative moves up
 * @returns {void}
 */
export function moveActive(delta) {
  const items = [...el("search-results").querySelectorAll(".combobox-item")];
  if (!items.length) return;
  items.forEach((item) => item.classList.remove("active"));
  activeItem = (activeItem + delta + items.length) % items.length;
  items[activeItem].classList.add("active");
  items[activeItem].scrollIntoView({ block: "nearest" });
}

/** Wires the search box and its dropdown. @returns {void} */
export function initSearch() {
  el("search").addEventListener("focus", renderResults);
  el("search").addEventListener("input", renderResults);
  el("search").addEventListener("keydown", (event) => {
    const items = () => /** @type {HTMLElement[]} */ ([...el("search-results").querySelectorAll(".combobox-item")]);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Escape") {
      el("search-results").hidden = true;
    } else if (event.key === "Enter") {
      event.preventDefault();
      const list = items();
      const target = activeItem >= 0 ? list[activeItem] : list[0];
      if (target?.dataset.path) selectPending(target.dataset.path, target.textContent ?? "");
    }
  });
  el("search-results").addEventListener("mousedown", (event) => {
    // mousedown, not click: fires before the input's blur hides the list.
    const button = closestTo(event, "[data-path]");
    const path = button ? button.dataset.path : null;
    if (button && path) selectPending(path, button.textContent ?? "");
  });
  // click, not mousedown: a blank-template button is also reached with Tab and
  // pressed with Enter or Space, which fire click only.
  el("search-results").addEventListener("click", (event) => {
    const category = closestTo(event, "[data-blank]")?.dataset.blank;
    if (category) pickBlank(category);
  });
  document.addEventListener("click", (event) => {
    if (!closestTo(event, ".combobox")) el("search-results").hidden = true;
  });
}

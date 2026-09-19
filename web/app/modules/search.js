import { CATEGORY_ORDER } from "./config.js";
import { state } from "./state.js";
import { el, escapeHtml } from "./dom.js";
import { selectPending } from "./picker.js";

/**
 * Substring match ranked by position, else letters found in order (ranked
 * after any substring match).
 *
 * @param {string} query what the contributor typed
 * @param {string} text the candidate title
 * @returns {number | null} lower is a better match; null means no match
 */
export function matchScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return idx;
  let qi = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      if (first === -1) first = i;
      last = i;
      qi += 1;
    }
  }
  if (qi < q.length) return null;
  return 1000 + (last - first);
}

/**
 * @typedef {object} ResultGroup
 * @property {"mission" | "draft"} book
 * @property {string} category
 * @property {{entry: ScenarioEntry, score: number}[]} items
 */

/**
 * Every matching entry, grouped by book and category, each group's items
 * sorted best-match first.
 *
 * @param {string} query
 * @returns {ResultGroup[]}
 */
export function groupedResults(query) {
  /** @type {Map<string, ResultGroup>} "book|category" -> group */
  const groups = new Map();
  for (const entry of state.entries) {
    const score = matchScore(query, entry.title);
    if (score === null) continue;
    const key = `${entry.book}|${entry.category}`;
    let group = groups.get(key);
    if (!group) {
      group = { book: entry.book, category: entry.category, items: [] };
      groups.set(key, group);
    }
    group.items.push({ entry, score });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.book !== b.book) return a.book === "mission" ? -1 : 1;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

/** Index of the keyboard-highlighted row, or -1 for none. */
let activeItem = -1;

/** Redraws the dropdown from the search box's current value. @returns {void} */
export function renderResults() {
  const groups = groupedResults(el("search").value);
  const list = el("search-results");
  if (!groups.length) {
    list.innerHTML = '<div class="combobox-empty">No scenario matches.</div>';
  } else {
    list.innerHTML = groups.map((group) => `
      <div class="combobox-group-label">${group.book === "mission" ? "Mission Book" : "Draft Book"} — ${escapeHtml(group.category)}</div>
      ${group.items.map(({ entry }) =>
        `<button type="button" class="combobox-item" data-path="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</button>`
      ).join("")}
    `).join("");
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
    if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
    else if (event.key === "Escape") { el("search-results").hidden = true; }
    else if (event.key === "Enter") {
      event.preventDefault();
      const list = items();
      const target = activeItem >= 0 ? list[activeItem] : list[0];
      if (target && target.dataset.path) selectPending(target.dataset.path, target.textContent ?? "");
    }
  });
  el("search-results").addEventListener("mousedown", (event) => {
    // mousedown, not click: fires before the input's blur hides the list.
    const button = /** @type {HTMLElement} */ (event.target).closest("[data-path]");
    const path = button instanceof HTMLElement ? button.dataset.path : null;
    if (button && path) selectPending(path, button.textContent ?? "");
  });
  document.addEventListener("click", (event) => {
    if (!(/** @type {HTMLElement} */ (event.target).closest(".combobox"))) el("search-results").hidden = true;
  });
}

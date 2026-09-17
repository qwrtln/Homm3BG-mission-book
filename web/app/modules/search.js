import { CATEGORY_ORDER } from "./config.js";
import { state } from "./state.js";
import { el, escapeHtml } from "./dom.js";
import { selectPending } from "./picker.js";

// Substring match ranked by position, else letters found in order (ranked after any substring match).
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

export function groupedResults(query) {
  const groups = new Map(); // "book|category" -> {book, category, items: [{entry, score}]}
  for (const entry of state.entries) {
    const score = matchScore(query, entry.title);
    if (score === null) continue;
    const key = `${entry.book}|${entry.category}`;
    if (!groups.has(key)) groups.set(key, { book: entry.book, category: entry.category, items: [] });
    groups.get(key).items.push({ entry, score });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.book !== b.book) return a.book === "mission" ? -1 : 1;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

let activeItem = -1;

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

export function moveActive(delta) {
  const items = [...el("search-results").querySelectorAll(".combobox-item")];
  if (!items.length) return;
  items.forEach((item) => item.classList.remove("active"));
  activeItem = (activeItem + delta + items.length) % items.length;
  items[activeItem].classList.add("active");
  items[activeItem].scrollIntoView({ block: "nearest" });
}

export function initSearch() {
  el("search").addEventListener("focus", renderResults);
  el("search").addEventListener("input", renderResults);
  el("search").addEventListener("keydown", (event) => {
    const items = () => [...el("search-results").querySelectorAll(".combobox-item")];
    if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
    else if (event.key === "Escape") { el("search-results").hidden = true; }
    else if (event.key === "Enter") {
      event.preventDefault();
      const list = items();
      const target = activeItem >= 0 ? list[activeItem] : list[0];
      if (target) selectPending(target.dataset.path, target.textContent);
    }
  });
  el("search-results").addEventListener("mousedown", (event) => {
    // mousedown, not click: fires before the input's blur hides the list.
    const button = event.target.closest("[data-path]");
    if (button) selectPending(button.dataset.path, button.textContent);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".combobox")) el("search-results").hidden = true;
  });
}

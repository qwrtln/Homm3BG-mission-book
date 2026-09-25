import { completionContext, imageCompletions } from "../../shared/image-completion.js";
import { closestTo, el, escapeHtml } from "./dom.js";
import { requireEditor, state } from "./state.js";

// Suggests uploaded image paths while the cursor is inside an image argument
// of the .tex editor, the way an IDE offers completions: it opens a moment
// after the contributor types, deletes or pastes there (or at once on
// Ctrl-Space), narrows at once as they edit on, and takes arrows, Page
// Up/Down, Enter or Tab, Escape, or a click.

const OPTION_ID = "image-autocomplete-option";
// Pause before an edit opens the list, so fast typing does not flash it.
const OPEN_DELAY_MS = 100;
// Edits that open the list: typing, deleting, pasting. Undo, redo and
// setValue do not.
const OPENING_ORIGINS = new Set(["+input", "+delete", "paste"]);
// Rows Page Up/Down jump: the list's visible height in rows.
const PAGE_ROWS = 8;

/**
 * The open list: the suggestions, which one is highlighted, and the text
 * range a pick replaces.
 *
 * @typedef {object} OpenList
 * @property {number} line
 * @property {import("../../shared/image-completion.js").CompletionContext} context
 * @property {string[]} items
 * @property {number} active
 */

/** @type {OpenList | null} */
let open = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let openTimer = null;

/** @returns {void} */
function cancelPendingOpen() {
  if (openTimer !== null) clearTimeout(openTimer);
  openTimer = null;
}

/** Bound only while the list is open, so the keys keep their usual meaning otherwise. @type {CodeMirrorKeyMap} */
const listKeys = {
  Up: (cm) => move(cm, -1),
  Down: (cm) => move(cm, 1),
  PageUp: (cm) => move(cm, -PAGE_ROWS),
  PageDown: (cm) => move(cm, PAGE_ROWS),
  Enter: (cm) => pick(cm),
  Tab: (cm) => pick(cm),
  Esc: (cm) => closeList(cm),
};

/**
 * Opens, updates or closes the list for where the cursor now is. The
 * highlighted suggestion stays highlighted while it is still offered.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function refreshList(cm) {
  cancelPendingOpen();
  const cursor = cm.getCursor();
  const context = cm.somethingSelected() ? null : completionContext(cm.getLine(cursor.line), cursor.ch);
  const items = context ? imageCompletions(state.uploadedFiles.keys(), context) : [];
  if (!context || !items.length) {
    closeList(cm);
    return;
  }
  const kept = open ? items.indexOf(open.items[open.active]) : -1;
  if (!open) cm.addKeyMap(listKeys);
  open = { line: cursor.line, context, items, active: Math.max(0, kept) };
  renderList(cm);
}

/**
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function closeList(cm) {
  cancelPendingOpen();
  if (!open) return;
  open = null;
  cm.removeKeyMap(listKeys);
  const list = el("image-autocomplete");
  list.hidden = true;
  list.innerHTML = "";
  cm.getInputField().removeAttribute("aria-activedescendant");
}

/**
 * A suggestion with the typed text marked in it.
 *
 * @param {string} item
 * @param {string} typed
 * @returns {string} markup
 */
function itemHtml(item, typed) {
  const at = typed ? item.toLowerCase().indexOf(typed.toLowerCase()) : -1;
  if (at < 0) return escapeHtml(item);
  const end = at + typed.length;
  return `${escapeHtml(item.slice(0, at))}<mark>${escapeHtml(item.slice(at, end))}</mark>${escapeHtml(item.slice(end))}`;
}

/**
 * Draws the list under the start of the argument, or above it when there is
 * no room below.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function renderList(cm) {
  if (!open) return;
  const { line, context, items, active } = open;
  const list = el("image-autocomplete");
  list.innerHTML = items
    .map(
      (item, i) =>
        `<li id="${OPTION_ID}-${i}" class="autocomplete-item" role="option" data-index="${i}" aria-selected="${i === active}">${itemHtml(item, context.typed)}</li>`,
    )
    .join("");
  list.hidden = false;
  positionList(cm, line, context.from);
  highlight(cm);
}

/**
 * @param {CodeMirrorEditor} cm
 * @param {number} line
 * @param {number} ch
 * @returns {void}
 */
function positionList(cm, line, ch) {
  const list = el("image-autocomplete");
  const coords = cm.cursorCoords({ line, ch }, "window");
  const { width, height } = list.getBoundingClientRect();
  const below = coords.bottom + height <= window.innerHeight || coords.top < height;
  list.style.top = `${below ? coords.bottom + 2 : coords.top - height - 2}px`;
  list.style.left = `${Math.max(0, Math.min(coords.left, window.innerWidth - width - 4))}px`;
}

/**
 * Marks the active suggestion for sight and for screen readers, and scrolls
 * it into view.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function highlight(cm) {
  if (!open) return;
  const list = el("image-autocomplete");
  const active = String(open.active);
  for (const option of list.querySelectorAll(".autocomplete-item")) {
    const on = option instanceof HTMLElement && option.dataset.index === active;
    option.classList.toggle("active", on);
    option.setAttribute("aria-selected", String(on));
    if (on) option.scrollIntoView({ block: "nearest" });
  }
  cm.getInputField().setAttribute("aria-activedescendant", `${OPTION_ID}-${active}`);
}

/**
 * Moves the highlight. One step wraps around the ends, as in a browser's
 * own suggestion list; a page stops at them.
 *
 * @param {CodeMirrorEditor} cm
 * @param {number} delta
 * @returns {void}
 */
function move(cm, delta) {
  if (!open) return;
  const count = open.items.length;
  const next = open.active + delta;
  open.active = Math.abs(delta) === 1 ? (next + count) % count : Math.max(0, Math.min(count - 1, next));
  highlight(cm);
}

/**
 * Writes a suggestion over the argument's path and closes the list.
 *
 * @param {CodeMirrorEditor} cm
 * @param {number} [index] defaults to the highlighted suggestion
 * @returns {void}
 */
function pick(cm, index) {
  if (!open) return;
  const { line, context, items, active } = open;
  closeList(cm);
  cm.replaceRange(items[index ?? active], { line, ch: context.from }, { line, ch: context.to });
  cm.focus();
}

/**
 * Wires the suggestion list to the editor.
 *
 * @returns {void}
 */
export function initImageAutocomplete() {
  const cm = requireEditor();
  const input = cm.getInputField();
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "image-autocomplete");

  cm.addKeyMap({ "Ctrl-Space": () => refreshList(cm) });
  cm.on("change", (_cm, change) => {
    if (!OPENING_ORIGINS.has(change.origin ?? "")) return;
    if (open) refreshList(cm);
    else {
      cancelPendingOpen();
      openTimer = setTimeout(() => refreshList(cm), OPEN_DELAY_MS);
    }
  });
  cm.on("cursorActivity", () => {
    if (open) refreshList(cm);
  });
  cm.on("scroll", () => {
    if (open) positionList(cm, open.line, open.context.from);
  });
  cm.on("blur", () => closeList(cm));
  window.addEventListener("resize", () => closeList(cm));

  const list = el("image-autocomplete");
  // Keeps the editor focused, so a click does not blur it and close the list first.
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("mousemove", (event) => {
    const option = closestTo(event, ".autocomplete-item");
    if (!open || !option || Number(option.dataset.index) === open.active) return;
    open.active = Number(option.dataset.index);
    highlight(cm);
  });
  list.addEventListener("click", (event) => {
    const option = closestTo(event, ".autocomplete-item");
    if (option) pick(cm, Number(option.dataset.index));
  });
}

import { GLYPH_MANIFEST_PATH } from "../../shared/build-plan.js";
import {
  GLYPH_USAGE_PATH,
  glyphCompletions,
  glyphContext,
  missingBrace,
  parseGlyphManifest,
  parseGlyphUsage,
} from "../../shared/glyph-completion.js";
import { completionContext, imageCompletions } from "../../shared/image-completion.js";
import { REPO } from "./config.js";
import { closestTo, el, escapeHtml } from "./dom.js";
import { requireEditor, state } from "./state.js";

// Suggests what the cursor's argument in the .tex editor can hold, the way an
// IDE offers completions: uploaded image paths inside an image argument, and
// glyph names, with their pictures, right after \svg or inside \svg{...}. The
// list opens a moment after the contributor types, deletes or pastes there
// (or at once on Ctrl-Space), narrows at once as they edit on, and takes
// arrows, Page Up/Down, Enter or Tab, Escape, or a click.

const OPTION_ID = "editor-autocomplete-option";
// Pause before an edit opens the list, so fast typing does not flash it.
const OPEN_DELAY_MS = 100;
// Edits that open the list: typing, deleting, pasting. Undo, redo and
// setValue do not.
const OPENING_ORIGINS = new Set(["+input", "+delete", "paste"]);
// Rows Page Up/Down jump: the list's visible height in rows.
const PAGE_ROWS = 8;

/**
 * One suggestion: what the list shows and what a pick writes.
 *
 * @typedef {object} Suggestion
 * @property {string} label
 * @property {number[]} marked indices of the label's characters to mark
 * @property {string} insert written over the context's range
 * @property {string | null} icon picture URL, or null for none
 * @property {string | null} darkIcon picture URL for the dark theme, or null
 *   to draw `icon` there too
 */

/**
 * What the list offers at the cursor, and the text range a pick replaces.
 *
 * @typedef {object} Offer
 * @property {string} name the list's accessible name
 * @property {number} from
 * @property {number} to
 * @property {Suggestion[]} items
 */

/**
 * The open list: the offer, its line, and which suggestion is highlighted.
 *
 * @typedef {object} OpenList
 * @property {number} line
 * @property {Offer} offer
 * @property {number} active
 */

/** @type {OpenList | null} */
let open = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let openTimer = null;

/**
 * The glyph names and their use counts, fetched on the first \svg the
 * contributor types. Null until then.
 *
 * @typedef {{manifest: string[], usage: Record<string, number>}} GlyphCatalog
 */

/** @type {GlyphCatalog | null} */
let glyphs = null;
/** @type {Promise<void> | null} */
let glyphsLoading = null;

/**
 * Fetches the glyph catalog once, then refreshes the list for where the
 * cursor is by then. Missing use counts leave every count at zero; a missing
 * manifest leaves glyph names unoffered.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function loadGlyphs(cm) {
  if (glyphsLoading) return;
  /** @param {string} path @returns {Promise<unknown>} */
  const fetchJson = async (path) => {
    const response = await fetch(`${REPO}/${path}`);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  };
  glyphsLoading = Promise.all([
    fetchJson(GLYPH_MANIFEST_PATH).then(parseGlyphManifest),
    fetchJson(GLYPH_USAGE_PATH)
      .then(parseGlyphUsage)
      .catch(() => ({})),
  ])
    .then(([manifest, usage]) => {
      glyphs = { manifest, usage };
      if (cm.hasFocus()) refreshList(cm);
    })
    .catch((error) => console.warn("Glyph names are not available:", error));
}

/**
 * The offer for the cursor, or null when there is nothing to offer.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {Offer | null}
 */
function offerAt(cm) {
  if (cm.somethingSelected()) return null;
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);

  const glyph = glyphContext(line, cursor.ch);
  if (glyph) {
    if (!glyphs) {
      loadGlyphs(cm);
      return null;
    }
    /** @param {string} name @returns {string} */
    const glyphUrl = (name) => `${REPO}/assets/glyphs/${encodeURIComponent(name)}.svg`;
    const items = glyphCompletions(glyphs.manifest, glyphs.usage, glyph.typed).map(({ name, indices, dark }) => ({
      label: name,
      marked: indices,
      insert: `${glyph.open}${name}${glyph.close}`,
      icon: glyphUrl(name),
      darkIcon: dark ? glyphUrl(dark) : null,
    }));
    return { name: "Glyphs", from: glyph.from, to: glyph.to, items };
  }

  const image = completionContext(line, cursor.ch);
  if (image) {
    const typed = image.typed.toLowerCase();
    const items = imageCompletions(state.uploadedFiles.keys(), image).map((path) => {
      const at = typed ? path.toLowerCase().indexOf(typed) : -1;
      return {
        label: path,
        marked: at < 0 ? [] : Array.from(typed, (_, i) => at + i),
        insert: path,
        icon: null,
        darkIcon: null,
      };
    });
    return { name: "Uploaded images", from: image.from, to: image.to, items };
  }
  return null;
}

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
  const offer = offerAt(cm);
  if (!offer?.items.length) {
    closeList(cm);
    return;
  }
  const activeLabel = open?.offer.items[open.active]?.label;
  const kept = offer.items.findIndex((item) => item.label === activeLabel);
  if (!open) cm.addKeyMap(listKeys);
  open = { line: cm.getCursor().line, offer, active: Math.max(0, kept) };
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
  const list = el("editor-autocomplete");
  list.hidden = true;
  list.innerHTML = "";
  cm.getInputField().removeAttribute("aria-activedescendant");
}

/**
 * A suggestion's label with its matched characters marked.
 *
 * @param {Suggestion} item
 * @returns {string} markup
 */
function labelHtml(item) {
  const marked = new Set(item.marked);
  return Array.from(item.label, (char, i) =>
    marked.has(i) ? `<mark>${escapeHtml(char)}</mark>` : escapeHtml(char),
  ).join("");
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
  const { line, offer, active } = open;
  const list = el("editor-autocomplete");
  list.setAttribute("aria-label", offer.name);
  list.innerHTML = offer.items
    .map((item, i) => {
      // Both pictures, when there are two: the stylesheet shows the theme's one.
      const icon = [
        item.icon && `<img class="autocomplete-icon" src="${item.icon}" alt="" loading="lazy">`,
        item.darkIcon && `<img class="autocomplete-icon dark" src="${item.darkIcon}" alt="" loading="lazy">`,
      ].join("");
      return `<li id="${OPTION_ID}-${i}" class="autocomplete-item" role="option" data-index="${i}" aria-selected="${i === active}">${icon}<span>${labelHtml(item)}</span></li>`;
    })
    .join("");
  list.hidden = false;
  positionList(cm, line, offer.from);
  highlight(cm);
}

/**
 * @param {CodeMirrorEditor} cm
 * @param {number} line
 * @param {number} ch
 * @returns {void}
 */
function positionList(cm, line, ch) {
  const list = el("editor-autocomplete");
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
  const list = el("editor-autocomplete");
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
  const count = open.offer.items.length;
  const next = open.active + delta;
  open.active = Math.abs(delta) === 1 ? (next + count) % count : Math.max(0, Math.min(count - 1, next));
  highlight(cm);
}

/**
 * Writes a suggestion over the argument's text and closes the list.
 *
 * @param {CodeMirrorEditor} cm
 * @param {number} [index] defaults to the highlighted suggestion
 * @returns {void}
 */
function pick(cm, index) {
  if (!open) return;
  const { line, offer, active } = open;
  closeList(cm);
  cm.replaceRange(offer.items[index ?? active].insert, { line, ch: offer.from }, { line, ch: offer.to });
  cm.focus();
}

/**
 * Writes the braces around a name character typed straight after `\svg`,
 * so the list goes on narrowing as the contributor types the name. Its own
 * edit, with its own origin, so one Ctrl-Z takes the braces back out.
 *
 * @param {CodeMirrorEditor} cm
 * @returns {void}
 */
function addMissingBrace(cm) {
  if (cm.somethingSelected()) return;
  const { line, ch } = cm.getCursor();
  const brace = missingBrace(cm.getLine(line), ch);
  if (!brace) return;
  cm.replaceRange(brace.text, { line, ch: brace.from }, { line, ch: brace.to }, "+brace");
  cm.setCursor({ line, ch: brace.cursor });
}

/**
 * Wires the suggestion list to the editor.
 *
 * @returns {void}
 */
export function initAutocomplete() {
  const cm = requireEditor();
  const input = cm.getInputField();
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "editor-autocomplete");

  cm.addKeyMap({ "Ctrl-Space": () => refreshList(cm) });
  cm.on("change", (_cm, change) => {
    if (!OPENING_ORIGINS.has(change.origin ?? "")) return;
    // After this edit's operation, so the braces are their own undo step.
    if (change.origin === "+input") queueMicrotask(() => addMissingBrace(cm));
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
    if (open) positionList(cm, open.line, open.offer.from);
  });
  cm.on("blur", () => closeList(cm));
  window.addEventListener("resize", () => closeList(cm));

  const list = el("editor-autocomplete");
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

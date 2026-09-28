import { categoryOfPath, DRAFT_CATEGORIES, withCategory, withScenarioKind } from "../../shared/scenario-name.js";
import { CATEGORY_LABELS } from "./config.js";
import { el } from "./dom.js";
import { deleteDraft, loadDraft, saveDraft } from "./drafts.js";
import { githubSaveState, onSaveStateReset } from "./github-save-state.js";
import { reflectRoute } from "./route.js";
import { requireEditor, state } from "./state.js";

const LOCKED_TITLE = "The category is fixed once the scenario is saved to GitHub.";
const OPEN_TITLE = "The category this scenario is filed under in the Draft Scenarios.";

/**
 * Whether the open scenario's category can still change: only a draft path
 * that has never reached GitHub. Once a branch carries it, the branch's file
 * path and \input line name the category.
 *
 * @returns {boolean}
 */
function categoryLocked() {
  if (githubSaveState.lastSaveTarget !== null || githubSaveState.edit !== null) return true;
  const path = state.chosenPath;
  if (path === null) return true;
  return !path.startsWith("draft-scenarios/") || categoryOfPath(path) === null;
}

/**
 * Shows the open scenario's category in the header, and locks it when the
 * scenario is already on GitHub or is not a draft. Call it after every
 * change to state.chosenPath or githubSaveState.
 *
 * @returns {void}
 */
export function syncCategoryControl() {
  const select = el("scenario-category");
  select.value = (state.chosenPath && categoryOfPath(state.chosenPath)) ?? "";
  select.disabled = categoryLocked();
  select.title = select.disabled ? LOCKED_TITLE : OPEN_TITLE;
  el("category-note").hidden = true;
}

/**
 * Replaces only the part of the editor's text that differs, so the cursor
 * and scroll position outside it stay where they were.
 *
 * @param {CodeMirrorEditor} cm
 * @param {string} before the editor's current text
 * @param {string} after the text it should hold
 * @returns {void}
 */
function replaceChangedPart(cm, before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  cm.replaceRange(after.slice(start, endAfter), cm.posFromIndex(start), cm.posFromIndex(endBefore), "+category");
}

/**
 * Files the open scenario under another category. Before its first save it
 * lives only in this browser, so moving it is moving its autosave and its
 * address; the branch, the commit and the \input line all follow the path at
 * save time. A standard heading kind follows the category too, as a real
 * edit: it counts as unsaved like any typed change.
 *
 * @param {string} category one of DRAFT_CATEGORIES
 * @returns {void}
 */
function moveToCategory(category) {
  const old = state.chosenPath;
  if (!old || categoryLocked() || categoryOfPath(old) === category) {
    syncCategoryControl();
    return;
  }
  // Flushed first: a pending autosave must not land under the old key later.
  const cm = requireEditor();
  clearTimeout(state.saveTimer ?? undefined);
  saveDraft(old, cm.getValue());
  const next = withCategory(old, category);
  if (loadDraft(next) !== null) {
    syncCategoryControl(); // reverts the select, then the note says why
    const note = el("category-note");
    note.textContent = `You already have a local draft with this name under ${CATEGORY_LABELS[category]}. Rename it or open that draft instead.`;
    note.title = note.textContent;
    note.hidden = false;
    return;
  }

  const text = cm.getValue();
  const moved = withScenarioKind(text, category);
  // Written under the new key before the old one goes, so no step loses it.
  saveDraft(next, moved);
  deleteDraft(old);
  state.chosenPath = next;
  if (moved !== text) replaceChangedPart(cm, text, moved);
  syncCategoryControl();
  reflectRoute();
}

/**
 * Fills the header's category select and wires it.
 *
 * @returns {void}
 */
export function initCategory() {
  const select = el("scenario-category");
  select.replaceChildren(
    ...DRAFT_CATEGORIES.map((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = CATEGORY_LABELS[category];
      return option;
    }),
  );
  select.addEventListener("change", () => moveToCategory(select.value));
  onSaveStateReset(syncCategoryControl);
}

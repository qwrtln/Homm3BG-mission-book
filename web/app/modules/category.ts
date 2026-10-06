import { categoryOfPath, withCategory, withScenarioKind } from "../../shared/scenario-name.ts";
import { type StoreState, store } from "../store.ts";
import { CATEGORY_LABELS } from "./config.ts";
import { deleteDraft, loadDraft, saveDraft } from "./drafts.ts";
import { type EditorApi, requireEditor } from "./editor-api.ts";
import { moveRecord, saveText } from "./local-store.ts";
import { reflectRoute } from "./route.ts";

export const LOCKED_TITLE = "The category is fixed once the scenario is saved to GitHub.";
export const OPEN_TITLE = "The category this scenario is filed under in the Draft Scenarios.";

/**
 * Whether the open scenario's category can still change: only a draft path
 * that has never reached GitHub. Once a branch carries it, the branch's file
 * path and \input line name the category.
 */
export function categoryLocked(
  current: Pick<StoreState, "saving" | "lastSaveTarget" | "edit" | "chosenPath" | "categoryHold">,
): boolean {
  if (current.categoryHold || current.saving || current.lastSaveTarget !== null || current.edit !== null) return true;
  const path = current.chosenPath;
  if (path === null) return true;
  return !path.startsWith("draft-scenarios/") || categoryOfPath(path) === null;
}

/**
 * Lets the header's category control follow the open scenario: it ends the
 * hold a new scenario starts with and clears the last refusal's note. The
 * select itself renders from store.getState().chosenPath and the save fields. Call it
 * after every change to store.getState().chosenPath or the save fields.
 */
export function syncCategoryControl(): void {
  const { categoryHold, categoryNote } = store.getState();
  if (categoryHold || categoryNote !== null) store.setState({ categoryHold: false, categoryNote: null });
}

/**
 * Replaces only the part of the editor's text that differs, so the cursor
 * and scroll position outside it stay where they were.
 *
 * @param before the editor's current text
 * @param after the text it should hold
 */
function replaceChangedPart(editor: EditorApi, before: string, after: string): void {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  editor.replaceRange(start, endBefore, after.slice(start, endAfter));
}

/** Leaves the scenario where it is, and says why the move did not happen. */
function refuseMove(message: string): void {
  syncCategoryControl(); // the select stays on the old category, then the note says why
  store.setState({ categoryNote: message });
}

/**
 * Files the open scenario under another category. Before its first save it
 * lives only in this browser, so moving it is moving its autosave and its
 * address; the branch, the commit and the \input line all follow the path at
 * save time. A standard heading kind follows the category too, as a real
 * edit: it counts as unsaved like any typed change.
 *
 * @param category one of DRAFT_CATEGORIES
 */
export function moveToCategory(category: string): void {
  const old = store.getState().chosenPath;
  if (!old || categoryLocked(store.getState()) || categoryOfPath(old) === category) {
    syncCategoryControl();
    return;
  }
  // Flushed first: a pending autosave must not land under the old key later.
  const editor = requireEditor();
  clearTimeout(store.getState().saveTimer ?? undefined);
  saveDraft(old, editor.getText());
  const next = withCategory(old, category);
  if (loadDraft(next) !== null) {
    refuseMove(
      `You already have a local draft with this name under ${CATEGORY_LABELS[category]}. Rename it or open that draft instead.`,
    );
    return;
  }

  const text = editor.getText();
  const moved = withScenarioKind(text, category);
  // Written under the new key before the old one goes, so no step loses it.
  saveDraft(next, moved);
  // saveDraft swallows a full storage: the old copy goes only once the new one
  // is really there. With storage blocked outright neither key holds anything,
  // and the move goes ahead as a change of address alone.
  if (loadDraft(old) !== null && loadDraft(next) !== moved) {
    deleteDraft(next);
    refuseMove("Could not move the scenario: this browser's storage is full.");
    return;
  }
  deleteDraft(old);
  // Best effort, not awaited: the IndexedDB copy is a second line of
  // defense, not the source of truth the move's own checks run against.
  void moveRecord(old, next).then(() => saveText(next, moved));
  store.setState({ chosenPath: next });
  if (moved !== text) replaceChangedPart(editor, text, moved);
  syncCategoryControl();
  reflectRoute();
}

/** Wires the category control: a change to where the scenario is saved ends the hold and clears the note. */
export function initCategory(): void {
  store.subscribe((current, previous) => {
    if (
      current.lastSaveTarget !== previous.lastSaveTarget ||
      current.edit !== previous.edit ||
      current.committedUploads !== previous.committedUploads ||
      current.saving !== previous.saving
    ) {
      syncCategoryControl();
    }
  });
}

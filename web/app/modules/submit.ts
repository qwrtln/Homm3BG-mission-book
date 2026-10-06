// The "Before you open a pull request" dialog: what still stands between the
// scenario and a pull request, and the contributor's checklist. The rules
// themselves live in shared/submit-checklist.ts and the dialog is
// components/workspace/SubmitDialog.tsx; this module asks it and waits for the answer.

import { type Blocker, type ChecklistItem, submitBlockers } from "../../shared/submit-checklist.ts";
import { builtFingerprint } from "../pdf/view.ts";
import { store } from "../store.ts";
import { isDirty } from "./dirty.ts";

/** What each unmet condition says in the dialog. */
export const BLOCKER_TEXT: Record<Blocker, string> = {
  unsaved: "Save your changes",
  unbuilt: "Build the PDF from your saved text",
  building: "Wait for the build to finish",
};

/**
 * What keeps the open scenario from being submitted right now, read fresh
 * from the app's state every time.
 */
export function currentSubmitBlockers(): Blocker[] {
  return submitBlockers({
    dirty: isDirty(),
    building: store.getState().building,
    clean: store.getState().clean,
    built: builtFingerprint(),
  });
}

/**
 * Shows the dialog and waits for the answer. Every opening starts with every
 * box unticked; the ticks are never kept. A second question while one is open
 * answers the first with Cancel.
 *
 * @param options checklist: show the boxes, and require every one ticked
 * @returns the ticked items (empty without a checklist) on confirm; null on Cancel or Escape
 */
export function askToSubmit({ checklist }: { checklist: boolean }): Promise<ChecklistItem[] | null> {
  store.getState().submit?.resolve(null);
  return new Promise((resolve) => {
    store.setState({ submit: { checklist, resolve } });
  });
}

/** Answers the open dialog and removes it. */
export function answerSubmit(ticked: ChecklistItem[] | null): void {
  const { submit } = store.getState();
  if (submit === null) return;
  store.setState({ submit: null });
  submit.resolve(ticked);
}

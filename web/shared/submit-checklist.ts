// The pre-submit checklist and the rules for when a pull request may be opened.
// Kept free of the DOM so the dialog, the submit handler and the pull request
// body all read one definition, and the rules can be tested on their own.

import type { Baseline } from "./unsaved.ts";

export interface ChecklistItem {
  /** stable key for the checkbox */
  id: string;
  /** short bold heading */
  label: string;
  /** plain text; `*word*` marks emphasis, kept as Markdown in the body */
  text: string;
}

/** Why a pull request cannot be opened yet. */
export type Blocker = "unsaved" | "unbuilt" | "building";

export const CHECKLIST_ITEMS: readonly ChecklistItem[] = Object.freeze([
  Object.freeze({
    id: "playtested",
    label: "Playtested",
    text: "I have played this scenario at least once, with the Player Count it lists.",
  }),
  Object.freeze({
    id: "proofread",
    label: "Proofread",
    text: "I have proofread all the text: flavor text, setup, rules and victory conditions.",
  }),
  Object.freeze({
    id: "official-terms",
    label: "Official terms",
    text: "I use official game terms exactly as the rulebooks write them, e.g. *Quick Combat*, not *Quick Fight*.",
  }),
  Object.freeze({
    id: "layout-checked",
    label: "Layout checked",
    text: "I read through the compiled PDF preview. The layout, map and icons look right.",
  }),
]);

const FIXED_BODY_LINE = "Edited in the browser mission book editor.";

/**
 * Which checks stand between the contributor and a new pull request. Project
 * members and outside contributors get the same checks.
 *
 * @returns checklist: the items must be ticked; gates: the scenario must be saved and built
 */
export function submitRequirements({ mode }: { mode: "new" | "edit" }): { checklist: boolean; gates: boolean } {
  if (mode === "edit") return { checklist: false, gates: false };
  return { checklist: true, gates: true };
}

/**
 * What keeps the scenario from being submitted right now.
 *
 * @param state clean: the last saved copy; built: the fingerprint of the last successful build
 * @returns in the order unsaved, unbuilt, building; empty when nothing blocks
 */
export function submitBlockers({
  dirty,
  building,
  clean,
  built,
}: {
  dirty: boolean;
  building: boolean;
  clean: Baseline | null;
  built: { text: string; uploads: string } | null;
}): Blocker[] {
  const blockers: Blocker[] = [];
  if (dirty) blockers.push("unsaved");
  const builtMatchesSaved =
    built !== null &&
    clean !== null &&
    clean.text !== null &&
    built.text === clean.text &&
    built.uploads === clean.uploads;
  if (!builtMatchesSaved) blockers.push("unbuilt");
  if (building) blockers.push("building");
  return blockers;
}

/**
 * The pull request description: the ticked checklist items, then the fixed
 * line naming the editor.
 *
 * @param items the items the contributor ticked
 */
export function pullRequestBody(items: readonly ChecklistItem[]): string {
  if (items.length === 0) return FIXED_BODY_LINE;
  const lines = items.map((item) => `- [x] **${item.label}:** ${item.text}`);
  return ["### Pre-submit checklist", "", ...lines, "", FIXED_BODY_LINE].join("\n");
}

// The pre-submit checklist and the rules for when a pull request may be opened.
// Kept free of the DOM so the dialog, the submit handler and the pull request
// body all read one definition, and the rules can be tested on their own.

/**
 * @typedef {object} ChecklistItem
 * @property {string} id stable key for the checkbox
 * @property {string} label short bold heading
 * @property {string} text plain text; `*word*` marks emphasis, kept as Markdown in the body
 */

/**
 * Why a pull request cannot be opened yet.
 *
 * @typedef {"unsaved" | "unbuilt" | "building"} Blocker
 */

/** @type {readonly ChecklistItem[]} */
export const CHECKLIST_ITEMS = Object.freeze([
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
 * @param {{mode: "new" | "edit"}} context
 * @returns {{checklist: boolean, gates: boolean}} checklist: the items must be ticked; gates: the scenario must be saved and built
 */
export function submitRequirements({ mode }) {
  if (mode === "edit") return { checklist: false, gates: false };
  return { checklist: true, gates: true };
}

/**
 * What keeps the scenario from being submitted right now.
 *
 * @param {{dirty: boolean, building: boolean, clean: import("./unsaved.js").Baseline | null, built: {text: string, uploads: string} | null}} state
 *   clean: the last saved copy; built: the fingerprint of the last successful build
 * @returns {Blocker[]} in the order unsaved, unbuilt, building; empty when nothing blocks
 */
export function submitBlockers({ dirty, building, clean, built }) {
  /** @type {Blocker[]} */
  const blockers = [];
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
 * @param {readonly ChecklistItem[]} items the items the contributor ticked
 * @returns {string}
 */
export function pullRequestBody(items) {
  if (items.length === 0) return FIXED_BODY_LINE;
  const lines = items.map((item) => `- [x] **${item.label}:** ${item.text}`);
  return ["### Pre-submit checklist", "", ...lines, "", FIXED_BODY_LINE].join("\n");
}

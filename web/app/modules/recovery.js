import { assetsSignature, shouldOfferLocalDraft } from "../../shared/unsaved.ts";
import { confirmAction } from "./dom.js";
import { loadDraft } from "./drafts.ts";
import { loadRecord } from "./local-store.ts";

/** @typedef {import("./local-store.js").StagedAsset} StagedAsset */

/**
 * Offers the local copy — text and staged uploads — when it differs from
 * what is about to open. Every open path that loads text from somewhere
 * other than the local draft calls this before putting that text in the
 * editor, so a crash-recovered copy is never silently lost nor silently
 * hidden.
 *
 * @param {string} path the scenario's repository path, the local copy's key
 * @param {string} title shown in the dialog message
 * @param {string} loadedText the text that is about to open, if nothing is kept
 * @param {StagedAsset[]} [loadedAssets] the uploads that come with loadedText; empty for a pristine open
 * @returns {Promise<{text: string, uploads: StagedAsset[]} | null>} the local
 *   copy to open and keep, or null to open loadedText/loadedAssets as-is
 */
export async function offerLocalDraft(path, title, loadedText, loadedAssets = []) {
  const local = await differingLocalCopy(path, loadedText, loadedAssets);
  if (local === null) return null;
  const discard = await confirmAction({
    title: "Discard unsaved edits in this browser?",
    message: `"${title}" has edits in this browser that were never saved to GitHub.`,
    warning: "",
    okLabel: "Discard",
    danger: true,
  });
  return discard ? null : local;
}

/**
 * Offers the local draft a new copy would land on. A copy is keyed by its
 * name and game mode, not by the scenario it copies, so the draft may hold
 * another scenario altogether: the contributor picks which one opens.
 *
 * @param {string} path the new copy's repository path, the local copy's key
 * @param {string} name the typed name, shown in the dialog message
 * @param {string} sourceTitle the picked scenario's title
 * @param {string} loadedText the fresh copy's text
 * @returns {Promise<{text: string, uploads: StagedAsset[]} | null>} the local
 *   copy to open and keep, or null to open loadedText and replace the draft
 */
export async function offerDraftOverCopy(path, name, sourceTitle, loadedText) {
  const local = await differingLocalCopy(path, loadedText, []);
  if (local === null) return null;
  const replace = await confirmAction({
    title: "Replace your draft?",
    message: `This browser already holds a draft named "${name}" in this game mode. Replace it with a fresh copy of ${sourceTitle}, or open the draft as it is?`,
    warning: "Replacing loses the draft's edits.",
    okLabel: "Replace",
    cancelLabel: "Open my draft",
    danger: true,
  });
  return replace ? null : local;
}

/**
 * The local copy under `path`, when it differs from what is about to open.
 *
 * The local text prefers the IndexedDB copy, falling back to the
 * `localStorage` draft when IndexedDB has no opinion (new record, or a
 * browser where it is blocked): the two are kept in sync by every write
 * site, but IndexedDB may lag just after a page that never ran this phase's
 * code left a `localStorage`-only draft behind.
 *
 * @param {string} path
 * @param {string} loadedText
 * @param {StagedAsset[]} loadedAssets
 * @returns {Promise<{text: string, uploads: StagedAsset[]} | null>} null when there is none, or it matches
 */
async function differingLocalCopy(path, loadedText, loadedAssets) {
  const record = await loadRecord(path);
  const localText = record.text ?? loadDraft(path);
  const loaded = { text: loadedText, uploads: assetsSignature(loadedAssets) };
  const local = { text: localText, uploads: record.uploads === null ? null : assetsSignature(record.uploads) };
  if (localText === null || !shouldOfferLocalDraft(loaded, local)) return null;
  return { text: localText, uploads: record.uploads ?? loadedAssets };
}

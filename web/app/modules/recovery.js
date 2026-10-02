import { assetsSignature, shouldOfferLocalDraft } from "../../shared/unsaved.js";
import { confirmAction } from "./dom.js";
import { loadDraft } from "./drafts.js";
import { loadRecord } from "./local-store.js";

/** @typedef {import("./local-store.js").StagedAsset} StagedAsset */

/**
 * Offers the local copy — text and staged uploads — when it differs from
 * what is about to open. Every open path that loads text from somewhere
 * other than the local draft calls this before putting that text in the
 * editor, so a crash-recovered copy is never silently lost nor silently
 * hidden.
 *
 * The local text prefers the IndexedDB copy, falling back to the
 * `localStorage` draft when IndexedDB has no opinion (new record, or a
 * browser where it is blocked): the two are kept in sync by every write
 * site, but IndexedDB may lag just after a page that never ran this phase's
 * code left a `localStorage`-only draft behind.
 *
 * @param {string} path the scenario's repository path, the local copy's key
 * @param {string} title shown in the dialog message
 * @param {string} loadedText the text that is about to open, if nothing is kept
 * @param {StagedAsset[]} [loadedAssets] the uploads that come with loadedText; empty for a pristine open
 * @returns {Promise<{text: string, uploads: StagedAsset[]} | null>} the local
 *   copy to open and keep, or null to open loadedText/loadedAssets as-is
 */
export async function offerLocalDraft(path, title, loadedText, loadedAssets = []) {
  const record = await loadRecord(path);
  const localText = record.text ?? loadDraft(path);
  const loaded = { text: loadedText, uploads: assetsSignature(loadedAssets) };
  const local = { text: localText, uploads: record.uploads === null ? null : assetsSignature(record.uploads) };
  if (localText === null || !shouldOfferLocalDraft(loaded, local)) {
    return null;
  }
  const discard = await confirmAction({
    title: "Discard unsaved edits in this browser?",
    message: `"${title}" has edits in this browser that were never saved to GitHub.`,
    warning: "",
    okLabel: "Discard",
    danger: true,
  });
  return discard ? null : { text: localText, uploads: record.uploads ?? loadedAssets };
}

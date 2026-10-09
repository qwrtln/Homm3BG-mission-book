import { decideOpen, gitBlobSha, type LocalSnapshot } from "../../shared/local-drafts.ts";
import { assetsSignature, shouldOfferLocalDraft } from "../../shared/unsaved.ts";
import { chooseAction, confirmAction } from "./dom.ts";
import { loadDraft } from "./drafts.ts";
import { loadRecord, type StagedAsset, setBaseSha } from "./local-store.ts";

/** How an open goes on, once the local copy is weighed against what was loaded. */
export type LocalOffer =
  | { choice: "loaded" }
  | { choice: "local"; text: string; uploads: StagedAsset[] }
  | { choice: "cancel" };

/**
 * Weighs the local copy — text and staged uploads — against what is about to
 * open, by the baseline the copy was made from. A copy edited on top of the
 * loaded text opens with no question; an untouched stale one is replaced
 * silently; only when both sides changed does the contributor choose. Every
 * open path that loads text from somewhere other than the local draft calls
 * this before showing the workspace, so Cancel leaves the welcome screen as
 * it was.
 *
 * Choosing the local copy from the dialog rebases it on the loaded text, so
 * it reads as unsaved rather than as a conflict afterwards.
 *
 * @param path the scenario's repository path, the local copy's key
 * @param title shown in the dialog message
 * @param loadedText the text that is about to open, if nothing is kept
 * @param loadedSha git blob SHA of the loaded text, as GitHub or the Mission Book holds it
 * @param loadedAssets the uploads that come with loadedText; empty for a pristine open
 * @returns "loaded" to open loadedText/loadedAssets as-is, "local" with the copy to open and keep, "cancel" to open nothing
 */
export async function offerLocalDraft(
  path: string,
  title: string,
  loadedText: string,
  loadedSha: string,
  loadedAssets: StagedAsset[] = [],
): Promise<LocalOffer> {
  const record = await loadRecord(path);
  const text = record.text ?? loadDraft(path);
  const snapshot: LocalSnapshot = {
    path,
    textSha: text === null ? null : await gitBlobSha(text),
    baseSha: record.baseSha,
    staged: record.uploads !== null,
    updatedAt: record.updatedAt,
  };
  const decision = decideOpen(snapshot, loadedSha);
  if (decision === "loaded") return { choice: "loaded" };

  const copy = { text: text ?? loadedText, uploads: record.uploads ?? loadedAssets };
  if (decision === "local") return { choice: "local", ...copy };

  const legacy = record.baseSha === null;
  const answer = await chooseAction({
    title: "This scenario changed on GitHub and in this browser",
    message: legacy
      ? `"${title}" has edits in this browser that differ from the GitHub version. Opening one version replaces the other on the next save.`
      : `"${title}" was changed on GitHub, and it has edits in this browser that were never saved. Opening one version replaces the other on the next save.`,
    warning: "",
    okLabel: "Open GitHub version",
    altLabel: "Open this browser's version",
    danger: true,
  });
  if (answer === "cancel") return { choice: "cancel" };
  if (answer === "confirm") return { choice: "loaded" };
  await setBaseSha(path, loadedSha);
  return { choice: "local", ...copy };
}

/**
 * Offers the local draft a new copy would land on. A copy is keyed by its
 * name and game mode, not by the scenario it copies, so the draft may hold
 * another scenario altogether: the contributor picks which one opens.
 *
 * @param path the new copy's repository path, the local copy's key
 * @param name the typed name, shown in the dialog message
 * @param sourceTitle the picked scenario's title
 * @param loadedText the fresh copy's text
 * @returns the local copy to open and keep, or null to open loadedText and replace the draft
 */
export async function offerDraftOverCopy(
  path: string,
  name: string,
  sourceTitle: string,
  loadedText: string,
): Promise<{ text: string; uploads: StagedAsset[] } | null> {
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
 * @returns null when there is none, or it matches
 */
async function differingLocalCopy(
  path: string,
  loadedText: string,
  loadedAssets: StagedAsset[],
): Promise<{ text: string; uploads: StagedAsset[] } | null> {
  const record = await loadRecord(path);
  const localText = record.text ?? loadDraft(path);
  const loaded = { text: loadedText, uploads: assetsSignature(loadedAssets) };
  const local = { text: localText, uploads: record.uploads === null ? null : assetsSignature(record.uploads) };
  if (localText === null || !shouldOfferLocalDraft(loaded, local)) return null;
  return { text: localText, uploads: record.uploads ?? loadedAssets };
}

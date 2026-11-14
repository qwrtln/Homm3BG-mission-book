import { getToken } from "../../shared/github-auth.ts";
import { findBranchDraft, getBlobBytes, getRepoFile } from "../../shared/github-contrib.ts";
import { scenarioTitle } from "../../shared/scenario-name.ts";
import { markClean } from "../modules/dirty.ts";
import { confirmAction, readyStatus } from "../modules/dom.ts";
import { cancelScheduledSave, saveDraft } from "../modules/drafts.ts";
import { requireEditor } from "../modules/editor-api.ts";
import { githubSaveState } from "../modules/github-save-state.ts";
import { clearUploads, saveOpenedText } from "../modules/local-store.ts";
import { setStatus } from "../modules/status.ts";
import { resetUploads, restoreUploads } from "../modules/uploads.ts";
import { store } from "../store.ts";
import { getGithubContext, githubFailure } from "./context.ts";

/** Set while a discard runs, from the dialog to the reset. */
let discarding = false;

/**
 * Throws away the browser's edits to the open scenario: after a confirmation,
 * reads the saved branch from GitHub and resets the editor, the uploads and
 * the stored copy to it. Everything is fetched before anything is touched, so
 * a failure leaves the edits as they were.
 */
export async function discardLocalChanges(): Promise<void> {
  // One at a time: the menu item stays clickable while the fetch runs.
  if (discarding) return;
  discarding = true;
  try {
    await discard();
  } finally {
    discarding = false;
  }
}

async function discard(): Promise<void> {
  const token = getToken();
  const context = getGithubContext();
  const target = githubSaveState.lastSaveTarget;
  const { chosenPath: path, chosenTitle, editorText } = store.getState();
  if (!token || !context || !target || !path) return;

  // The name the header shows: the scenario's heading, else the name it was opened under.
  const name = scenarioTitle(editorText) ?? chosenTitle;
  const confirmed = await confirmAction({
    title: "Discard local changes?",
    message: `The version of "${name}" saved on GitHub replaces what this browser holds, including any images you added. Your edits here are removed.`,
    warning: "This cannot be undone.",
    okLabel: "Discard",
    danger: true,
    acknowledge: "I understand my unsaved changes will be lost",
  });
  if (!confirmed) return;

  const editor = requireEditor();
  setStatus("Discarding local changes…", { spinning: true });
  try {
    const draft = await findBranchDraft(token, {
      owner: target.owner,
      repo: target.repo,
      base: context.base,
      branch: target.branch,
      username: context.username,
    });
    if (!draft) throw new Error(`"${target.branch}" has no scenario file on GitHub.`);
    if (draft.texPath !== path) throw new Error(`"${target.branch}" holds "${draft.texPath}", not "${path}".`);
    const [content, assets] = await Promise.all([
      getRepoFile(token, target.owner, target.repo, draft.texPath, target.branch),
      Promise.all(
        draft.assets.map(async (a) => ({
          path: a.path,
          bytes: await getBlobBytes(token, target.owner, target.repo, a.sha),
        })),
      ),
    ]);
    if (content == null) throw new Error(`"${draft.texPath}" is no longer on that branch.`);
    // Superseded while this was in flight: another scenario is open, or the user signed out.
    if (store.getState().chosenPath !== path || githubSaveState.lastSaveTarget !== target || getToken() !== token) {
      setStatus(readyStatus());
      return;
    }

    // Nothing above touched the editor; from here on the edits are replaced.
    cancelScheduledSave();
    editor.setText(content);
    store.setState({ draftNote: false });
    resetUploads();
    restoreUploads(assets);
    saveDraft(path, content);
    await saveOpenedText(path, content, draft.texSha);
    await clearUploads(path);
    markClean();
    githubSaveState.committedUploads = new Set(draft.assets.map((asset) => asset.path));
    setStatus(`Discarded local changes to "${name}"; it matches GitHub again.`);
  } catch (error) {
    setStatus(githubFailure(error, "Could not discard"), { tone: "bad" });
  }
}

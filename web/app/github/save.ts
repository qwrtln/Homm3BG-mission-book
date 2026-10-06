import { flushSync } from "react-dom";
import { getToken } from "../../shared/github-auth.ts";
import {
  discoverGithubContext,
  ensurePullRequest,
  findPullRequest,
  saveScenarioToRepo,
} from "../../shared/github-contrib.ts";
import { pullRequestBody, submitRequirements } from "../../shared/submit-checklist.ts";
import { uploadsSignature } from "../../shared/unsaved.ts";
import { syncCategoryControl } from "../modules/category.ts";
import { isDirty, markClean } from "../modules/dirty.ts";
import { requireEditor } from "../modules/editor-api.ts";
import { githubSaveState } from "../modules/github-save-state.ts";
import { clearUploads } from "../modules/local-store.ts";
import { setStatus } from "../modules/status.ts";
import { askToSubmit, currentSubmitBlockers } from "../modules/submit.ts";
import { store } from "../store.ts";
import { getGithubContext, githubFailure, setGithubContext } from "./context.ts";

/**
 * Silent background check for a branch that already has an open pull request
 * (typically a resumed draft, after a page refresh): swaps "Open PR" for the
 * "View PR" link without the member having to click anything. Never creates
 * a PR itself; a failure just leaves "Open PR" showing.
 */
export async function checkExistingPullRequest(): Promise<void> {
  const target = githubSaveState.lastSaveTarget;
  const token = getToken();
  if (!target || !token) return;
  try {
    const pr = await findPullRequest(token, { owner: target.owner, branch: target.branch });
    if (!pr || githubSaveState.lastSaveTarget !== target) return; // superseded while this was in flight
    store.setState({ prUrl: pr.html_url, openPrVisible: false });
  } catch {
    /* best-effort: leave "Open PR" showing */
  }
}

/** Save: pushes the open scenario to its branch. Opening a PR is a separate action, below. */
export async function saveToGithub(): Promise<void> {
  const texPath = store.getState().chosenPath;
  if (!texPath) return;
  const token = getToken();
  if (!token) return;
  if (githubSaveState.lastSaveTarget && !isDirty()) {
    setStatus("Saved.", { tone: "ok" });
    return;
  }
  // A save in flight took its path already: the category must not move under
  // it, and neither Save nor the select may stay live until the click returns.
  flushSync(() => {
    githubSaveState.saving = true;
  });
  syncCategoryControl();
  setStatus("Saving…", { spinning: true });
  try {
    let context = getGithubContext();
    if (!context) {
      context = await discoverGithubContext(token);
      setGithubContext(context);
    }
    const savedText = requireEditor().getText();
    const { uploadedFiles, chosenTitle } = store.getState();
    const savedUploads = uploadsSignature(uploadedFiles);
    const savedPaths = new Set(uploadedFiles.keys());
    const saved = await saveScenarioToRepo(token, {
      scenarioName: chosenTitle,
      texPath,
      texContent: savedText,
      uploadedFiles,
      removedUploads: [...githubSaveState.committedUploads],
      context,
      branch: githubSaveState.lastSaveTarget?.branch,
      mode: githubSaveState.edit ? "edit" : "new",
      startOver: githubSaveState.edit?.startOver ?? false,
    });
    // The reset happened with this save; from here on the branch is built upon.
    if (githubSaveState.edit) githubSaveState.edit.startOver = false;
    githubSaveState.lastSaveTarget = saved;
    syncCategoryControl();
    githubSaveState.committedUploads = savedPaths;
    markClean(savedText, savedUploads);
    // The staged uploads are committed now, same as the branch's own: no
    // local opinion is left to offer on a later reload. The text draft
    // stays, unaffected by a save (unchanged non-goal).
    await clearUploads(texPath);
    store.setState({ openPrVisible: true });
    setStatus(`Saved to ${saved.owner}/${saved.repo}@${saved.branch}.`, { tone: "ok" });
  } catch (error) {
    setStatus(githubFailure(error, "Save failed"), { tone: "bad" });
  } finally {
    githubSaveState.saving = false;
    syncCategoryControl();
  }
}

/** Open PR. ensurePullRequest is idempotent: it returns the existing PR for this branch instead of opening a second one. */
export async function openPullRequest(): Promise<void> {
  const target = githubSaveState.lastSaveTarget;
  if (!target) return;
  const token = getToken();
  if (!token) return;
  const mode = githubSaveState.edit ? "edit" : "new";
  const { checklist, gates } = submitRequirements({ mode });
  let body = pullRequestBody([]);
  // A new scenario always gets the dialog, for the checklist.
  if (gates && (checklist || currentSubmitBlockers().length > 0)) {
    const items = await askToSubmit({ checklist });
    if (items === null) return;
    body = pullRequestBody(items);
  }
  store.setState({ openingPr: true });
  setStatus("Opening PR…", { spinning: true });
  try {
    const pr = await ensurePullRequest(token, {
      ...target,
      scenarioName: store.getState().chosenTitle,
      mode,
      body,
    });
    store.setState({ prUrl: pr.html_url, openPrVisible: false });
    setStatus(`PR open at ${pr.html_url}.`, { tone: "ok" });
  } catch (error) {
    setStatus(githubFailure(error, "Could not open the PR"), { tone: "bad" });
  } finally {
    store.setState({ openingPr: false });
  }
}

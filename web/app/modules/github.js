import { getToken, signIn, completeSignIn, clearToken } from "../../shared/github-auth.js";
import {
  saveScenarioToRepo, ensurePullRequest, discoverGithubContext, getRepoFile, getBlobBytes,
  UPSTREAM_OWNER, UPSTREAM_REPO, GithubApiError,
} from "../../shared/github-contrib.js?v=2";

import { errorMessage } from "../../shared/errors.js";
import { state, requireEditor } from "./state.js";
import { el, setStatus, escapeHtml, basenameNoExt, closestTo } from "./dom.js";
import { loadDraft, saveDraft } from "./drafts.js";
import { clearPdf } from "./pdf-view.js";
import { showWorkspace } from "./workspace.js";
import { resetUploads, restoreUploads } from "./uploads.js";
import { githubSaveState, resetGithubSaveState } from "./github-save-state.js";

/** Shows either the sign-in button or the signed-in strip. @returns {void} */
function renderGithubHeader() {
  const signedIn = Boolean(getToken());
  el("github-signin").hidden = signedIn;
  el("github-status").hidden = !signedIn;
}

// Sign-in is a full-page redirect, dropping chosenPath and the autosave debounce. Flush and remember what was open.
const REOPEN_KEY = "wasm-scenario-builder:pending-reopen";

/**
 * Reopens what was being edited before a sign-in redirect. From localStorage
 * only, no server fetch: for a scenario never yet saved anywhere but here.
 *
 * @param {string} path
 * @param {string} [title]
 * @returns {Promise<boolean>} false when there is nothing stored for it
 */
async function reopenLocalDraft(path, title) {
  const content = loadDraft(path);
  if (content === null) return false;

  const cm = requireEditor();
  await showWorkspace();
  cm.refresh();
  el("header-actions").hidden = false;
  resetGithubSaveState();

  state.chosenPath = path;
  state.chosenTitle = title || basenameNoExt(path);
  document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
  el("build").disabled = state.building;
  el("download").disabled = true;
  cm.setValue(content);
  el("draft-note").hidden = false;
  resetUploads();
  clearPdf();
  setStatus("Ready.");
  return true;
}

/** @type {GithubContext | null} */
let githubContext = null;

/** Draws the resume list from the signed-in user's own branches. @returns {void} */
function renderResumeDrafts() {
  const drafts = (githubContext && githubContext.drafts) || [];
  const list = el("resume-list");
  el("resume-drafts").hidden = drafts.length === 0;
  if (drafts.length === 0) return;
  list.innerHTML = drafts
    .map((d, i) => `<button type="button" class="combobox-item" data-draft-index="${i}">${escapeHtml(d.texPath)} <span class="hint">(${escapeHtml(d.branch)})</span></button>`)
    .join("");
}

/** Wires every GitHub control, then completes a pending sign-in. @returns {void} */
export function initGithub() {
  el("github-signin").addEventListener("click", () => {
    if (state.chosenPath && state.cm) {
      clearTimeout(state.saveTimer ?? undefined);
      saveDraft(state.chosenPath, state.cm.getValue());
      try {
        localStorage.setItem(REOPEN_KEY, JSON.stringify({ path: state.chosenPath, title: state.chosenTitle }));
      } catch { /* private mode, blocked storage: sign-in still proceeds */ }
    }
    signIn();
  });

  (() => {
    /** @type {{path?: string, title?: string} | null} */
    let pending = null;
    try {
      const raw = localStorage.getItem(REOPEN_KEY);
      localStorage.removeItem(REOPEN_KEY);
      if (raw) pending = JSON.parse(raw);
    } catch { /* nothing to reopen */ }
    if (pending && pending.path) reopenLocalDraft(pending.path, pending.title);
  })();

  window.__lastSaveTarget = () => githubSaveState.lastSaveTarget;

  el("github-signout").addEventListener("click", () => {
    clearToken();
    githubContext = null;
    resetGithubSaveState();
    el("resume-drafts").hidden = true;
    renderGithubHeader();
  });

  // Push only; opening a PR is a separate action, below.
  el("github-save").addEventListener("click", async () => {
    if (!state.chosenPath) return;
    const token = getToken();
    if (!token) return;
    const button = el("github-save");
    button.disabled = true;
    setStatus("Saving…", { spinning: true });
    try {
      if (!githubContext) githubContext = await discoverGithubContext(token);
      const saved = await saveScenarioToRepo(token, {
        scenarioName: state.chosenTitle,
        texPath: state.chosenPath,
        texContent: requireEditor().getValue(),
        uploadedFiles: state.uploadedFiles,
        context: githubContext,
      });
      githubSaveState.lastSaveTarget = saved;
      button.textContent = "💾 Save again";
      el("github-open-pr").hidden = false;
      setStatus(`Saved to ${saved.owner}/${saved.repo}@${saved.branch}.`, { tone: "ok" });
    } catch (error) {
      const message = error instanceof GithubApiError ? error.message : `Save failed: ${errorMessage(error)}`;
      setStatus(message, { tone: "bad" });
    } finally {
      button.disabled = false;
    }
  });

  // ensurePullRequest is idempotent: returns the existing PR for this branch instead of opening a second one.
  el("github-open-pr").addEventListener("click", async () => {
    if (!githubSaveState.lastSaveTarget) return;
    const token = getToken();
    if (!token) return;
    const button = el("github-open-pr");
    button.disabled = true;
    setStatus("Opening PR…", { spinning: true });
    try {
      const pr = await ensurePullRequest(token, { ...githubSaveState.lastSaveTarget, scenarioName: state.chosenTitle });
      el("github-pr-link").href = pr.html_url;
      el("github-pr-link").hidden = false;
      button.hidden = true;
      setStatus(`PR open at ${pr.html_url}.`, { tone: "ok" });
    } catch (error) {
      const message = error instanceof GithubApiError ? error.message : `Could not open the PR: ${errorMessage(error)}`;
      setStatus(message, { tone: "bad" });
    } finally {
      button.disabled = false;
    }
  });

  el("resume-list").addEventListener("click", async (event) => {
    const button = closestTo(event, "[data-draft-index]");
    if (!button || !githubContext) return;
    const draft = githubContext.drafts[Number(button.dataset.draftIndex)];
    if (!draft) return;
    const token = getToken();
    if (!token) return;

    // A non-member always has a fork by now: the resume list is only drawn
    // from drafts found on one.
    const fork = githubContext.fork;
    if (!githubContext.isMember && !fork) return;
    const { owner, repo } = githubContext.isMember || !fork
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: fork.owner.login, repo: fork.name };

    const cm = requireEditor();

    setStatus("Loading your draft…", { spinning: true });
    try {
      const [content, assets] = await Promise.all([
        getRepoFile(token, owner, repo, draft.texPath, draft.branch),
        Promise.all(draft.assets.map(async (a) => ({ path: a.path, bytes: await getBlobBytes(token, owner, repo, a.sha) }))),
      ]);
      if (content == null) throw new Error(`"${draft.texPath}" is no longer on that branch.`);

      await showWorkspace();
      cm.refresh();
      el("header-actions").hidden = false;
      resetGithubSaveState();

      state.chosenPath = draft.texPath;
      state.chosenTitle = basenameNoExt(draft.texPath).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
      el("build").disabled = state.building;
      el("download").disabled = true;
      cm.setValue(content);
      el("draft-note").hidden = true;
      resetUploads();
      restoreUploads(assets);
      clearPdf();

      githubSaveState.lastSaveTarget = { owner, repo, branch: draft.branch, isMember: githubContext.isMember };
      el("github-open-pr").hidden = false;
      el("github-save").textContent = "💾 Save again";
      setStatus("Ready.");
    } catch (error) {
      const message = error instanceof GithubApiError ? error.message : `Could not load that draft: ${errorMessage(error)}`;
      setStatus(message, { tone: "bad" });
    }
  });

  completeSignIn()
    .then(async (token) => {
      if (!token) return;
      try {
        githubContext = await discoverGithubContext(token);
        renderResumeDrafts();
      } catch (error) {
        setStatus(`Could not read your GitHub account: ${errorMessage(error)}`, { tone: "bad" });
      }
    })
    .catch((error) => {
      setStatus(`GitHub sign-in failed: ${errorMessage(error)}`, { tone: "bad" });
    })
    .finally(renderGithubHeader);
}

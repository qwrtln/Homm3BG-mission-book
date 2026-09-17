import { getToken, signIn, completeSignIn, clearToken } from "../../shared/github-auth.js";
import {
  saveScenarioToRepo, ensurePullRequest, discoverGithubContext, getRepoFile, getBlobBytes,
  UPSTREAM_OWNER, UPSTREAM_REPO, GithubApiError,
} from "../../shared/github-contrib.js?v=2";

import { state } from "./state.js";
import { el, setStatus, escapeHtml, basenameNoExt } from "./dom.js";
import { loadDraft, saveDraft } from "./drafts.js";
import { clearPdf } from "./pdf-view.js";
import { showWorkspace } from "./workspace.js";
import { resetUploads, restoreUploads } from "./uploads.js";
import { githubSaveState, resetGithubSaveState } from "./github-save-state.js";

function renderGithubHeader() {
  const signedIn = Boolean(getToken());
  el("github-signin").hidden = signedIn;
  el("github-status").hidden = !signedIn;
}

// Sign-in is a full-page redirect, dropping chosenPath and the autosave debounce. Flush and remember what was open.
const REOPEN_KEY = "wasm-scenario-builder:pending-reopen";

// From localStorage only, no server fetch: for a scenario never yet saved anywhere but here.
async function reopenLocalDraft(path, title) {
  const content = loadDraft(path);
  if (content === null) return false;

  await showWorkspace();
  state.cm.refresh();
  el("header-actions").hidden = false;
  resetGithubSaveState();

  state.chosenPath = path;
  state.chosenTitle = title || basenameNoExt(path);
  document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
  el("build").disabled = state.building;
  el("download").disabled = true;
  state.cm.setValue(content);
  el("draft-note").hidden = false;
  resetUploads();
  clearPdf();
  setStatus("Ready.");
  return true;
}

let githubContext = null;

function renderResumeDrafts() {
  const drafts = (githubContext && githubContext.drafts) || [];
  const list = el("resume-list");
  el("resume-drafts").hidden = drafts.length === 0;
  if (drafts.length === 0) return;
  list.innerHTML = drafts
    .map((d, i) => `<button type="button" class="combobox-item" data-draft-index="${i}">${escapeHtml(d.texPath)} <span class="hint">(${escapeHtml(d.branch)})</span></button>`)
    .join("");
}

export function initGithub() {
  el("github-signin").addEventListener("click", () => {
    if (state.chosenPath) {
      clearTimeout(state.saveTimer);
      saveDraft(state.chosenPath, state.cm.getValue());
      try {
        localStorage.setItem(REOPEN_KEY, JSON.stringify({ path: state.chosenPath, title: state.chosenTitle }));
      } catch { /* private mode, blocked storage: sign-in still proceeds */ }
    }
    signIn();
  });

  (() => {
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
      githubSaveState.lastSaveTarget = await saveScenarioToRepo(token, {
        scenarioName: state.chosenTitle,
        texPath: state.chosenPath,
        texContent: state.cm.getValue(),
        uploadedFiles: state.uploadedFiles,
        context: githubContext,
      });
      button.textContent = "💾 Save again";
      el("github-open-pr").hidden = false;
      setStatus(
        `Saved to ${githubSaveState.lastSaveTarget.owner}/${githubSaveState.lastSaveTarget.repo}@${githubSaveState.lastSaveTarget.branch}.`,
        { tone: "ok" },
      );
    } catch (error) {
      const message = error instanceof GithubApiError ? error.message : `Save failed: ${error.message}`;
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
      const message = error instanceof GithubApiError ? error.message : `Could not open the PR: ${error.message}`;
      setStatus(message, { tone: "bad" });
    } finally {
      button.disabled = false;
    }
  });

  el("resume-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-draft-index]");
    if (!button) return;
    const draft = githubContext.drafts[Number(button.dataset.draftIndex)];
    if (!draft) return;
    const token = getToken();
    if (!token) return;

    const { owner, repo } = githubContext.isMember
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: githubContext.fork.owner.login, repo: githubContext.fork.name };

    setStatus("Loading your draft…", { spinning: true });
    try {
      const [content, assets] = await Promise.all([
        getRepoFile(token, owner, repo, draft.texPath, draft.branch),
        Promise.all(draft.assets.map(async (a) => ({ path: a.path, bytes: await getBlobBytes(token, owner, repo, a.sha) }))),
      ]);
      if (content == null) throw new Error(`"${draft.texPath}" is no longer on that branch.`);

      await showWorkspace();
      state.cm.refresh();
      el("header-actions").hidden = false;
      resetGithubSaveState();

      state.chosenPath = draft.texPath;
      state.chosenTitle = basenameNoExt(draft.texPath).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      document.title = `${state.chosenTitle} - Heroes III: The Board Game`;
      el("build").disabled = state.building;
      el("download").disabled = true;
      state.cm.setValue(content);
      el("draft-note").hidden = true;
      resetUploads();
      restoreUploads(assets);
      clearPdf();

      githubSaveState.lastSaveTarget = { owner, repo, branch: draft.branch, isMember: githubContext.isMember };
      el("github-open-pr").hidden = false;
      el("github-save").textContent = "💾 Save again";
      setStatus("Ready.");
    } catch (error) {
      const message = error instanceof GithubApiError ? error.message : `Could not load that draft: ${error.message}`;
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
        setStatus(`Could not read your GitHub account: ${error.message}`, { tone: "bad" });
      }
    })
    .catch((error) => {
      setStatus(`GitHub sign-in failed: ${error.message}`, { tone: "bad" });
    })
    .finally(renderGithubHeader);
}

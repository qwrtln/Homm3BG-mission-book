import { getToken, signIn, completeSignIn, clearToken } from "../../shared/github-auth.js";
import {
  saveScenarioToRepo, ensurePullRequest, deleteWorkBranch, discoverGithubContext, findEditBranch, getRepoFile, getBlobBytes,
  UPSTREAM_OWNER, UPSTREAM_REPO, GithubApiError,
} from "../../shared/github-contrib.js?v=2";

import { errorMessage } from "../../shared/errors.js";
import { state, requireEditor } from "./state.js";
import { el, setStatus, escapeHtml, basenameNoExt, closestTo } from "./dom.js";
import { loadDraft, saveDraft, deleteDraft } from "./drafts.js";
import { clearPdf } from "./pdf-view.js";
import { showWorkspace, openForEdit } from "./workspace.js";
import { onEditPick, settleModes } from "./picker.js";
import { preloadFile } from "./files.js";
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

const CATEGORY_LABELS = { clash: "Clash", coops: "Cooperative", campaigns: "Campaign", alliances: "Alliance" };

/**
 * "draft-scenarios/clash/kyrre_link.tex" -> "Clash: Kyrre Link".
 *
 * @param {string} texPath
 * @returns {string}
 */
function draftLabel(texPath) {
  const dir = texPath.split("/").slice(-2, -1)[0] ?? "";
  const title = basenameNoExt(texPath).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const category = /** @type {Record<string, string>} */ (CATEGORY_LABELS)[dir];
  return category ? `${category}: ${title}` : title;
}

/**
 * "3 hours ago", "yesterday", ...; empty when the date is missing or invalid.
 *
 * @param {string | undefined} iso
 * @returns {string}
 */
function timeAgo(iso) {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return "";
  const seconds = Math.min(0, Math.round((then - Date.now()) / 1000));
  const units = /** @type {[Intl.RelativeTimeFormatUnit, number][]} */ ([
    ["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60],
  ]);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (-seconds >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Draws the resume list from the signed-in user's own branches. @returns {void} */
function renderResumeDrafts() {
  const drafts = (githubContext && githubContext.drafts) || [];
  const list = el("resume-list");
  el("resume-loading").hidden = true;
  el("resume-hint").hidden = false;
  el("resume-drafts").hidden = drafts.length === 0;
  if (drafts.length === 0) return;
  list.innerHTML = drafts
    .map((d, i) => {
      const ago = timeAgo(d.lastEdit);
      const detail = ago ? `${d.branch}, last edit ${ago}` : d.branch;
      const kind = d.kind === "edit" ? "editing in place" : "new draft";
      const label = draftLabel(d.texPath);
      return `<div class="resume-row">`
        + `<button type="button" class="combobox-item" data-draft-index="${i}">${escapeHtml(label)} <span class="hint">(${escapeHtml(kind)}; ${escapeHtml(detail)})</span></button>`
        + `<button type="button" class="resume-delete" data-delete-index="${i}" aria-label="Delete ${escapeHtml(label)}" title="Delete this work in progress">🗑</button>`
        + `</div>`;
    })
    .join("");
}

/**
 * Asks, then deletes a work-in-progress branch and drops it from the list.
 * Cancelling the dialog changes nothing.
 *
 * @param {ResumableDraft | undefined} draft
 * @returns {Promise<void>}
 */
async function deleteResumableDraft(draft) {
  const token = getToken();
  if (!draft || !token || !githubContext) return;
  const label = draftLabel(draft.texPath);
  if (!window.confirm(`Delete "${label}"?\n\nThis deletes the branch ${draft.branch} and everything saved on it. It cannot be undone.`)) return;

  const fork = githubContext.fork;
  if (!githubContext.isMember && !fork) return;
  const { owner, repo } = githubContext.isMember || !fork
    ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
    : { owner: fork.owner.login, repo: fork.name };

  setStatus("Deleting…", { spinning: true });
  try {
    await deleteWorkBranch(token, { owner, repo, branch: draft.branch });
    githubContext.drafts = githubContext.drafts.filter((d) => d !== draft);
    renderResumeDrafts();
    setStatus(`Deleted "${label}".`);
  } catch (error) {
    setStatus(error instanceof GithubApiError ? error.message : `Could not delete: ${errorMessage(error)}`, { tone: "bad" });
  }
}

/** Shows the resume block in its searching state. @returns {void} */
function showResumeSearching() {
  el("resume-list").innerHTML = "";
  el("resume-hint").hidden = true;
  el("resume-loading").hidden = false;
  el("resume-drafts").hidden = false;
}

/**
 * "Let's go!" in edit mode. If an earlier session left an edit branch for this
 * file the member is asked whether to continue it or start over; otherwise the
 * Mission Book's own copy opens.
 *
 * @param {string} path
 * @param {string} title
 * @returns {Promise<void>}
 */
async function startEdit(path, title) {
  const token = getToken();
  if (!token || !githubContext || !githubContext.isMember) return;
  const context = githubContext;
  el("edit-branch-prompt").hidden = true;
  el("go").disabled = true;
  try {
    const branch = await findEditBranch(token, { username: context.username, texPath: path });

    /** @param {boolean} startOver @returns {Promise<void>} */
    const open = async (startOver) => {
      el("edit-branch-prompt").hidden = true;
      const source = branch && !startOver
        ? await getRepoFile(token, UPSTREAM_OWNER, UPSTREAM_REPO, path, branch)
        : /** @type {string} */ ((await preloadFile(path)).content);
      if (source == null) throw new Error(`"${path}" is not in the repository.`);
      await openForEdit(path, title, source, { startOver: branch !== null && startOver });
      if (branch && !startOver) {
        githubSaveState.lastSaveTarget = { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO, branch, isMember: true };
        el("github-open-pr").hidden = false;
        el("github-save").textContent = "💾 Save again";
      }
    };

    if (branch === null) {
      await open(false);
      return;
    }
    el("edit-branch-prompt").hidden = false;
    el("edit-continue").onclick = () => open(false).catch(reportEditError);
    el("edit-start-over").onclick = () => open(true).catch(reportEditError);
  } catch (error) {
    reportEditError(error);
  } finally {
    el("go").disabled = false;
  }
}

/**
 * @param {unknown} error
 * @returns {void}
 */
function reportEditError(error) {
  const message = error instanceof GithubApiError ? error.message : `Could not open that scenario: ${errorMessage(error)}`;
  el("go-hint").textContent = message;
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

  onEditPick(startEdit);

  window.__lastSaveTarget = () => githubSaveState.lastSaveTarget;

  el("github-signout").addEventListener("click", () => {
    clearToken();
    githubContext = null;
    resetGithubSaveState();
    el("resume-drafts").hidden = true;
    settleModes(false);
    if (!el("workspace").hidden) {
      // Signed out mid-edit: the autosaved copy belongs to the account that
      // just left, so purge it and go back to welcome. A reload is the only
      // reset that clears the editor, uploads and module state together.
      clearTimeout(state.saveTimer ?? undefined);
      if (state.chosenPath) deleteDraft(state.chosenPath);
      try {
        localStorage.removeItem(REOPEN_KEY);
      } catch { /* blocked storage: nothing to remove */ }
      location.reload();
      return;
    }
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
        branch: githubSaveState.lastSaveTarget?.branch,
        mode: githubSaveState.edit ? "edit" : "new",
        startOver: githubSaveState.edit?.startOver ?? false,
      });
      // The reset happened with this save; from here on the branch is built upon.
      if (githubSaveState.edit) githubSaveState.edit.startOver = false;
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
      const pr = await ensurePullRequest(token, {
        ...githubSaveState.lastSaveTarget,
        scenarioName: state.chosenTitle,
        mode: githubSaveState.edit ? "edit" : "new",
      });
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
    const deleteButton = closestTo(event, "[data-delete-index]");
    if (deleteButton && githubContext) {
      await deleteResumableDraft(githubContext.drafts[Number(deleteButton.dataset.deleteIndex)]);
      return;
    }
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
      githubSaveState.edit = draft.kind === "edit" ? { startOver: false } : null;

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

  if (getToken()) showResumeSearching();
  completeSignIn()
    .then(async (token) => {
      if (!token) return;
      showResumeSearching();
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
    .finally(() => {
      // Whatever happened, the searching state must not outlive the search.
      el("resume-loading").hidden = true;
      el("resume-hint").hidden = false;
      el("resume-drafts").hidden = !githubContext || githubContext.drafts.length === 0;
      // Whatever happened, the picker must not stay held back by the search.
      settleModes(Boolean(githubContext && githubContext.isMember));
      renderGithubHeader();
    });
}

import { getToken } from "../../shared/github-auth.ts";
import {
  deleteWorkBranch,
  discoverGithubContext,
  findEditBranch,
  getBlobBytes,
  getRepoFile,
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
} from "../../shared/github-contrib.ts";
import { assetsSignature } from "../../shared/unsaved.ts";
import { syncCategoryControl } from "../modules/category.ts";
import { markClean } from "../modules/dirty.ts";
import { basenameNoExt, closestTo, confirmDelete, el, escapeHtml, readyStatus, setStatus } from "../modules/dom.js";
import { saveDraft } from "../modules/drafts.ts";
import { loadEntries } from "../modules/entries.ts";
import { preloadFile } from "../modules/files.ts";
import { githubSaveState, resetGithubSaveState } from "../modules/github-save-state.js";
import { setScenarioTitle } from "../modules/header.ts";
import { clearUploads, saveText } from "../modules/local-store.ts";
import { clearPdf } from "../modules/pdf-view.js";
import { offerLocalDraft } from "../modules/recovery.js";
import { reflectRoute } from "../modules/route.ts";
import { requireEditor, state } from "../modules/state.ts";
import { resetUploads, restoreUploads } from "../modules/uploads.js";
import { isParked, openForEdit, returnToParked, showWorkspace } from "../modules/workspace.js";
import { store } from "../store.ts";
import { dropRevokedToken, getGithubContext, githubFailure, SIGN_IN_EXPIRED, setGithubContext } from "./context.ts";
import { checkExistingPullRequest } from "./save.ts";

const CATEGORY_LABELS: Record<string, string> = {
  clash: "Clash",
  coops: "Cooperative",
  campaigns: "Campaign",
  alliances: "Alliance",
};

/** "draft-scenarios/clash/kyrre_link.tex" -> "Clash: Kyrre Link". */
function draftLabel(texPath: string): string {
  const dir = texPath.split("/").slice(-2, -1)[0] ?? "";
  const title = basenameNoExt(texPath)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const category = CATEGORY_LABELS[dir];
  return category ? `${category}: ${title}` : title;
}

/** "3 hours ago", "yesterday", ...; empty when the date is missing or invalid. */
function timeAgo(iso: string | undefined): string {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(then)) return "";
  const seconds = Math.min(0, Math.round((then - Date.now()) / 1000));
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (-seconds >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Draws the resume list from the signed-in user's own branches. */
export function renderResumeDrafts(): void {
  const drafts = getGithubContext()?.drafts || [];
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
      return (
        `<div class="resume-row">` +
        `<button type="button" class="combobox-item" data-draft-index="${i}">${escapeHtml(label)} <span class="hint">(${escapeHtml(kind)}; ${escapeHtml(detail)})</span></button>` +
        `<button type="button" class="resume-delete" data-delete-index="${i}" aria-label="Delete ${escapeHtml(label)}" title="Delete this work in progress"><svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg></button>` +
        `</div>`
      );
    })
    .join("");
}

/**
 * Asks, then deletes a work-in-progress branch and drops it from the list.
 * Cancelling the dialog changes nothing.
 */
async function deleteResumableDraft(draft: ResumableDraft | undefined): Promise<void> {
  const token = getToken();
  const context = getGithubContext();
  if (!draft || !token || !context) return;
  const label = draftLabel(draft.texPath);
  if (!(await confirmDelete(`"${label}" will be deleted.`))) return;

  const fork = context.fork;
  if (!context.isMember && !fork) return;
  const { owner, repo } =
    context.isMember || !fork
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: fork.owner.login, repo: fork.name };

  setStatus("Deleting…", { spinning: true });
  try {
    await deleteWorkBranch(token, { owner, repo, branch: draft.branch });
    context.drafts = context.drafts.filter((d) => d !== draft);
    renderResumeDrafts();
    setStatus(`Deleted "${label}".`);
  } catch (error) {
    setStatus(githubFailure(error, "Could not delete"), { tone: "bad" });
  }
}

/** Shows the resume block in its searching state. */
export function showResumeSearching(): void {
  el("resume-list").innerHTML = "";
  el("resume-hint").hidden = true;
  el("resume-loading").hidden = false;
  el("resume-drafts").hidden = false;
}

function reportEditError(error: unknown): void {
  el("go-hint").textContent = githubFailure(error, "Could not open that scenario");
}

/**
 * "Open editor" in edit mode. If an earlier session left an edit branch for this
 * file the member is asked whether to continue it or start over; otherwise the
 * Mission Book's own copy opens.
 */
export async function startEdit(path: string, title: string): Promise<void> {
  const token = getToken();
  const context = getGithubContext();
  if (!token || !context?.isMember) return;
  el("edit-branch-prompt").hidden = true;
  el("go").disabled = true;
  try {
    const branch = await findEditBranch(token, { username: context.username, texPath: path });

    const open = async (startOver: boolean): Promise<void> => {
      el("edit-branch-prompt").hidden = true;
      const source =
        branch && !startOver
          ? await getRepoFile(token, UPSTREAM_OWNER, UPSTREAM_REPO, path, branch)
          : ((await preloadFile(path)).content as string);
      if (source == null) throw new Error(`"${path}" is not in the repository.`);
      await openForEdit(path, title, source, { startOver: branch !== null && startOver });
      if (branch && !startOver) {
        githubSaveState.lastSaveTarget = { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO, branch, isMember: true };
        syncCategoryControl();
        store.setState({ openPrVisible: true });
        void checkExistingPullRequest();
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

/** Opens a work-in-progress branch from GitHub in the editor. */
export async function openResumableDraft(draft: ResumableDraft): Promise<void> {
  const token = getToken();
  const context = getGithubContext();
  if (!token || !context) return;

  // A non-member always has a fork by now: the resume list is only drawn
  // from drafts found on one.
  const fork = context.fork;
  if (!context.isMember && !fork) return;
  const { owner, repo } =
    context.isMember || !fork
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: fork.owner.login, repo: fork.name };

  const cm = requireEditor();

  setStatus("Loading your draft…", { spinning: true });
  try {
    const [content, assets] = await Promise.all([
      getRepoFile(token, owner, repo, draft.texPath, draft.branch),
      Promise.all(
        draft.assets.map(async (a) => ({ path: a.path, bytes: await getBlobBytes(token, owner, repo, a.sha) })),
      ),
    ]);
    if (content == null) throw new Error(`"${draft.texPath}" is no longer on that branch.`);

    await showWorkspace();
    cm.refresh();
    store.setState({ actionsVisible: true });
    resetGithubSaveState();
    githubSaveState.edit = draft.kind === "edit" ? { startOver: false } : null;

    state.chosenPath = draft.texPath;
    const title = basenameNoExt(draft.texPath)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    setScenarioTitle(title);
    reflectRoute();
    store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply

    const local = await offerLocalDraft(draft.texPath, title, content, assets);
    cm.setValue(local ? local.text : content);
    store.setState({ draftNote: local !== null });
    resetUploads();
    restoreUploads(local ? local.uploads : assets);
    clearPdf();
    if (local !== null) {
      markClean(content, assetsSignature(assets));
    } else {
      // Gone from the editor; written at once so a crash within the next 400
      // ms cannot leave the old local text under this key.
      saveDraft(draft.texPath, content);
      await saveText(draft.texPath, content);
      await clearUploads(draft.texPath);
      markClean();
    }

    githubSaveState.lastSaveTarget = { owner, repo, branch: draft.branch, isMember: context.isMember };
    syncCategoryControl();
    githubSaveState.committedUploads = new Set(draft.assets.map((asset) => asset.path));
    store.setState({ openPrVisible: true });
    void checkExistingPullRequest();
    setStatus(readyStatus());
  } catch (error) {
    setStatus(githubFailure(error, "Could not load that draft"), { tone: "bad" });
  }
}

/**
 * Brings the welcome screen's data up to date without disturbing it: what is
 * on screen stays, and is replaced only when the answer arrives. A failure
 * leaves the old data in place.
 */
export async function refreshWelcomeData(): Promise<void> {
  const entries = loadEntries().catch(() => {});
  const token = getToken();
  if (token) {
    try {
      setGithubContext(await discoverGithubContext(token));
      renderResumeDrafts();
    } catch (error) {
      // A revoked sign-in is not "known": drop it. Anything else keeps what is on screen.
      if (dropRevokedToken(error)) setStatus(SIGN_IN_EXPIRED, { tone: "bad" });
    }
  }
  await entries;
}

/** Wires the resume list: a row opens its branch, its delete button removes it. */
export function initResumeList(): void {
  el("resume-list").addEventListener("click", async (event) => {
    const context = getGithubContext();
    const deleteButton = closestTo(event, "[data-delete-index]");
    if (deleteButton && context) {
      await deleteResumableDraft(context.drafts[Number(deleteButton.dataset.deleteIndex)]);
      return;
    }
    const button = closestTo(event, "[data-draft-index]");
    if (!button || !context) return;
    const draft = context.drafts[Number(button.dataset.draftIndex)];
    if (!draft) return;
    // The scenario just left: its open copy is newer than the branch, and has its PDF.
    if (isParked() && draft.texPath === state.chosenPath && (draft.kind === "edit") === Boolean(githubSaveState.edit)) {
      await returnToParked();
      return;
    }
    await openResumableDraft(draft);
  });
}

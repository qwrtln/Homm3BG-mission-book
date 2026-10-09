import { getSignInMethod, getToken } from "../../shared/github-auth.ts";
import {
  deleteWorkBranch,
  discoverGithubContext,
  findEditBranch,
  getBlobBytes,
  getRepoFile,
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
} from "../../shared/github-contrib.ts";
import { type BranchKnowledge, classifyEntries, type WelcomeEntry } from "../../shared/local-drafts.ts";
import { assetsSignature } from "../../shared/unsaved.ts";
import { syncCategoryControl } from "../modules/category.ts";
import { markClean } from "../modules/dirty.ts";
import { basenameNoExt, confirmDelete, readyStatus } from "../modules/dom.ts";
import { draftLabel } from "../modules/draft-labels.ts";
import { deleteDraft, saveDraft } from "../modules/drafts.ts";
import { requireEditor } from "../modules/editor-api.ts";
import { loadEntries } from "../modules/entries.ts";
import { preloadFile } from "../modules/files.ts";
import { githubSaveState, resetGithubSaveState } from "../modules/github-save-state.ts";
import { setScenarioTitle } from "../modules/header.ts";
import { listLocalSnapshots } from "../modules/local-snapshots.ts";
import { clearUploads, deleteRecord, saveOpenedText } from "../modules/local-store.ts";
import { offerLocalDraft } from "../modules/recovery.ts";
import { clearRoute, reflectRoute } from "../modules/route.ts";
import { setStatus } from "../modules/status.ts";
import { resetUploads, restoreUploads } from "../modules/uploads.ts";
import { isParked, openForEdit, returnToParked, showWorkspace } from "../modules/workspace.ts";
import { clearPdf } from "../pdf/view.ts";
import { setResume, store } from "../store.ts";
import {
  dropRevokedToken,
  getGithubContext,
  githubFailure,
  setGithubContext,
  signInExpiredMessage,
} from "./context.ts";
import { reopenLocalDraft } from "./open-route.ts";
import { checkExistingPullRequest } from "./save.ts";

let renderTicket = 0;

/**
 * Draws the resume list from what this browser holds and what the GitHub
 * lookup found. Local copies need no network, so this works signed out and
 * before the account lookup answers. Of two overlapping calls, the later one wins.
 */
export async function renderResumeList(): Promise<void> {
  const ticket = ++renderTicket;
  const local = await listLocalSnapshots();
  if (ticket !== renderTicket) return;
  const context = getGithubContext();
  const knowledge: BranchKnowledge = !getToken() ? "signed-out" : !context?.draftsComplete ? "unknown" : "complete";
  const entries = classifyEntries(local, context?.drafts ?? [], knowledge);
  setResume({ entries, visible: entries.length > 0 || store.getState().resume.searching });
}

/** Whether the scenario at `path` is the one left open behind the welcome screen. */
function isParkedPath(path: string): boolean {
  return isParked() && path === store.getState().chosenPath;
}

/**
 * Asks, then deletes a resume row. A row with a branch deletes the branch and
 * the local copy; a row without one deletes the local copy only, and needs no
 * sign-in. Cancelling the dialog changes nothing.
 */
export async function deleteResumeEntry(entry: WelcomeEntry): Promise<void> {
  const label = draftLabel(entry.path);
  const draft = entry.remote;
  if (draft) {
    const token = getToken();
    const context = getGithubContext();
    if (!token || !context) return;
    const unsaved =
      entry.state === "unsaved" || entry.state === "conflict" ? " Unsaved changes in this browser will be lost." : "";
    if (!(await confirmDelete(`\u201c${label}\u201d will be deleted from GitHub and from this browser.${unsaved}`)))
      return;

    const fork = context.fork;
    if (!context.isMember && !fork) return;
    const { owner, repo } =
      context.isMember || !fork
        ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
        : { owner: fork.owner.login, repo: fork.name };

    setStatus("Deleting\u2026", { spinning: true });
    try {
      await deleteWorkBranch(token, { owner, repo, branch: draft.branch });
    } catch (error) {
      setStatus(githubFailure(error, "Could not delete"), { tone: "bad" });
      return;
    }
    context.drafts = context.drafts.filter((d) => d !== draft);
  } else if (!(await confirmDelete(`\u201c${label}\u201d will be deleted from this browser.`))) {
    return;
  }

  // A branch row with no local copy is a second branch on a path whose local
  // copy belongs to another row: leave that copy alone.
  if (!draft || entry.local) {
    // The scenario may be open behind the welcome screen: drop it too, or its
    // next autosave would write the deleted text back.
    if (isParkedPath(entry.path)) store.setState({ parked: false, chosenPath: null });
    deleteDraft(entry.path);
    await deleteRecord(entry.path);
  }
  await renderResumeList();
  setStatus(`Deleted \u201c${label}\u201d.`);
}

/** Shows the resume block in its searching state: the local entries stay, only the loading line appears. */
export function showResumeSearching(): void {
  setResume({ visible: true, searching: true });
}

function reportEditError(error: unknown): void {
  store.setState({ pickerError: githubFailure(error, "Could not open that scenario") });
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
  store.setState({ editBranch: null, pickerBusy: true });
  try {
    const branch = await findEditBranch(token, { username: context.username, texPath: path });

    const open = async (startOver: boolean): Promise<void> => {
      store.setState({ editBranch: null });
      const source =
        branch && !startOver
          ? await getRepoFile(token, UPSTREAM_OWNER, UPSTREAM_REPO, path, branch)
          : ((await preloadFile(path)).content as string);
      if (source == null) throw new Error(`"${path}" is not in the repository.`);
      const opened = await openForEdit(path, title, source, { startOver: branch !== null && startOver });
      if (!opened) return;
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
    store.setState({
      editBranch: {
        onContinue: () => open(false).catch(reportEditError),
        onStartOver: () => open(true).catch(reportEditError),
      },
    });
  } catch (error) {
    reportEditError(error);
  } finally {
    store.setState({ pickerBusy: false });
  }
}

/**
 * Opens a work-in-progress branch from GitHub in the editor. The local copy is
 * weighed before the workspace shows, so Cancel leaves the welcome screen as it was.
 *
 * @returns "cancelled" when the contributor declined both versions, "failed"
 *   when nothing opened for another reason
 */
export async function openResumableDraft(draft: ResumableDraft): Promise<"opened" | "cancelled" | "failed"> {
  const token = getToken();
  const context = getGithubContext();
  if (!token || !context) return "failed";

  // A non-member always has a fork by now: the resume list is only drawn
  // from drafts found on one.
  const fork = context.fork;
  if (!context.isMember && !fork) return "failed";
  const { owner, repo } =
    context.isMember || !fork
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: fork.owner.login, repo: fork.name };

  const editor = requireEditor();

  setStatus("Loading your draft…", { spinning: true });
  try {
    const [content, assets] = await Promise.all([
      getRepoFile(token, owner, repo, draft.texPath, draft.branch),
      Promise.all(
        draft.assets.map(async (a) => ({ path: a.path, bytes: await getBlobBytes(token, owner, repo, a.sha) })),
      ),
    ]);
    if (content == null) throw new Error(`"${draft.texPath}" is no longer on that branch.`);

    const title = basenameNoExt(draft.texPath)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const local = await offerLocalDraft(draft.texPath, title, content, draft.texSha, assets);
    if (local.choice === "cancel") {
      setStatus(readyStatus());
      clearRoute();
      return "cancelled";
    }

    await showWorkspace();
    store.setState({ actionsVisible: true });
    resetGithubSaveState();
    githubSaveState.edit = draft.kind === "edit" ? { startOver: false } : null;

    store.setState({ chosenPath: draft.texPath });
    setScenarioTitle(title);
    reflectRoute();
    store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply

    const keepLocal = local.choice === "local";
    editor.setText(keepLocal ? local.text : content);
    store.setState({ draftNote: keepLocal });
    resetUploads();
    restoreUploads(keepLocal ? local.uploads : assets);
    clearPdf();
    if (keepLocal) {
      markClean(content, assetsSignature(assets));
    } else {
      // Gone from the editor; written at once so a crash within the next 400
      // ms cannot leave the old local text under this key.
      saveDraft(draft.texPath, content);
      await saveOpenedText(draft.texPath, content, draft.texSha);
      await clearUploads(draft.texPath);
      markClean();
    }

    githubSaveState.lastSaveTarget = { owner, repo, branch: draft.branch, isMember: context.isMember };
    syncCategoryControl();
    githubSaveState.committedUploads = new Set(draft.assets.map((asset) => asset.path));
    store.setState({ openPrVisible: true });
    void checkExistingPullRequest();
    setStatus(readyStatus());
    return "opened";
  } catch (error) {
    setStatus(githubFailure(error, "Could not load that draft"), { tone: "bad" });
    return "failed";
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
    const method = getSignInMethod();
    try {
      setGithubContext(await discoverGithubContext(token));
    } catch (error) {
      // A revoked sign-in is not "known": drop it. Anything else keeps what is on screen.
      if (dropRevokedToken(error)) setStatus(signInExpiredMessage(method), { tone: "bad" });
    }
  }
  // Also after a failure and when signed out: the local entries are always current.
  await renderResumeList();
  await entries;
}

/** A resume row was clicked: returns to the open scenario when it is that one, otherwise opens it. */
export async function resumeEntry(entry: WelcomeEntry): Promise<void> {
  const draft = entry.remote;
  if (draft) {
    await resumeDraft(draft);
    return;
  }
  // The scenario just left: its open copy is newer than the stored one, and has its PDF.
  if (isParkedPath(entry.path)) {
    await returnToParked();
    return;
  }
  if (!(await reopenLocalDraft(entry.path))) await renderResumeList();
}

/** A resume row was clicked: returns to the open scenario when it is that branch, otherwise opens the branch. */
export async function resumeDraft(draft: ResumableDraft): Promise<void> {
  // The scenario just left: its open copy is newer than the branch, and has its PDF.
  if (
    isParked() &&
    draft.texPath === store.getState().chosenPath &&
    (draft.kind === "edit") === Boolean(githubSaveState.edit)
  ) {
    await returnToParked();
    return;
  }
  await openResumableDraft(draft);
}

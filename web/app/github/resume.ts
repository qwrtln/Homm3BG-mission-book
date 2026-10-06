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
import { basenameNoExt, confirmDelete, readyStatus } from "../modules/dom.ts";
import { draftLabel } from "../modules/draft-labels.ts";
import { saveDraft } from "../modules/drafts.ts";
import { requireEditor } from "../modules/editor-api.ts";
import { loadEntries } from "../modules/entries.ts";
import { preloadFile } from "../modules/files.ts";
import { githubSaveState, resetGithubSaveState } from "../modules/github-save-state.ts";
import { setScenarioTitle } from "../modules/header.ts";
import { clearUploads, saveText } from "../modules/local-store.ts";
import { offerLocalDraft } from "../modules/recovery.ts";
import { reflectRoute } from "../modules/route.ts";
import { setStatus } from "../modules/status.ts";
import { resetUploads, restoreUploads } from "../modules/uploads.ts";
import { isParked, openForEdit, returnToParked, showWorkspace } from "../modules/workspace.ts";
import { clearPdf } from "../pdf/view.ts";
import { setResume, store } from "../store.ts";
import { dropRevokedToken, getGithubContext, githubFailure, SIGN_IN_EXPIRED, setGithubContext } from "./context.ts";
import { checkExistingPullRequest } from "./save.ts";

/** Shows the resume list from the signed-in user's own branches. */
export function renderResumeDrafts(): void {
  const drafts = getGithubContext()?.drafts || [];
  setResume({ visible: drafts.length > 0, searching: false, drafts });
}

/**
 * Asks, then deletes a work-in-progress branch and drops it from the list.
 * Cancelling the dialog changes nothing.
 */
export async function deleteResumableDraft(draft: ResumableDraft): Promise<void> {
  const token = getToken();
  const context = getGithubContext();
  if (!token || !context) return;
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
  setResume({ visible: true, searching: true, drafts: [] });
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

    await showWorkspace();
    store.setState({ actionsVisible: true });
    resetGithubSaveState();
    githubSaveState.edit = draft.kind === "edit" ? { startOver: false } : null;

    store.setState({ chosenPath: draft.texPath });
    const title = basenameNoExt(draft.texPath)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    setScenarioTitle(title);
    reflectRoute();
    store.setState({ buildDisabled: false, downloadDisabled: true }); // Build, or Stop mid-build: both apply

    const local = await offerLocalDraft(draft.texPath, title, content, assets);
    editor.setText(local ? local.text : content);
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

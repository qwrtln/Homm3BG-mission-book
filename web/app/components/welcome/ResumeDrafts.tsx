import { deleteResumableDraft, resumeDraft } from "../../github/resume.ts";
import { draftLabel, timeAgo } from "../../modules/draft-labels.ts";
import { useAppStore } from "../../store.ts";

/** The row's delete button icon (Primer's trash octicon). */
function TrashIcon() {
  return (
    <svg className="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  );
}

/** One branch of the member's own: a button that opens it, and one that deletes it. */
function ResumeRow({ draft }: { draft: ResumableDraft }) {
  const ago = timeAgo(draft.lastEdit);
  const detail = ago ? `${draft.branch}, last edit ${ago}` : draft.branch;
  const kind = draft.kind === "edit" ? "editing in place" : "new draft";
  const label = draftLabel(draft.texPath);

  return (
    <div className="resume-row">
      <button type="button" className="combobox-item" onClick={() => void resumeDraft(draft)}>
        {label}{" "}
        <span className="hint">
          ({kind}; {detail})
        </span>
      </button>
      <button
        type="button"
        className="resume-delete"
        aria-label={`Delete ${label}`}
        title="Delete this work in progress"
        onClick={() => void deleteResumableDraft(draft)}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

/** "Resume your work": the signed-in contributor's branches with unfinished edits, from the store. */
export function ResumeDrafts() {
  const { visible, searching, drafts } = useAppStore((s) => s.resume);

  return (
    <div className="resume-drafts" id="resume-drafts" hidden={!visible}>
      <h2>Resume your work</h2>
      <p className="hint" id="resume-loading" hidden={!searching}>
        <span className="spinner" /> Looking for work to resume…
      </p>
      <p className="hint" id="resume-hint" hidden={searching}>
        Branches of yours with unfinished edits.
      </p>
      <div className="combobox-list resume-list" id="resume-list">
        {drafts.map((draft) => (
          <ResumeRow key={draft.branch} draft={draft} />
        ))}
      </div>
    </div>
  );
}

import type { EntryState, WelcomeEntry } from "../../../shared/local-drafts.ts";
import { deleteResumeEntry, resumeEntry } from "../../github/resume.ts";
import { entryLabel, entryParts, timeAgo } from "../../modules/draft-labels.ts";
import { useAppStore } from "../../store.ts";
import { DeviceDesktopIcon, DeviceMobileIcon, MarkGithubIcon } from "../header/icons.tsx";

/** The row's delete button icon (Primer's trash octicon). */
function TrashIcon() {
  return (
    <svg className="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  );
}

/** Whether this device is a phone or tablet, by its pointer: a touch screen draws the phone. */
function onTouchDevice(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/** The states that ask for the contributor's attention, and how each reads. */
const ATTENTION_LABELS: Partial<Record<EntryState, string>> = {
  unsaved: "Unsaved changes in this browser",
  conflict: "Changed on GitHub and here",
};

/**
 * One scenario of the contributor's: a button that opens it, and one that
 * deletes it. The button reads the name, then where the text lives, whether
 * it edits a Mission Book scenario, and its age, then whether it is the
 * scenario left open behind the welcome screen and any state that needs
 * attention.
 */
function ResumeRow({ entry }: { entry: WelcomeEntry }) {
  const { path, remote, local } = entry;
  // A new scenario is the usual case and goes unsaid; an edit of a published one is named.
  const kind = path.startsWith("draft-scenarios/") ? null : "Mission Book edit";
  const ago = timeAgo(remote ? remote.lastEdit : (local?.updatedAt ?? undefined));
  const label = entryLabel(entry);
  const { title, mode } = entryParts(entry);
  const attention = ATTENTION_LABELS[entry.state];
  // The scenario left open behind the welcome screen: its row is the way back, with its PDF kept.
  const open = useAppStore((s) => s.parked && s.chosenPath === path);

  return (
    <div className="resume-row" data-open={open || undefined}>
      <button
        type="button"
        className="combobox-item text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        title={remote ? `Branch ${remote.branch}` : undefined}
        onClick={() => void resumeEntry(entry)}
      >
        <span className="resume-name text-body">
          {title}
          {mode && (
            <>
              {" "}
              <span className="resume-mode text-small">{mode}</span>
            </>
          )}
        </span>
        <span className="resume-meta text-small">
          {remote ? (
            <span className="resume-where on-github">
              <MarkGithubIcon />
              On GitHub
            </span>
          ) : (
            <span className="resume-where">
              {onTouchDevice() ? (
                <DeviceMobileIcon className="device-mobile" />
              ) : (
                <DeviceDesktopIcon className="device-desktop" />
              )}
              Local draft
            </span>
          )}
          {kind && ` · ${kind}`}
          {ago && ` · last edit ${ago}`}
        </span>
        {open && <span className="resume-state open text-small">Currently editing</span>}
        {attention && <span className="resume-state attention text-small">{attention}</span>}
      </button>
      <button
        type="button"
        className="resume-delete"
        aria-label={`Delete ${label}`}
        title="Delete this work in progress"
        onClick={() => void deleteResumeEntry(entry)}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

/** "Resume your work": the contributor's unfinished scenarios, on GitHub and in this browser, from the store. */
export function ResumeDrafts() {
  const { visible, searching, entries } = useAppStore((s) => s.resume);
  // A branch names its row; two branches can share a path. A row with no
  // branch is the only one for its path.
  const rows = entries.map((entry) => (
    <ResumeRow key={entry.remote ? `branch:${entry.remote.branch}` : `path:${entry.path}`} entry={entry} />
  ));

  return (
    <div className="resume-drafts" id="resume-drafts" hidden={!visible}>
      <h2 className="text-title">Resume your work</h2>
      <p className="hint text-small" id="resume-loading" hidden={!searching}>
        <span className="spinner" /> Looking for work to resume…
      </p>
      <p className="hint text-small" id="resume-hint" hidden={searching}>
        Your unfinished scenarios, on GitHub and in this browser.
      </p>
      <div className="combobox-list resume-list" id="resume-list">
        {rows}
      </div>
    </div>
  );
}

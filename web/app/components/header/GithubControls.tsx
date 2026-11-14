import { openPullRequest, saveToGithub } from "../../github/save.ts";
import { openDialog, useAppStore } from "../../store.ts";
import { Button, buttonClasses } from "../ui/Button.tsx";
import { FloppyIcon, GitPullRequestIcon, LinkExternalIcon, MarkGithubIcon } from "./icons.tsx";
import { LABEL, NARROW, PHONE_HIDDEN, SEGMENT } from "./narrow.ts";

/** The floppy on Save, with a dot at its corner while there are unsaved changes. */
function SaveIcon({ unsaved }: { unsaved: boolean }) {
  return (
    <span className="relative inline-flex">
      <FloppyIcon />
      {unsaved && (
        <span
          id="unsaved-note"
          aria-hidden="true"
          title="Unsaved changes"
          className="absolute -top-1 -right-1 size-2 rounded-full bg-warn"
        >
          <span className="sr-only">Unsaved changes</span>
        </span>
      )}
    </span>
  );
}

/**
 * Save and Open PR as one group, then the link that swaps in once a pull
 * request exists. At phone width Open PR moves into the overflow menu.
 */
function GithubStatus() {
  const scenarioOpen = useAppStore((s) => s.scenarioHeaderVisible);
  const saving = useAppStore((s) => s.saving);
  const openPrVisible = useAppStore((s) => s.openPrVisible);
  const openingPr = useAppStore((s) => s.openingPr);
  const prUrl = useAppStore((s) => s.prUrl);
  const unsaved = useAppStore((s) => s.dirty);

  return (
    <span id="github-status" className="flex items-center gap-2">
      {scenarioOpen && (
        <span className="inline-flex items-stretch">
          <Button
            id="github-save"
            variant="withIcon"
            size="compact"
            className={`${openPrVisible ? "rounded-r-none max-[640px]:rounded-r-sm" : ""} ${SEGMENT} ${NARROW}`}
            disabled={saving}
            aria-describedby={unsaved ? "unsaved-note" : undefined}
            onClick={() => void saveToGithub()}
          >
            <SaveIcon unsaved={unsaved} />
            <span className={LABEL}>Save</span>
          </Button>
          {openPrVisible && (
            <Button
              id="github-open-pr"
              variant="withIcon"
              size="compact"
              className={`-ml-px rounded-l-none ${SEGMENT} ${NARROW} ${PHONE_HIDDEN}`}
              disabled={openingPr}
              onClick={() => void openPullRequest()}
            >
              <GitPullRequestIcon />
              <span className={LABEL}>Open PR</span>
            </Button>
          )}
        </span>
      )}
      {prUrl !== null && (
        <a
          id="github-pr-link"
          href={prUrl}
          target="_blank"
          rel="noopener"
          className={`${buttonClasses({ variant: "withIcon", size: "compact" })} ${NARROW} no-underline hover:border-accent hover:text-accent`}
        >
          <GitPullRequestIcon />
          <span className={LABEL}>View PR</span>
          <LinkExternalIcon />
        </a>
      )}
    </span>
  );
}

/** Sign in with GitHub, or once signed in the save controls. Sign out lives in the overflow menu. */
export function GithubControls() {
  const signedIn = useAppStore((s) => s.signedIn);
  const scenarioOpen = useAppStore((s) => s.scenarioHeaderVisible);

  if (signedIn) return <GithubStatus />;
  return (
    <Button
      id="github-signin"
      variant="withIcon"
      size="compact"
      className={NARROW}
      onClick={() => openDialog("signin")}
    >
      <MarkGithubIcon />
      <span className={LABEL}>{scenarioOpen ? "Sign in to save" : "Sign in with GitHub"}</span>
    </Button>
  );
}

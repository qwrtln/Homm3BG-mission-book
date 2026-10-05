import { openPullRequest, saveToGithub } from "../../github/save.ts";
import { startSignIn } from "../../github/session.ts";
import { returnToParked } from "../../modules/workspace.js";
import { useAppStore } from "../../store.ts";
import { Button, buttonClasses } from "../ui/Button.tsx";
import { GitPullRequestIcon, LinkExternalIcon, MarkGithubIcon, PencilIcon, UploadIcon } from "./icons.tsx";
import { LABEL, NARROW, SEGMENT } from "./narrow.ts";

/** The way back to a scenario left open behind the welcome screen: Primer's attention colors, louder than a plain button, quieter than the green primary. */
export function BackToEditing() {
  const title = useAppStore((s) => `Back to editing “${s.chosenTitle}”`);

  return (
    <Button
      id="back-to-editing"
      variant="attention"
      size="compact"
      iconed
      className={NARROW}
      title={title}
      aria-label={title}
      onClick={() => void returnToParked()}
    >
      <PencilIcon />
      <span className={LABEL}>Back to editing</span>
    </Button>
  );
}

/** Save and Open PR as one group, then the link that swaps in once a pull request exists. */
function GithubStatus() {
  const scenarioOpen = useAppStore((s) => s.scenarioHeaderVisible);
  const saving = useAppStore((s) => s.saving);
  const openPrVisible = useAppStore((s) => s.openPrVisible);
  const openingPr = useAppStore((s) => s.openingPr);
  const prUrl = useAppStore((s) => s.prUrl);

  return (
    <span id="github-status" className="flex items-center gap-2">
      {scenarioOpen && (
        <span className="inline-flex items-stretch">
          <Button
            id="github-save"
            variant="withIcon"
            size="compact"
            className={`${openPrVisible ? "rounded-r-none" : ""} ${SEGMENT} ${NARROW}`}
            disabled={saving}
            onClick={() => void saveToGithub()}
          >
            <UploadIcon />
            <span className={LABEL}>Save</span>
          </Button>
          {openPrVisible && (
            <Button
              id="github-open-pr"
              variant="withIcon"
              size="compact"
              className={`-ml-px rounded-l-none ${SEGMENT} ${NARROW}`}
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
    <Button id="github-signin" variant="withIcon" size="compact" className={NARROW} onClick={() => void startSignIn()}>
      <MarkGithubIcon />
      <span className={LABEL}>{scenarioOpen ? "Sign in to save" : "Sign in with GitHub"}</span>
    </Button>
  );
}

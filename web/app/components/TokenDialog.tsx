import { type FormEvent, useState } from "react";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.ts";
import { TOKEN_TEMPLATE_URL } from "../../shared/token-template.ts";
import { signInWithToken } from "../github/session.ts";
import { dialogClosed, useAppStore } from "../store.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";
import { InlineCode, withInlineCode } from "./ui/InlineCode.tsx";
import { Link } from "./ui/Link.tsx";

const FORK_URL = `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/fork`;

/** Why the sign-in failed, as the user reads it. */
function failureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Could not sign in with this token. Try again.";
}

/**
 * Sign-in by pasted token: the steps that lead to a fork and a narrowly scoped
 * token, then the paste field. A failure stays in the dialog, with the typed
 * value kept.
 */
export function TokenDialog() {
  const open = useAppStore((state) => state.dialogs.token);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** A dismissed dialog forgets the typed token and the last error. */
  function close(): void {
    setToken("");
    setError(null);
    dialogClosed("token");
  }

  async function submit(event: FormEvent): Promise<void> {
    // The dialog's form is method="dialog": without this, a submit would close it.
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithToken(token);
      setToken("");
      dialogClosed("token");
    } catch (thrown) {
      setError(failureMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog id="token-dialog" labelledBy="token-title" size="md" open={open} onClose={close}>
      <DialogTitle id="token-title">Sign in with a fine-grained token</DialogTitle>
      <ol className="mb-3 list-decimal space-y-2 pl-5">
        <li>
          <Link id="token-fork-link" href={FORK_URL} external>
            Fork the repository
          </Link>{" "}
          and keep the name <InlineCode>{UPSTREAM_REPO}</InlineCode>. Skip this if you already have a fork.
        </li>
        <li>
          <Link id="token-create-link" href={TOKEN_TEMPLATE_URL} external>
            Create a token
          </Link>{" "}
          on GitHub. The form is already filled in. We recommend keeping the 7-day expiry.
        </li>
        <li>Under "Repository access", choose "Only select repositories" and pick your fork.</li>
        <li>Generate the token, copy it, and paste it below.</li>
      </ol>
      <label htmlFor="token-input" className="mb-1 block font-semibold">
        Token
      </label>
      <input
        id="token-input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={token}
        disabled={busy}
        onChange={(event) => setToken(event.target.value)}
        aria-describedby={error ? "token-error" : undefined}
        className="w-full rounded-sm border border-line bg-panel px-3 py-2 font-mono text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {error && (
        <p id="token-error" role="alert" className="mt-2 text-bad">
          {withInlineCode(error)}
        </p>
      )}
      <p className="mt-3 text-small text-muted">
        Plain sign-out keeps the token. To end it, choose "Sign out and revoke token" in the menu, or delete it on
        github.com.
      </p>
      <DialogActions>
        {/* type="button": a submit here would be the form's default button, so Enter in the field would cancel. */}
        <Button id="token-cancel" type="button" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          id="token-submit"
          type="submit"
          variant="primary"
          disabled={busy}
          onClick={(event) => void submit(event)}
        >
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

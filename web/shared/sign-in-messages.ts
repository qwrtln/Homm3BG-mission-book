import type { SignInMethod } from "./github-auth.ts";
import { GithubApiError } from "./github-contrib.ts";

/** What to tell the user when GitHub answers 401, by how they signed in. */
export function signInExpiredMessage(method: SignInMethod): string {
  return method === "token"
    ? "Your GitHub token has expired or was revoked. Sign in with a new token."
    : "Your GitHub sign-in has expired. Sign in again.";
}

/**
 * The message for a failed GitHub call that is not a revoked sign-in, or null
 * when the error's own message should stand. Only a token sign-in changes it:
 * a 403 there means the token lacks write access to the fork.
 *
 * @param owner the account that owns the fork
 */
export function tokenSaveFailureMessage(error: unknown, method: SignInMethod, owner: string): string | null {
  if (method !== "token" || !(error instanceof GithubApiError) || error.status !== 403) return null;
  return `Your token cannot write to your fork. Give it Contents: Read and write on ${owner}/Homm3BG-mission-book, or sign in with a new token.`;
}

// GitHub's token endpoint sends no CORS headers, so the code-for-token
// exchange runs through a Cloudflare Pages Function relay, which holds the
// OAuth App's client secret. This module only ever sees the token it returns.
const CLIENT_ID = "Ov23liJjzuIkBg8C249t";
const RELAY_URL = "https://mission-book-oauth-relay.pages.dev/api/callback";
const SCOPE = "public_repo";
const TOKEN_KEY = "github_token";
const METHOD_KEY = "wasm-scenario-builder:sign-in-method";

/** How the stored token was obtained: GitHub's OAuth redirect, or a token the user pasted. */
export type SignInMethod = "oauth" | "token";

/** @returns the stored token, or null when signed out */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Stores a token together with how it was obtained. */
export function storeToken(token: string, method: SignInMethod): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(METHOD_KEY, method);
}

/** @returns how the stored token was obtained; a missing key reads as "oauth", so older sign-ins keep working */
export function getSignInMethod(): SignInMethod {
  return localStorage.getItem(METHOD_KEY) === "token" ? "token" : "oauth";
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(METHOD_KEY);
}

/**
 * Asks GitHub to revoke a token for good. The endpoint refuses an
 * authenticated request, so the token travels only in the body. GitHub
 * answers 202 and revokes shortly after, then emails the owner.
 *
 * @returns true when GitHub accepted the request
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/credentials/revoke", {
      method: "POST",
      headers: { accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify({ credentials: [token] }),
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

/** @returns this page's URL with query and fragment stripped */
function currentUrlWithoutQuery(): string {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

/** Leaves the page: a full-page redirect to GitHub's authorize screen. */
export function signIn(): void {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: currentUrlWithoutQuery(),
    scope: SCOPE,
  });
  location.href = `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * If GitHub just redirected back with `?code=`, trades it for a token and
 * strips code/state from the URL.
 *
 * A code is single-use, so an address reopened from history or a bookmark
 * carries one that no longer trades. When a token is already stored, that
 * failure is not a failed sign-in: the stored token is kept and returned.
 *
 * @returns the token, or null if signed out
 */
export async function completeSignIn(): Promise<string | null> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (!code) return getToken();

  // Stripped first, so neither a failed exchange nor a reload trades the same code again.
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState({}, "", url.pathname + url.search + url.hash);

  const stored = getToken();
  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!data.access_token) {
      throw new Error(data.error_description || data.error || "GitHub sign-in failed.");
    }
    storeToken(data.access_token, "oauth");
    return data.access_token;
  } catch (error) {
    if (stored) return stored;
    throw error;
  }
}

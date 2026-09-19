// GitHub's token endpoint sends no CORS headers, so the code-for-token
// exchange runs through a Cloudflare Pages Function relay, which holds the
// OAuth App's client secret. This module only ever sees the token it returns.
const CLIENT_ID = "Ov23liJjzuIkBg8C249t";
const RELAY_URL = "https://mission-book-oauth-relay.pages.dev/api/callback";
const SCOPE = "public_repo";
const TOKEN_KEY = "github_token";

/** @returns {string | null} the stored token, or null when signed out */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** @returns {void} */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** @returns {string} this page's URL with query and fragment stripped */
function currentUrlWithoutQuery() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

/** Leaves the page: a full-page redirect to GitHub's authorize screen.
 * @returns {void} */
export function signIn() {
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
 * @returns {Promise<string | null>} the token, or null if signed out
 */
export async function completeSignIn() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (!code) return getToken();

  const response = await fetch(RELAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = /** @type {{access_token?: string, error?: string, error_description?: string}} */ (
    await response.json()
  );

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState({}, "", url.pathname + url.search + url.hash);

  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub sign-in failed.");
  }
  localStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
}

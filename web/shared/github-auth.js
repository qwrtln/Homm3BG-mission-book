// GitHub OAuth sign-in for the scenario-builder app (ticket 04 of
// .scratch/scenario-builder-github-contrib/map.md).
//
// This page redirects to GitHub's web application flow. GitHub redirects
// back with `?code=`, and this module trades that code for a token through
// the Cloudflare Pages Function relay at RELAY_URL (ticket 01's finding:
// GitHub's own token endpoint sends no CORS headers to a browser, so a
// server-side call is required either way). The relay holds the OAuth
// App's client secret (ticket 03); this module only ever sees the token it
// returns.
const CLIENT_ID = "Ov23liJjzuIkBg8C249t";
const RELAY_URL = "https://mission-book-oauth-relay.pages.dev/api/callback";
const SCOPE = "public_repo";
const TOKEN_KEY = "github_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Ticket 08 (sign-out) calls this to clear the stored token.
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function currentUrlWithoutQuery() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

export function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: currentUrlWithoutQuery(),
    scope: SCOPE,
  });
  location.href = `https://github.com/login/oauth/authorize?${params}`;
}

// Runs once at page load. If GitHub just redirected back with a `code`,
// this trades it for a token through the relay, stores the token, and
// strips `code`/`state` from the URL so a page refresh cannot resend them.
// Returns the current token, or null if the user is not signed in.
export async function completeSignIn() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (!code) return getToken();

  const response = await fetch(RELAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState({}, "", url.pathname + url.search + url.hash);

  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub sign-in failed.");
  }
  localStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
}

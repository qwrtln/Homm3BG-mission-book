// The token-exchange endpoint for the scenario-builder app's GitHub sign-in
// (ticket 04 of .scratch/scenario-builder-github-contrib/map.md).
//
// GitHub's own token endpoint, https://github.com/login/oauth/access_token,
// sends no CORS headers, so the app's page cannot call it directly (ticket
// 01). This function is the one small server-side piece that can: it holds
// the OAuth App's client secret and makes that call on the app's behalf.
//
// Deployed as its own Cloudflare Pages project, separate from the app's
// GitHub Pages hosting (ticket 02: project "mission-book-oauth-relay").
// GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set on that project's
// dashboard, under Settings, Environment variables (ticket 03); the secret
// is a "Secret" binding, never committed here.
const ALLOWED_ORIGIN = "https://qwrtln.github.io";

export async function onRequestPost(context) {
  const { request, env } = context;

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    code = undefined;
  }
  if (!code) {
    return jsonResponse({ error: "missing code" }, 400);
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "mission-book-oauth-relay",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResponse.json();
  return jsonResponse(tokenData, tokenResponse.status);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": ALLOWED_ORIGIN,
    },
  });
}

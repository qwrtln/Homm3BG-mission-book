// GitHub's token endpoint sends no CORS headers, so the app's page cannot
// call it directly. This holds the OAuth App's client secret and makes
// that call server-side. GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET are set as
// Cloudflare Pages env vars, never committed here.
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

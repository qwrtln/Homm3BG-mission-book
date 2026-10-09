import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { revokeToken } from "../../shared/github-auth.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stubs fetch with one answer and records the single request it gets. */
function stubFetch(answer: () => Response): { url?: string; init?: RequestInit } {
  const seen: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return answer();
  }) as typeof fetch;
  return seen;
}

test("revokeToken posts the token in the body, with no Authorization header", async () => {
  const seen = stubFetch(() => new Response(null, { status: 202 }));
  assert.equal(await revokeToken("github_pat_x"), true);
  assert.equal(seen.url, "https://api.github.com/credentials/revoke");
  assert.equal(seen.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(seen.init?.body)), { credentials: ["github_pat_x"] });
  const headers = new Headers(seen.init?.headers);
  assert.equal(headers.has("authorization"), false);
});

test("revokeToken reports a refused request", async () => {
  stubFetch(() => new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }));
  assert.equal(await revokeToken("github_pat_x"), false);
});

test("revokeToken reports a network error", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  assert.equal(await revokeToken("github_pat_x"), false);
});

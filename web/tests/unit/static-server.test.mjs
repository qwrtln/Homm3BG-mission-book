// Tier 1 tests for web/tests/driver/static-server.mjs, the server behind
// web/serve.sh and the tier 2 suite.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startStaticServer } from "../driver/static-server.mjs";

/** @type {import("../driver/static-server.mjs").StaticServer} */
let server;

before(async () => {
  server = await startStaticServer();
});

after(async () => {
  await server.close();
});

/**
 * @param {string} path
 * @returns {Promise<Response>}
 */
function get(path) {
  return fetch(`${server.origin}${path}`, { redirect: "manual" });
}

test("a directory without its trailing slash redirects to it, keeping the query", async () => {
  const response = await get("/web/app?code=1");
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/web/app/?code=1");
});

test("a directory with its trailing slash serves its index.html", async () => {
  const response = await get("/web/app/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
});

test("the page's relative stylesheets and scripts resolve", async () => {
  for (const path of ["/web/app/styles/base.css", "/web/app/app.js"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
  }
});

test("every response carries the headers the engine needs", async () => {
  const response = await get("/web/app/");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
});

test("/web/repo/ maps to the repository root", async () => {
  const response = await get("/web/repo/metadata.tex");
  assert.equal(response.status, 200);
});

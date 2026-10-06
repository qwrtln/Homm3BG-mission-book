// Tier 1 tests for web/tests/driver/static-server.ts, the server behind the
// tier 2 suite. /web/app/ is served from a directory of its own here, so the
// tests need no build.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { type StaticServer, startStaticServer } from "../driver/static-server.ts";

let server: StaticServer;
let appRoot: string;

before(async () => {
  appRoot = await mkdtemp(join(tmpdir(), "static-server-"));
  await mkdir(join(appRoot, "assets"));
  await writeFile(join(appRoot, "index.html"), "<!doctype html><title>app</title>\n");
  await writeFile(join(appRoot, "assets", "index-abc123.js"), "export {};\n");
  server = await startStaticServer({ appRoot });
});

after(async () => {
  await server.close();
  await rm(appRoot, { recursive: true, force: true });
});

function get(path: string): Promise<Response> {
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

test("/web/app/ maps to the build output", async () => {
  const response = await get("/web/app/assets/index-abc123.js");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "export {};\n");
});

test("a path that climbs out of the build output is refused", async () => {
  const response = await get("/web/app/..%2Fpackage.json");
  assert.equal(response.status, 403);
});

test("the rest of web/ is served where it sits, for the page's ../ URLs", async () => {
  const response = await get("/web/shared/vendor/texlyre-busytex.js");
  assert.equal(response.status, 200);
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

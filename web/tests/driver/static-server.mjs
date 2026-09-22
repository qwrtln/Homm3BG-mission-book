// Static file server for tier-2 tests, replacing prototype-engine-check's
// serve.py. Reproduces its behaviour exactly: the same headers, the same
// /web/repo alias, the same cache policy for engine payloads.
//
// No dependencies. node:http only.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

// web/tests/driver/static-server.mjs -> repository root is three levels up.
const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".tex": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
};

/**
 * Resolve a request path against the repository root, applying the
 * /web/repo alias and rejecting any path that escapes the root.
 * @param {string} requestPath - the raw pathname portion of the request URL.
 * @returns {string | null} an absolute filesystem path inside the repository
 *   root, or null if the resolved path would escape it.
 */
function resolveRequestPath(requestPath) {
  let path = requestPath;
  const prefix = "/web/repo/";
  if (path === "/web/repo") {
    path = "/";
  } else if (path.startsWith(prefix)) {
    path = `/${path.slice(prefix.length)}`;
  }

  const decoded = decodeURIComponent(path.split("?")[0].split("#")[0]);
  const resolved = normalize(join(REPO_ROOT, `.${decoded}`));
  if (resolved !== REPO_ROOT && !resolved.startsWith(REPO_ROOT + sep)) {
    return null;
  }
  return resolved;
}

/**
 * Determine whether a request path is for the engine payload, which alone
 * may be cached.
 * @param {string} requestPath - the raw pathname portion of the request URL.
 * @returns {boolean} true if the response may carry a long cache lifetime.
 */
function isCacheable(requestPath) {
  return requestPath.endsWith(".data") ||
    requestPath.endsWith(".wasm") ||
    requestPath.includes("/busytex/");
}

/**
 * @typedef {object} StaticServer
 * @property {string} origin - base URL of the running server, e.g.
 *   "http://127.0.0.1:41234".
 * @property {number} port - the TCP port the server is bound to.
 * @property {() => Promise<void>} close - stop the server and release the
 *   port.
 */

/**
 * Start a static file server over the repository root, reproducing
 * serve.py's headers, cache policy and /web/repo alias.
 * @param {{ port?: number }} [options] - port to bind, defaulting to 0 (let
 *   the OS pick a free port).
 * @returns {Promise<StaticServer>} the running server.
 */
export async function startStaticServer(options = {}) {
  const requestedPort = options.port ?? 0;

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end(`Internal error: ${error?.message || error}`);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(undefined);
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    port,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    }),
  };
}

/**
 * Serve a single HTTP request from the repository root.
 * @param {import("node:http").IncomingMessage} req - the incoming request.
 * @param {import("node:http").ServerResponse} res - the response to write.
 * @returns {Promise<void>} resolves once the response has ended.
 */
async function handleRequest(req, res) {
  const requestPath = req.url || "/";
  const resolved = resolveRequestPath(requestPath);

  const headers = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cache-Control": isCacheable(requestPath) ? "public, max-age=3600" : "no-store",
  };

  if (resolved === null) {
    res.writeHead(403, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let filePath = resolved;
  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    res.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  let body;
  try {
    body = await readFile(filePath);
  } catch {
    res.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { ...headers, "Content-Type": contentType });
  res.end(body);
}

// Static file server for the tier-2 tests: COOP/COEP headers, the /web/repo
// alias, /web/app/ mapped to the build output (web/dist/), and a cache policy
// for engine payloads. The rest of web/ (shared/, core/) is served from where
// it sits, which is where the page's ../ URLs land.
//
// No dependencies. node:http only.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

// web/tests/driver/static-server.mjs -> repository root is three levels up.
const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

/** Where the app is built to: the files /web/app/ serves. */
const DEFAULT_APP_ROOT = join(REPO_ROOT, "web", "dist");

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
 * /web/repo alias and the /web/app/ mapping to the build output, and
 * rejecting any path that escapes its root.
 * @param {string} requestPath - the raw pathname portion of the request URL.
 * @param {string} appRoot - the directory /web/app/ is served from.
 * @returns {string | null} an absolute filesystem path inside the repository
 *   root or the app root, or null if the resolved path would escape it.
 */
function resolveRequestPath(requestPath, appRoot) {
  let path = requestPath;
  let root = REPO_ROOT;
  const prefix = "/web/repo/";
  if (path === "/web/repo") {
    path = "/";
  } else if (path.startsWith(prefix)) {
    path = `/${path.slice(prefix.length)}`;
  } else if (path === "/web/app" || path.startsWith("/web/app/") || path.startsWith("/web/app?")) {
    root = appRoot;
    path = path.slice("/web/app".length) || "/";
  }

  const decoded = decodeURIComponent(path.split("?")[0].split("#")[0]);
  const resolved = normalize(join(root, `.${decoded}`));
  if (resolved !== root && !resolved.startsWith(root + sep)) {
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
  return requestPath.endsWith(".data") || requestPath.endsWith(".wasm") || requestPath.includes("/busytex/");
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
 * Start a static file server over the repository root, with the app's
 * headers, cache policy and /web/repo alias, and /web/app/ served from the
 * build output.
 * @param {{ port?: number, appRoot?: string }} [options] - port to bind,
 *   defaulting to 0 (let the OS pick a free port); and the directory
 *   /web/app/ is served from, defaulting to web/dist/.
 * @returns {Promise<StaticServer>} the running server.
 */
export async function startStaticServer(options = {}) {
  const requestedPort = options.port ?? 0;
  const appRoot = options.appRoot ?? DEFAULT_APP_ROOT;

  const server = createServer((req, res) => {
    handleRequest(req, res, appRoot).catch((error) => {
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
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  };
}

/**
 * Serve a single HTTP request from the repository root.
 * @param {import("node:http").IncomingMessage} req - the incoming request.
 * @param {import("node:http").ServerResponse} res - the response to write.
 * @param {string} appRoot - the directory /web/app/ is served from.
 * @returns {Promise<void>} resolves once the response has ended.
 */
async function handleRequest(req, res, appRoot) {
  const requestPath = req.url || "/";
  const resolved = resolveRequestPath(requestPath, appRoot);

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
      // Without the trailing slash, the page's relative URLs resolve one
      // level up and every stylesheet and script 404s.
      const url = new URL(requestPath, "http://localhost");
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { ...headers, Location: `${url.pathname}/${url.search}` });
        res.end();
        return;
      }
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

// Playwright request interception for tier-2 tests. Installs two independent
// stubs on a page:
//
//   - installEngineStub:  replaces the vendored BusyTeX wrapper with
//     texlyre-busytex-stub.js, so no WASM engine and no texlive-*.data ever
//     load in a browser test.
//   - installGithubStub:  replaces api.github.com calls with canned
//     responses, so no test makes a real network call to GitHub.
//
// Each stub registers its own page.route(); Playwright dispatches routes in
// registration order and lets each handler decide whether to fulfill or fall
// through, so no shared router, no Fetch.enable, and no manual continue are
// needed.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const STUB_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_STUB_PATH = join(STUB_DIR, "texlyre-busytex-stub.js");

/**
 * @typedef {object} GithubRoute
 * @property {string} [method] - HTTP method to match, case-insensitive.
 *   Omit to match any method.
 * @property {string | RegExp} path - matched against the request URL's
 *   pathname (and query string, for a RegExp). A string must match exactly.
 * @property {number} [status] - HTTP status to respond with. Defaults to 200.
 * @property {unknown} [body] - response body. A non-string value is
 *   JSON-serialized; a string is sent as-is.
 * @property {Promise<unknown>} [hold] - the response waits until this
 *   settles, so a test can observe the in-flight state and release it.
 * @property {Record<string, string>} [headers] - extra response headers.
 *   "Content-Type" defaults to "application/json" for a non-string body and
 *   "text/plain" for a string body.
 */

/**
 * Installs interception for the vendored BusyTeX engine wrapper: any
 * request whose URL path ends in "/shared/vendor/texlyre-busytex.js" is
 * fulfilled with the contents of texlyre-busytex-stub.js instead of the
 * real file, so no WASM engine and no texlive-*.data ever load.
 * @param {import("@playwright/test").Page} page - the page to install the
 *   stub on.
 * @returns {Promise<void>} resolves once interception is active.
 */
export async function installEngineStub(page) {
  const stubSource = await readFile(ENGINE_STUB_PATH, "utf8");

  await page.route(
    (url) => url.pathname.endsWith("/shared/vendor/texlyre-busytex.js"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: stubSource,
      });
    },
  );
}

/**
 * Installs interception for api.github.com: matching requests are fulfilled
 * from `routes` (first match wins); an unmatched api.github.com request is
 * fulfilled with a loud 599 instead of reaching the real API.
 * @param {import("@playwright/test").Page} page - the page to install the
 *   stub on.
 * @param {GithubRoute[]} routes - ordered list of routes to match against.
 * @returns {Promise<void>} resolves once interception is active.
 */
export async function installGithubStub(page, routes) {
  await page.route(
    (url) => url.hostname === "api.github.com",
    async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const url = new URL(request.url());
      const match = routes.find((candidate) => matchesRoute(candidate, method, url));

      if (match) {
        const { status, headers, body } = renderRoute(match);
        if (match.hold) await match.hold;
        await route.fulfill({ status, headers, body });
        return;
      }

      const diagnostic = `Unstubbed GitHub API request: ${method} ${url.href}`;
      await route.fulfill({
        status: 599,
        contentType: "text/plain",
        body: diagnostic,
      });
    },
  );
}

/**
 * Checks whether a route matches a paused request's method and URL.
 * @param {GithubRoute} route - the candidate route.
 * @param {string} method - the request's HTTP method, upper-cased.
 * @param {URL} url - the request's parsed URL.
 * @returns {boolean} true if the route matches.
 */
function matchesRoute(route, method, url) {
  if (route.method && route.method.toUpperCase() !== method) return false;
  if (typeof route.path === "string") {
    return url.pathname === route.path;
  }
  return route.path.test(url.pathname + url.search);
}

/**
 * Renders a matched route into the fields route.fulfill needs.
 * @param {GithubRoute} route - the matched route.
 * @returns {{status: number, headers: Record<string, string>, body: string}}
 *   the response to send back.
 */
function renderRoute(route) {
  const status = route.status ?? 200;
  const isStringBody = typeof route.body === "string";
  const body = isStringBody ? /** @type {string} */ (route.body) : JSON.stringify(route.body ?? null);
  const contentType = isStringBody ? "text/plain" : "application/json";
  const headers = { "Content-Type": contentType, ...(route.headers ?? {}) };
  return { status, headers, body };
}

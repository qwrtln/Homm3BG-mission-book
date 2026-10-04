// Tier 1 check that every license the About dialog offers is a file the
// deploy ships.
//
// The dialog loads each license from a data-src relative to web/app/. The
// integration server serves the whole repository, so a file left off the
// allow-list in publish-docs.yaml would pass tier 2 and 404 on the live site.
// pdf.js and CodeMirror live under app/vendor/, which web/fetch-vendor.sh
// fetches rather than the repository committing; tier 1 runs offline, before
// any fetch, so those licenses are not yet on disk and are recognized by name
// instead.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";

import { readRepoFile, repoRoot } from "../helpers/repo.mjs";

/** Each license row's data-src, resolved to a path under web/. */
function licensePaths() {
  const html = readRepoFile("web/app/index.html");
  const sources = [...html.matchAll(/<details class="license" data-src="([^"]+)"/g)].map((match) => match[1]);
  return sources.map((src) => posix.normalize(posix.join("app", src)));
}

/**
 * The web/-relative paths web/fetch-vendor.sh writes under app/vendor/, read
 * from its literal "<lib>/<path>" destination strings.
 *
 * @returns {Set<string>}
 */
function fetchedVendorPaths() {
  const script = readRepoFile("web/fetch-vendor.sh");
  const destinations = [...script.matchAll(/"((?:pdfjs|codemirror|client-zip)\/[^"]+)"/g)].map((match) => match[1]);
  return new Set(destinations.map((dest) => posix.join("app", "vendor", dest)));
}

/**
 * The rsync --include patterns of the step that copies web/ into the site,
 * plus "app/***" when that step copies the whole of web/app/ to site/builder/.
 */
function deployIncludes() {
  const workflow = readRepoFile(".github/workflows/publish-docs.yaml");
  const patterns = [...workflow.matchAll(/--include='\/([^']+)'/g)].map((match) => match[1]);
  if (/rsync -a web\/app\/ site\/builder\//.test(workflow)) patterns.push("app/***");
  return patterns;
}

/**
 * Whether an rsync include pattern lets a web/-relative file through: an
 * exact path, or a directory ending in "/***".
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
function includes(pattern, path) {
  if (pattern.endsWith("/***")) return path.startsWith(pattern.slice(0, -3));
  return pattern === path;
}

test("the About dialog lists at least one license per group", () => {
  assert.ok(licensePaths().length >= 5, "found fewer license rows than the dialog has");
});

for (const path of licensePaths()) {
  test(`${path} exists and the deploy ships it`, () => {
    assert.ok(!path.startsWith(".."), `${path} points outside web/`);
    assert.ok(
      existsSync(join(repoRoot, "web", path)) || fetchedVendorPaths().has(path),
      `web/${path} does not exist and fetch-vendor.sh does not fetch it`,
    );
    assert.ok(
      deployIncludes().some((pattern) => includes(pattern, path)),
      `web/${path} is missing from the allow-list in publish-docs.yaml`,
    );
  });
}

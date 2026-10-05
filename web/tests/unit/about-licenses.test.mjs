// Tier 1 check that every license the About dialog offers is a file the
// deploy ships, and that the build lists the bundled npm packages' licenses.
//
// The dialog loads each static row's license from a src relative to the
// page, which the deploy serves as site/builder/. The integration server
// serves the whole repository, so a file left off the allow-list in
// publish-docs.yaml would pass tier 2 and 404 on the live site. Packages in
// the bundle need no row: vite.config.ts writes their notices to licenses.json
// and the dialog reads them. CodeMirror 5 lives under app/vendor/, which
// web/fetch-vendor.sh fetches and vite.config.ts copies into the build; tier 1
// runs offline, before any fetch, so its license is not yet on disk and is
// recognized by name instead.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";

import { readRepoFile, repoRoot } from "../helpers/repo.mjs";

/** Each static license row's src in components/licenses.ts, resolved to a path under web/. */
function licensePaths() {
  const source = readRepoFile("web/app/components/licenses.ts");
  const sources = [...source.matchAll(/\bsrc: "([^"]+)"/g)].map((match) => match[1]);
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
  const destinations = [...script.matchAll(/"(codemirror\/[^"]+)"/g)].map((match) => match[1]);
  return new Set(destinations.map((dest) => posix.join("app", "vendor", dest)));
}

/**
 * The rsync --include patterns of the step that copies web/ into the site.
 *
 * @returns {string[]}
 */
function deployIncludes() {
  const workflow = readRepoFile(".github/workflows/publish-docs.yaml");
  return [...workflow.matchAll(/--include='\/([^']+)'/g)].map((match) => match[1]);
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

test("the About dialog lists at least one static license per group", () => {
  assert.ok(licensePaths().length >= 4, "found fewer license rows than the dialog has");
});

for (const path of licensePaths()) {
  test(`${path} exists and the deploy ships it`, () => {
    assert.ok(!path.startsWith(".."), `${path} points outside web/`);
    if (path.startsWith("app/")) {
      // Inside the page's own directory: the build puts it there.
      assert.ok(
        existsSync(join(repoRoot, "web", path)) || fetchedVendorPaths().has(path),
        `web/${path} does not exist and fetch-vendor.sh does not fetch it`,
      );
      assert.match(
        readRepoFile("web/vite.config.ts"),
        /join\(WEB, "app", "vendor", "codemirror"\)/,
        "vite.config.ts does not copy the fetched CodeMirror files into the build",
      );
      return;
    }
    assert.ok(existsSync(join(repoRoot, "web", path)), `web/${path} does not exist`);
    assert.ok(
      deployIncludes().some((pattern) => includes(pattern, path)),
      `web/${path} is missing from the allow-list in publish-docs.yaml`,
    );
  });
}

test("the build emits the notices the About dialog reads", () => {
  const config = readRepoFile("web/vite.config.ts");
  assert.match(config, /const NOTICES_FILE = "licenses\.json"/);
  assert.match(config, /emitFile\(\{[^}]*fileName: NOTICES_FILE/s, "vite.config.ts does not emit the notices file");
  assert.match(readRepoFile("web/app/components/AboutDialog.tsx"), /new URL\("licenses\.json"/);
});

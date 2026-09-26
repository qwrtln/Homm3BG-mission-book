#!/usr/bin/env node
// Builds web/shared/texmf/carried-texmf.bin: the TeX Live files the book
// reads that texlive-basic, the data package the app preloads, lacks. Run by
// hand; its outputs are committed. Nothing here runs in the browser or at
// deploy time.
//
// Inputs:
//   texmf/carried.txt        the manifest: which files, from where, and why
//   texmf/ctan/              files no data package ships (fetch-missing-texmf.sh)
//   web/core/busytex/        the engine release (web/serve.sh fetches it)
// Outputs:
//   texmf/carried-texmf.bin  gzipped bundle the app fetches in one request
//   texmf/carried.lock.json  engine version, and name, source, size and
//                            SHA-256 of every bundled file. Review this diff.
//
// Rebuild after bumping BUSYTEX_ENGINE_VERSION in web/vendor.env, or after
// editing carried.txt. Tier 1 fails until you do: it checks the lock against
// vendor.env, the manifest and the bundle.
//
//   web/serve.sh                                # fetch the engine, once
//   node web/shared/carry-texmf.mjs build
//
// To find what a changed book needs, build scenarios locally with
// `./run.sh tools/build.sh -s <name>` (its -recorder writes <name>.fls), then:
//
//   node web/shared/carry-texmf.mjs resolve *.fls
//
// It prints manifest lines for files the book reads that texlive-basic lacks
// and carried.txt does not list yet. Paste them into carried.txt under a
// comment saying why, then build.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  carriedName,
  packBundle,
  packedPath,
  parseCarryManifest,
  parseDataPackage,
  planCarry,
  recorderInputs,
  unpackFile,
} from "./texmf-carry.js";

const shared = dirname(fileURLToPath(import.meta.url));
const texmf = join(shared, "texmf");
const engine = join(shared, "..", "core", "busytex");
const manifestPath = join(texmf, "carried.txt");
const bundlePath = join(texmf, "carried-texmf.bin");
const lockPath = join(texmf, "carried.lock.json");

/** @returns {string} BUSYTEX_ENGINE_VERSION from web/vendor.env */
function pinnedEngine() {
  const env = readFileSync(join(shared, "..", "vendor.env"), "utf8");
  const match = /^BUSYTEX_ENGINE_VERSION=(.+)$/m.exec(env);
  if (!match) throw new Error("web/vendor.env has no BUSYTEX_ENGINE_VERSION.");
  return match[1].trim();
}

/** Fails unless web/core/busytex/ holds the pinned release. */
function requireEngine() {
  const want = pinnedEngine();
  const stamp = join(engine, ".version");
  const have = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "none";
  if (have !== want) {
    throw new Error(`web/core/busytex/ holds engine ${have}, vendor.env pins ${want}. Run web/serve.sh first.`);
  }
  return want;
}

/** @param {string} name data package name, e.g. texlive-extra */
function loadPackage(name) {
  return parseDataPackage(readFileSync(join(engine, `${name}.js`), "utf8"));
}

function build() {
  const version = requireEngine();
  const entries = parseCarryManifest(readFileSync(manifestPath, "utf8"));
  const extra = loadPackage("texlive-extra");
  const extraData = new Uint8Array(readFileSync(join(engine, "texlive-extra.data")));
  const basic = loadPackage("texlive-basic");

  const files = entries.map((entry) => {
    if (entry.source === "ctan") {
      return { entry, content: new Uint8Array(readFileSync(join(texmf, "ctan", entry.path))) };
    }
    if (packedPath(basic, entry.path)) {
      throw new Error(`${entry.path} ships in texlive-basic already; drop it from carried.txt.`);
    }
    const packed = packedPath(extra, entry.path);
    if (!packed) throw new Error(`${entry.path} is not in texlive-extra ${version}.`);
    const range = /** @type {import("./texmf-carry.js").PackedFile} */ (extra.files.get(packed));
    return { entry, content: unpackFile(extraData, extra.chunks, range) };
  });

  const bundle = packBundle(files.map(({ entry, content }) => ({ name: entry.name, content })));
  // Fixed level and no timestamp (Node writes mtime 0): a rebuild with no
  // change leaves the bundle byte-identical on the same Node version.
  writeFileSync(bundlePath, gzipSync(bundle, { level: 9 }));

  const lock = {
    engine: version,
    files: files.map(({ entry, content }) => ({
      name: entry.name,
      source: entry.source,
      path: entry.path,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
  };
  const before = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { files: [] };
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  report(before, lock, bundle.length);
}

/**
 * Prints what the rebuild changed, so a scheduled rebuild says at a glance
 * whether anything moved.
 *
 * @param {{engine?: string, files: {name: string, sha256: string}[]}} before
 * @param {{engine: string, files: {name: string, sha256: string}[]}} after
 * @param {number} rawBytes
 */
function report(before, after, rawBytes) {
  const old = new Map(before.files.map((f) => [f.name, f.sha256]));
  const now = new Map(after.files.map((f) => [f.name, f.sha256]));
  const added = [...now.keys()].filter((n) => !old.has(n));
  const removed = [...old.keys()].filter((n) => !now.has(n));
  const changed = [...now.keys()].filter((n) => old.has(n) && old.get(n) !== now.get(n));
  const gzipped = readFileSync(bundlePath).length;
  console.log(`engine ${before.engine ?? "none"} -> ${after.engine}`);
  console.log(`${now.size} files, ${rawBytes} bytes, ${gzipped} bytes gzipped`);
  for (const [label, names] of [
    ["added", added],
    ["removed", removed],
    ["changed", changed],
  ]) {
    const shown = names.slice(0, 12).join(" ");
    const more = names.length > 12 ? ` …and ${names.length - 12} more (see carried.lock.json)` : "";
    console.log(`${label}: ${names.length ? shown + more : "none"}`);
  }
}

/** @param {string[]} flsPaths */
function resolve(flsPaths) {
  if (!flsPaths.length) throw new Error("resolve needs at least one .fls file.");
  requireEngine();
  const reads = flsPaths.flatMap((path) => recorderInputs(readFileSync(path, "utf8")));
  const { carry, absent } = planCarry(reads, loadPackage("texlive-basic"), loadPackage("texlive-extra"));
  const entries = parseCarryManifest(readFileSync(manifestPath, "utf8"));
  const listed = new Set(entries.map((e) => e.path));
  const ctanNames = new Set(entries.filter((e) => e.source === "ctan").map((e) => e.name));
  const add = carry.filter((key) => !listed.has(key));
  console.log(add.length ? add.map((key) => `texlive-extra ${key}`).join("\n") : "# carried.txt is complete");
  const unresolved = absent.filter((key) => !ctanNames.has(carriedName(key)));
  if (unresolved.length) {
    console.log("# In no data package; fetch from CTAN, or confirm the browser build never reads them:");
    for (const key of unresolved) console.log(`#   ${key}`);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "build") build();
else if (command === "resolve") resolve(args);
else {
  console.error("Usage: node web/shared/carry-texmf.mjs build | resolve <file.fls>...");
  process.exit(2);
}

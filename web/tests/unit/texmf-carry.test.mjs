// Tier 1 tests for web/shared/texmf-carry.js, and for the committed files
// carry-texmf.mjs builds from it: web/shared/texmf/carried.txt,
// carried.lock.json and carried-texmf.bin. The second half fails when
// someone bumps the engine or edits carried.txt without rebuilding.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { CARRIED_TEXMF_BUNDLE, DATA_PACKAGE } from "../../shared/build-plan.js";
import {
  BUNDLE_FORMAT,
  CHUNK_SIZE,
  carriedName,
  lz4DecodeBlock,
  packBundle,
  parseCarryManifest,
  parseDataPackage,
  planCarry,
  recorderInputs,
  texmfKey,
  unpackBundle,
  unpackFile,
} from "../../shared/texmf-carry.js";
import { readRepoFile, repoRoot } from "../helpers/repo.mjs";

const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text);
const text = (/** @type {Uint8Array} */ data) => new TextDecoder().decode(data);

/** An LZ4 block holding `data` as literals only, the simplest valid block. */
function literalsBlock(/** @type {Uint8Array} */ data) {
  const head = [];
  if (data.length < 15) head.push(data.length << 4);
  else {
    head.push(0xf0);
    let rest = data.length - 15;
    while (rest >= 255) {
      head.push(255);
      rest -= 255;
    }
    head.push(rest);
  }
  return Uint8Array.from([...head, ...data]);
}

test("lz4DecodeBlock copies literals, then an overlapping match", () => {
  // "abc", then a 9-byte match at offset 3, then the final literal "X".
  const block = Uint8Array.from([0x35, 97, 98, 99, 3, 0, 0x10, 88]);
  const out = new Uint8Array(32);
  assert.equal(text(out.subarray(0, lz4DecodeBlock(block, out))), "abcabcabcabcX");
});

test("lz4DecodeBlock reads extended literal and match lengths", () => {
  const literals = bytes("0123456789ABCDEFGHIJ"); // 20: 15 + 5
  // match length 4 + 15 + 3 = 22 at offset 1: 22 more copies of "J"
  const block = Uint8Array.from([0xff, 5, ...literals, 1, 0, 3, 0x10, 90]);
  const out = new Uint8Array(64);
  assert.equal(text(out.subarray(0, lz4DecodeBlock(block, out))), `0123456789ABCDEFGHIJ${"J".repeat(22)}Z`);
});

test("lz4DecodeBlock rejects a zero match offset", () => {
  assert.throws(() => lz4DecodeBlock(Uint8Array.from([0x10, 65, 0, 0, 0x00]), new Uint8Array(16)), /zero match offset/);
});

test("unpackFile reads a file across a raw and a compressed chunk", () => {
  const first = new Uint8Array(CHUNK_SIZE).fill(0x61); // "aaaa…", stored raw
  const second = bytes("bcdefghij");
  const compressed = literalsBlock(second);
  const data = new Uint8Array([...first, ...compressed]);
  const chunks = { offsets: [0, CHUNK_SIZE], sizes: [CHUNK_SIZE, compressed.length], successes: [0, 1] };
  const file = unpackFile(data, chunks, { start: CHUNK_SIZE - 3, end: CHUNK_SIZE + 4 });
  assert.equal(text(file), "aaabcde");
});

test("unpackFile refuses a range past the chunk table", () => {
  const chunks = { offsets: [0], sizes: [3], successes: [0] };
  assert.throws(() => unpackFile(bytes("abc"), chunks, { start: 0, end: CHUNK_SIZE + 1 }), /shorter|past the end/);
});

/** A loader script shaped like Emscripten's file packager output. */
function fakeLoader(/** @type {string[]} */ paths) {
  const files = paths.map((filename, i) => ({ filename, start: i * 10, end: i * 10 + 10 }));
  return [
    `var compressedData = {"data":null,"cachedOffset":9,"offsets":[0],"sizes":[9],"successes":[1]}`,
    ";",
    `loadPackage({"files": ${JSON.stringify(files)}, "remote_package_size": 9});`,
  ].join("\n");
}

test("parseDataPackage reads the file list and the chunk table", () => {
  const pkg = parseDataPackage(fakeLoader(["/texlive/texmf-dist/tex/latex/a/a.sty", "/bin/busytex"]));
  assert.deepEqual(pkg.files.get("/texlive/texmf-dist/tex/latex/a/a.sty"), { start: 0, end: 10 });
  assert.deepEqual(pkg.chunks, { offsets: [0], sizes: [9], successes: [1] });
  assert.throws(() => parseDataPackage("nothing here"), /No file list/);
});

test("texmfKey and recorderInputs agree across TeX Live installations", () => {
  assert.equal(texmfKey("/opt/texlive/texdir/texmf-dist/tex/latex/a/a.sty"), "tex/latex/a/a.sty");
  assert.equal(texmfKey("/texlive/texmf-dist/tex/latex/a/a.sty"), "tex/latex/a/a.sty");
  assert.equal(texmfKey("./metadata.tex"), null);
  const fls = [
    "PWD /data",
    "INPUT /opt/texlive/texdir/texmf-dist/tex/latex/b/b.sty",
    "INPUT ./metadata.tex",
    "OUTPUT x.log",
    "INPUT /opt/texlive/texdir/texmf-dist/tex/latex/a/a.sty",
    "INPUT /opt/texlive/texdir/texmf-dist/tex/latex/a/a.sty",
  ].join("\n");
  assert.deepEqual(recorderInputs(fls), ["tex/latex/a/a.sty", "tex/latex/b/b.sty"]);
});

test("planCarry carries what only the larger package ships", () => {
  const root = "/texlive/texmf-dist/";
  const basic = parseDataPackage(fakeLoader([`${root}tex/latex/base/article.cls`]));
  const extra = parseDataPackage(fakeLoader([`${root}tex/latex/base/article.cls`, `${root}tex/latex/t/t.sty`]));
  assert.deepEqual(
    planCarry(["tex/latex/t/t.sty", "tex/latex/base/article.cls", "tex/latex/nth/nth.sty"], basic, extra),
    {
      carry: ["tex/latex/t/t.sty"],
      absent: ["tex/latex/nth/nth.sty"],
    },
  );
});

test("parseCarryManifest skips comments and names each file flat", () => {
  const entries = parseCarryManifest("# why\nctan nth.sty   # trailing note\n\ntexlive-extra tex/latex/t/t.sty\n");
  assert.deepEqual(entries, [
    { source: "ctan", path: "nth.sty", name: "nth.sty" },
    { source: "texlive-extra", path: "tex/latex/t/t.sty", name: "t.sty" },
  ]);
  assert.equal(carriedName("tex/generic/pgf/pgf.revision.tex"), "pgf.revision.tex");
});

test("parseCarryManifest rejects an unknown source and a flat-name clash", () => {
  assert.throws(() => parseCarryManifest("mirror a.sty"), /line 1/);
  assert.throws(() => parseCarryManifest("ctan"), /line 1/);
  assert.throws(
    () => parseCarryManifest("texlive-extra tex/a/x.sty\ntexlive-extra tex/b/x.sty"),
    /line 2: tex\/b\/x.sty and tex\/a\/x.sty both land on x.sty/,
  );
});

test("packBundle and unpackBundle round-trip, empty files included", () => {
  const files = [
    { name: "a.sty", content: bytes("\\ProvidesPackage{a}\n") },
    { name: "empty.cfg", content: new Uint8Array(0) },
    { name: "b.pfb", content: Uint8Array.from([0, 10, 255]) },
  ];
  assert.deepEqual(unpackBundle(packBundle(files)), files);
});

test("unpackBundle rejects a malformed bundle", () => {
  const good = packBundle([{ name: "a.sty", content: bytes("abc") }]);
  assert.throws(() => unpackBundle(bytes("no index")), /no index/);
  assert.throws(() => unpackBundle(bytes('{"format":99,"files":[]}\n')), /not format/);
  assert.throws(() => unpackBundle(good.subarray(0, good.length - 1)), /truncated at a.sty/);
  assert.throws(() => unpackBundle(Uint8Array.from([...good, 0])), /trailing bytes/);
  assert.throws(() => unpackBundle(bytes(`{"format":${BUNDLE_FORMAT},"files":[{"name":"a"}]}\n`)), /Bad carried/);
});

// The committed files, checked against each other.

const texmf = join(repoRoot, "web", "shared", "texmf");
const manifest = parseCarryManifest(readRepoFile("web/shared/texmf/carried.txt"));
/** @type {{engine: string, files: {name: string, source: string, path: string, bytes: number, sha256: string}[]}} */
const lock = JSON.parse(readRepoFile("web/shared/texmf/carried.lock.json"));
const bundle = unpackBundle(new Uint8Array(gunzipSync(readFileSync(join(texmf, CARRIED_TEXMF_BUNDLE)))));
const sha256 = (/** @type {Uint8Array} */ data) => createHash("sha256").update(data).digest("hex");

test("the carried bundle was built for the pinned engine", () => {
  const pinned = /^BUSYTEX_ENGINE_VERSION=(.+)$/m.exec(readRepoFile("web/vendor.env"))?.[1];
  assert.equal(
    lock.engine,
    pinned,
    "vendor.env pins another engine: run web/serve.sh, then node web/shared/carry-texmf.mjs build",
  );
  assert.equal(DATA_PACKAGE, "texlive-basic", "carried.txt was resolved against texlive-basic");
});

test("the carried bundle holds exactly what carried.txt lists", () => {
  assert.deepEqual(
    lock.files.map(({ name, source, path }) => ({ name, source, path })),
    manifest,
    "carried.txt changed since the last build: run node web/shared/carry-texmf.mjs build",
  );
  assert.deepEqual(
    bundle.map((file) => file.name),
    lock.files.map((file) => file.name),
  );
});

test("every bundled file matches its size and hash in the lock", () => {
  for (const [i, file] of bundle.entries()) {
    assert.equal(file.content.length, lock.files[i].bytes, file.name);
    assert.equal(sha256(file.content), lock.files[i].sha256, file.name);
  }
});

test("every ctan entry is bundled as committed under texmf/ctan/", () => {
  const ctan = lock.files.filter((file) => file.source === "ctan");
  assert.ok(ctan.length > 0);
  for (const file of ctan) {
    const onDisk = join(texmf, "ctan", file.path);
    assert.ok(existsSync(onDisk), `${file.path} is missing from texmf/ctan/`);
    assert.equal(sha256(readFileSync(onDisk)), file.sha256, `${file.path} changed since the last build`);
  }
});

// Only where web/serve.sh has fetched the engine; CI has none.
const engineDir = join(repoRoot, "web", "core", "busytex");
const haveEngine = existsSync(join(engineDir, "texlive-extra.data"));

test("the bundle matches texlive-extra byte for byte", {
  skip: !haveEngine && "no engine in web/core/busytex/",
}, () => {
  const extra = parseDataPackage(readFileSync(join(engineDir, "texlive-extra.js"), "utf8"));
  const data = new Uint8Array(readFileSync(join(engineDir, "texlive-extra.data")));
  /** @type {Map<string, string>} */
  const byKey = new Map();
  for (const path of extra.files.keys()) {
    const key = texmfKey(path);
    if (key) byKey.set(key, path);
  }
  for (const file of lock.files.filter((f) => f.source === "texlive-extra")) {
    const path = byKey.get(file.path);
    assert.ok(path, `${file.path} is not in texlive-extra`);
    const range = /** @type {{start: number, end: number}} */ (extra.files.get(path));
    assert.equal(sha256(unpackFile(data, extra.chunks, range)), file.sha256, file.path);
  }
});

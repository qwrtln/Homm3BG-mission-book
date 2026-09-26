// Hand-run tool, not a test: it loads the real engine, which no test may.
//
// Compiles scenarios on the real BusyTeX engine the way the app does:
// DATA_PACKAGE preloaded, plus the carried bundle. Whenever a compile misses
// a TeX Live file that texlive-extra ships, it copies that file in and
// compiles again, and at the end prints the carried.txt lines to add. This
// is how carried.txt was resolved, and how to re-check it after bumping the
// engine: a recorder file from the local container build is only a first
// guess, because the container runs a different TeX Live release.
//
// It cannot see a file a package loads only if it exists (\IfFileExists),
// since that is no error. doclicense's hyperxmp is one, left out on purpose;
// carried.txt says why.
//
// Needs the engine in web/core/busytex/ (web/serve.sh fetches it) and
// Playwright's Chromium (see web/tests/README.md). From the repository root:
//
//   node web/tests/tools/probe-carried-texmf.mjs [scenario.tex ...]
//
// With no arguments it builds one scenario of each category, one draft, and
// one Russian scenario. Prefix a path with "ru:" to build it in Russian.
// Exits non-zero if any build fails or needed a file carried.txt lacks.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { carriedName, parseDataPackage, texmfKey, unpackFile } from "../../shared/texmf-carry.js";
import { startStaticServer } from "../driver/static-server.mjs";

const DEFAULT_JOBS = [
  "coops/emerald_island.tex",
  "clash/astral_run.tex",
  "campaigns/castle_greek_gift.tex",
  "draft-scenarios/clash/blood_for_ore.tex",
  "ru:clash/translated/ru/astral_run.tex",
];

const engine = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "core", "busytex");
const extra = parseDataPackage(readFileSync(join(engine, "texlive-extra.js"), "utf8"));
const extraData = new Uint8Array(readFileSync(join(engine, "texlive-extra.data")));
/** @type {Map<string, string>} flat name -> absolute path in texlive-extra */
const extraByName = new Map();
for (const path of extra.files.keys()) {
  if (texmfKey(path) && !extraByName.has(carriedName(path))) extraByName.set(carriedName(path), path);
}

/** @type {Set<string>} texmfKey paths the carried bundle should add */
const toCarry = new Set();

/**
 * A missing file's bytes from texlive-extra, as base64 for the page.
 *
 * @param {string} name
 * @returns {string | null}
 */
function fromExtra(name) {
  const path = extraByName.get(name);
  if (!path) return null;
  toCarry.add(/** @type {string} */ (texmfKey(path)));
  const range = /** @type {import("../../shared/texmf-carry.js").PackedFile} */ (extra.files.get(path));
  return Buffer.from(unpackFile(extraData, extra.chunks, range)).toString("base64");
}

const jobs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_JOBS;
const server = await startStaticServer();
const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage();
  await page.exposeFunction("fromExtra", fromExtra);
  // Any page under web/app/ will do: the modules resolve their relative URLs
  // (../repo, ../shared/texmf, ../core/busytex) against it.
  await page.goto(`${server.origin}/web/app/app.js`);
  const results = await page.evaluate(runJobs, jobs);
  for (const r of results) {
    failed ||= !r.ok || r.carried.length > 0;
    const extras = r.carried.length ? `; missed ${r.carried.join(" ")}` : "";
    console.log(`${r.ok && !r.carried.length ? "ok  " : "FAIL"} ${r.job}: ${r.pages} pages, ${r.seconds}s${extras}`);
    if (!r.ok) console.log(`     ${r.firstError}`);
  }
  console.log(
    toCarry.size
      ? `\nAdd to web/shared/texmf/carried.txt, then run carry-texmf.mjs build:\n${[...toCarry]
          .sort()
          .map((key) => `texlive-extra ${key}`)
          .join("\n")}`
      : "\ncarried.txt covers every file these builds read.",
  );
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

/**
 * Runs in the page. Mirrors runBuild in web/app/modules/build.js, without
 * the UI, and with texlive-extra as a second fetch-on-miss source.
 *
 * @param {string[]} jobs
 */
async function runJobs(jobs) {
  const { BusyTexRunner, LuaLatex } = await import("/web/shared/vendor/texlyre-busytex.js");
  const plans = await import("/web/shared/build-plan.js");
  const files = await import("/web/app/modules/files.js");
  const base = new URL("../core/busytex", document.baseURI).href;
  const runner = new BusyTexRunner({
    busytexBasePath: base,
    preloadDataPackages: [`${base}/${plans.DATA_PACKAGE}.js`],
    verbose: false,
  });
  await runner.initialize(true);
  const fromExtra = /** @type {(name: string) => Promise<string | null>} */ (/** @type {any} */ (globalThis).fromExtra);

  const results = [];
  for (const job of jobs) {
    const russian = job.startsWith("ru:");
    const path = russian ? job.slice(3) : job;
    const source = await files.preloadText(path);
    const plan = plans.planScenarioBuild({
      metadata: await files.preloadText("metadata.tex"),
      scenario: { path, source },
    });
    // babel ships no russian.ldf in any data package; its ini locale works.
    const input = russian
      ? plan.input
          .replace("[T1]{fontenc}", "[TU]{fontenc}")
          .replace("[english]{babel}", "[russian,provide=*]{babel}")
          .replace(
            "\\def\\sections{sections}",
            String.raw`\def\sections{sections/translated/ru}\newcommand{\notefont}[0]{}\AtBeginDocument{\setmainfont{LiberationSerif}[Path = ./assets/fonts/, Extension = .ttf, UprightFont = *-Regular, ItalicFont = *-Italic, BoldFont = *-Bold, BoldItalicFont = *-BoldItalic]}`,
          )
      : plan.input;
    const staged = new Map();
    for (const p of plan.repoFiles) {
      try {
        staged.set(p, await files.preloadFile(p));
      } catch {
        /* a genuine miss surfaces in the log */
      }
    }
    for (const file of await files.loadCarriedTexmf()) staged.set(file.path, file);
    for (const [p, content] of Object.entries(plan.generated)) staged.set(p, { path: p, content });
    const additionalFiles = [...staged.values()];

    const tried = new Set();
    const carried = [];
    const started = performance.now();
    let result;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      result = await new LuaLatex(runner).compile({ input, additionalFiles, verbose: "silent" });
      const missing = plans.newMissingPaths(plans.missingFiles(result.log), tried);
      let landed = 0;
      for (const name of missing) {
        tried.add(name);
        try {
          additionalFiles.push(await files.fetchRepoFile(name));
          landed += 1;
          continue;
        } catch {
          /* not a repository file; try texlive-extra */
        }
        const bytes = await fromExtra(name.slice(name.lastIndexOf("/") + 1));
        if (bytes === null) continue;
        additionalFiles.push({ path: name, content: Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)) });
        carried.push(name);
        landed += 1;
      }
      if (!landed) break;
    }
    results.push({
      job,
      ok: Boolean(result?.success && result.pdf),
      pages: plans.pageCount(result?.log ?? ""),
      seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
      carried,
      firstError: plans.firstError(result?.log ?? ""),
    });
  }
  return results;
}

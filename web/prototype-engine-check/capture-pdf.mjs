// Ticket 08 of the WASM scenario builder map (render parity harness).
// Repointed at the real app by ticket 13 (see the PAGE constant below).
//
// Builds one scenario in headless Chromium, through web/app/'s
// window.__probeRun hook (the same shape the probe exposed for ticket 08,
// kept so this script needs no fork), then pulls the resulting PDF out of
// the browser tab and writes it to a real file on disk. That last step is
// the point: a PDF that only exists as a Blob inside the tab cannot be
// compared against `tools/build.sh -s` output, so it must leave the browser.
//
// It reuses the page's own download control (aliased under the id
// "save-pdf" in web/app/index.html) and download machinery rather than
// inventing a second way to get bytes out — the same path a contributor
// clicks manually is the one this script drives.
//
// Usage, with serve.py already running:
//     node web/prototype-engine-check/capture-pdf.mjs <scenario-path> <out.pdf>
// Example:
//     node web/prototype-engine-check/capture-pdf.mjs clash/astral_run.tex /tmp/astral_run_browser.pdf

import { spawn } from "node:child_process";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const [, , scenarioArg, outArg] = process.argv;
if (!scenarioArg || !outArg) {
  console.error("Usage: capture-pdf.mjs <scenario-path> <out.pdf>");
  process.exit(2);
}
// index.html's scenario list uses paths with the .tex suffix, e.g.
// "clash/astral_run.tex" — the same form \input{\clashpath/...} uses.
const scenarioPath = scenarioArg.endsWith(".tex") ? scenarioArg : `${scenarioArg}.tex`;
const outFile = resolvePath(outArg);

// Ticket 13 points this at the real app instead of the probe: the map's
// "Done when" list requires tools/render_parity.sh to pass against
// web/app/, not only against the probe. The app exposes the same
// window.__probeRun/window.__probeResults shape and a #save-pdf id (see
// web/app/index.html), so no other change to this script was needed.
const PAGE = "http://localhost:8321/web/app/";
const PORT = 9334; // distinct from run-headless.mjs's 9333, so both can run at once

const profile = await mkdtemp(join(tmpdir(), "render-parity-profile-"));
const downloadDir = await mkdtemp(join(tmpdir(), "render-parity-download-"));

const chromium = spawn("chromium", [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--use-gl=disabled",
  "--log-level=3",
  "--js-flags=--max-old-space-size=8192",
  `--user-data-dir=${profile}`,
  PAGE,
], { stdio: ["ignore", "ignore", "pipe"] });

chromium.stderr.on("data", (chunk) => {
  const line = String(chunk);
  if (/FATAL/.test(line)) process.stderr.write(line);
});

async function cleanup(code) {
  socket?.close();
  if (chromium.exitCode === null) {
    chromium.kill();
    await Promise.race([
      new Promise((res) => chromium.once("close", res)),
      sleep(5000),
    ]);
  }
  // Chromium can still be flushing profile files for a moment after it
  // reports closed; a bare rm -rf can lose that race. Retry rather than
  // fail the whole run over directory cleanup.
  for (const dir of [profile, downloadDir]) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(300);
      }
    }
  }
  process.exit(code);
}

let socket;
let nextId = 1;
const pending = new Map();
let downloadDone = null;

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("Chromium never opened a debugging port");
}

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const reply = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 900000,
  });
  if (reply.exceptionDetails) {
    throw new Error(reply.exceptionDetails.exception?.description || "page threw");
  }
  return reply.result.value;
}

try {
  const url = await connect();
  socket = new WebSocket(url);
  await new Promise((res) => socket.addEventListener("open", res));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    } else if (message.method === "Page.downloadProgress" && message.params.state === "completed") {
      downloadDone?.(message.params.guid);
    }
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
    eventsEnabled: true,
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate("typeof window.__probeRun === 'function'")) break;
    await sleep(500);
  }

  const record = await evaluate(`
    window.__probeRun("scenario-svg", ${JSON.stringify(scenarioPath)})
      .then(() => window.__probeResults["scenario-svg"])
      .catch((error) => ({ ok: false, crashed: String(error && error.stack || error) }))
  `);

  if (!record?.ok) {
    console.error(JSON.stringify(record, null, 2));
    throw new Error(`build did not produce a PDF for ${scenarioPath}`);
  }

  const waitForDownload = new Promise((res) => { downloadDone = res; });
  await evaluate(`document.getElementById("save-pdf").click(); true`);
  const guid = await Promise.race([
    waitForDownload,
    sleep(30000).then(() => { throw new Error("download never completed"); }),
  ]);

  const entries = await readdir(downloadDir);
  const downloaded = entries.find((name) => name === guid) || entries[0];
  if (!downloaded) throw new Error(`no file appeared in ${downloadDir}`);
  await rename(join(downloadDir, downloaded), outFile);

  console.log(JSON.stringify({ ok: true, pages: record.pages, bytes: record.bytes, out: outFile }));
  await cleanup(0);
} catch (error) {
  console.error(String(error?.stack || error));
  await cleanup(1);
}

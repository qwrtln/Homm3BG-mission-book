// PROTOTYPE — throwaway. Drives the page in headless Chromium and prints what
// happened, so the answer to ticket 01 is a measurement and not an opinion.
//
// No dependencies. It speaks the Chrome DevTools Protocol over the WebSocket
// that Node 22 and later ship built in.
//
// Usage, with serve.py already running:
//     node web/prototype-engine-check/run-headless.mjs [step ...]
// Default steps: trivial tikz fonts preamble scenario

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PAGE = "http://localhost:8321/web/prototype-engine-check/";
const OUT = new URL("./out/", import.meta.url);
const PORT = 9333;
// "all-scenarios" expands into one scenario build per entry in the dropdown.
const STEPS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["trivial", "tikz", "fonts", "preamble", "scenario"];

// A fresh profile every run. A reused one serves the page from its HTTP cache,
// and an edit to index.html then goes unnoticed for an hour.
const profile = await mkdtemp(join(tmpdir(), "prototype-engine-check-"));

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

let socket;
let nextId = 1;
const pending = new Map();

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

const url = await connect();
socket = new WebSocket(url);
await new Promise((resolve) => socket.addEventListener("open", resolve));
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});

await send("Runtime.enable");
await send("Page.enable");
await mkdir(OUT, { recursive: true });

// Wait for the module script to define its hook.
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (await evaluate("typeof window.__probeRun === 'function'")) break;
  await sleep(500);
}

let plan = STEPS;
if (STEPS.includes("all-scenarios")) {
  const paths = await evaluate("window.__probeScenarios ? window.__probeScenarios() : []");
  plan = STEPS.flatMap((step) => (step === "all-scenarios" ? paths.map((path) => `scenario:${path}`) : step));
  console.log(`Building ${paths.length} scenarios.`);
}

const summary = [];
for (const step of plan) {
  const [stepName, scenarioPath] = step.split(/:(.+)/);
  process.stdout.write(`\n=== ${step}\n`);
  const started = Date.now();
  let record;
  try {
    record = await evaluate(`
      window.__probeRun(${JSON.stringify(stepName)}, ${JSON.stringify(scenarioPath || null)})
        .then(() => window.__probeResults[${JSON.stringify(stepName)}])
        .catch((error) => ({ ok: false, crashed: String(error && error.stack || error) }))
    `);
  } catch (error) {
    record = { ok: false, crashed: String(error.message) };
  }
  const wall = ((Date.now() - started) / 1000).toFixed(1);

  const slug = step.replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (record?.log) {
    await writeFile(new URL(`${slug}.log`, OUT), record.log);
    delete record.log;
  }
  summary.push({ step, wall, ...record });
  console.log(JSON.stringify({ step, wall, ...record }, null, 2));
}

await writeFile(new URL("summary.json", OUT), JSON.stringify(summary, null, 2));
console.log(`\nLogs and summary written to ${OUT.pathname}`);
socket.close();
chromium.kill();
await rm(profile, { recursive: true, force: true });
process.exit(0);

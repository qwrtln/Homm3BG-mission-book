// TEST STUB — never shipped. Served to the browser only by tier-2 tests, in
// place of web/shared/vendor/texlyre-busytex.js, via CDP request
// interception (see web/tests/stubs/install-stubs.mjs). The real engine is
// vendored, trusted, and deliberately not under test here: no compile ever
// runs, no WASM loads, no texlive-*.data downloads. This module exists only
// so that `import { BusyTexRunner, LuaLatex } from ".../texlyre-busytex.js"`
// in web/app/modules/build.js resolves to something that behaves enough
// like the real thing for the app's own logic to be exercised.
//
// Every call this stub receives is recorded on globalThis.__stubEngineCalls
// so a test can assert the app drove the engine correctly without a real
// engine ever running.
//
// A test that needs a compile in flight sets globalThis.__stubCompileHold to
// a promise; every compile then waits on it before answering. A promise that
// never settles makes a compile that only a stop can end.
//
// A test that needs a particular result (a failed build, a given log) sets
// globalThis.__stubCompileResult to a function; every compile then answers
// with what it returns for the options build.js passed.

/**
 * @typedef {object} StubEngineCall
 * @property {string} method - dotted name of the call, e.g.
 *   "BusyTexRunner.initialize".
 * @property {unknown[]} args - the arguments passed to that call.
 */

// Guarded so re-evaluating this module (a fresh page navigation, a second
// import) does not stomp on calls already recorded in the same browser
// context.
if (!globalThis.__stubEngineCalls) {
  /** @type {StubEngineCall[]} */
  globalThis.__stubEngineCalls = [];
}

/**
 * Records a call for later assertion by a tier-2 test.
 * @param {string} method - dotted name of the call.
 * @param {unknown[]} args - the arguments passed to that call.
 * @returns {void}
 */
function recordCall(method, args) {
  globalThis.__stubEngineCalls.push({ method, args });
}

// How many pages the stub PDF has: enough that a test can scroll to one
// that is not the first.
const STUB_PAGE_COUNT = 3;

/**
 * Builds a small, deterministic, valid PDF: STUB_PAGE_COUNT A6 pages, each a
 * filled rectangle, with no fonts, so pdf.js draws it without fetching
 * anything. The same bytes every call, so a test can compare Download's
 * output against globalThis.__stubPdfBytes.
 * @returns {Uint8Array} PDF bytes.
 */
function fakePdfBytes() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = [];
  const pages = [];
  for (let page = 0; page < STUB_PAGE_COUNT; page += 1) {
    const pageId = 3 + 2 * page;
    const contentId = pageId + 1;
    const shade = (0.2 + 0.3 * page).toFixed(1);
    const content = `${shade} 0.4 0.8 rg 20 20 257 380 re f`;
    kids.push(`${pageId} 0 R`);
    pages.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 297 420] /Contents ${contentId} 0 R /Resources << >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${STUB_PAGE_COUNT} >>`, ...pages);

  let text = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

globalThis.__stubPdfBytes = Array.from(fakePdfBytes());

/**
 * Console-only stand-in for the real module's Logger. build.js never talks
 * to this directly, but it is a named export the app could import.
 */
class Logger {
  /**
   * @param {boolean} [verbose] - whether debug() should print.
   */
  constructor(verbose = false) {
    this.verbose = verbose;
  }

  /** @param {string} message @param {...unknown} args @returns {void} */
  debug(message, ...args) {
    if (this.verbose) console.debug(`[stub-engine] ${message}`, ...args);
  }

  /** @param {string} message @param {...unknown} args @returns {void} */
  info(message, ...args) {
    console.info(`[stub-engine] ${message}`, ...args);
  }

  /** @param {string} message @param {...unknown} args @returns {void} */
  warn(message, ...args) {
    console.warn(`[stub-engine] ${message}`, ...args);
  }

  /** @param {string} message @param {...unknown} args @returns {void} */
  error(message, ...args) {
    console.error(`[stub-engine] ${message}`, ...args);
  }
}

/**
 * Stub replacement for BusyTexRunner. Implements exactly what build.js
 * touches (constructor, initialize) plus the handful of methods the real
 * class exposes that a compile tool (LuaLatex) may call on it, so any
 * incidental call still resolves instead of throwing "not a function".
 */
class BusyTexRunner {
  /**
   * @param {object} [config] - same shape build.js passes the real runner:
   *   { busytexBasePath, preloadDataPackages, verbose }. Never read for
   *   anything but recording — no network, no worker, no WASM is touched.
   */
  constructor(config = {}) {
    recordCall("BusyTexRunner.constructor", [config]);
    this.config = config;
    this.initialized = false;
  }

  /**
   * Resolves immediately and marks the stub initialized. No worker, no
   * SharedArrayBuffer, no network request of any kind.
   * @param {boolean} [useWorker] - accepted for signature parity, ignored.
   * @returns {Promise<void>} resolves once `this.initialized` is true.
   */
  async initialize(useWorker = true) {
    recordCall("BusyTexRunner.initialize", [useWorker]);
    this.initialized = true;
  }

  /** @returns {boolean} whether initialize() has resolved. */
  isInitialized() {
    return this.initialized;
  }

  /** @returns {object} a shallow copy of the config passed to the constructor. */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Not called directly by build.js (it goes through LuaLatex.compile
   * instead), but implemented for parity in case a tool delegates to it.
   * @param {unknown[]} files - staged files, ignored.
   * @param {string} mainTexPath - ignored.
   * @param {...unknown} rest - remaining positional args from the real
   *   signature, ignored.
   * @returns {Promise<{success: boolean, pdf: Uint8Array, synctex: null,
   *   log: string, exitCode: number, logs: unknown[]}>} a deterministic fake
   *   compile result.
   */
  async compile(files, mainTexPath, ...rest) {
    recordCall("BusyTexRunner.compile", [files, mainTexPath, ...rest]);
    return {
      success: true,
      pdf: fakePdfBytes(),
      synctex: null,
      log: "stub-engine: fake compile, no real LaTeX ran",
      exitCode: 0,
      logs: [],
    };
  }

  /** @returns {void} */
  terminate() {
    recordCall("BusyTexRunner.terminate", []);
    this.initialized = false;
  }

  /** @param {string} packageJsUrl - ignored. @returns {Promise<boolean>} always false. */
  async isPackageCached(packageJsUrl) {
    recordCall("BusyTexRunner.isPackageCached", [packageJsUrl]);
    return false;
  }

  /** @param {string} packageJsUrl - ignored. @returns {Promise<void>} */
  async deletePackageCache(packageJsUrl) {
    recordCall("BusyTexRunner.deletePackageCache", [packageJsUrl]);
  }

  /** @returns {Promise<void>} */
  async clearAllPackageCache() {
    recordCall("BusyTexRunner.clearAllPackageCache", []);
  }
}

/**
 * Shared fake-compile behaviour for the three compile-tool stand-ins
 * (LuaLatex, PdfLatex, XeLatex). build.js only ever constructs LuaLatex, but
 * the other two are named exports of the real module.
 * @param {BusyTexRunner} runner - the stub runner passed to the constructor.
 * @param {string} label - dotted-call prefix, e.g. "LuaLatex".
 * @param {object} options - the options object build.js passes to compile():
 *   { input, additionalFiles, verbose }.
 * @returns {Promise<{success: boolean, pdf: Uint8Array, synctex: null,
 *   log: string, exitCode: number, logs: unknown[]}>} a deterministic fake
 *   compile result, matching the real module's CompileResult shape.
 */
async function stubToolCompile(runner, label, options) {
  recordCall(`${label}.compile`, [options]);
  if (globalThis.__stubCompileHold) await globalThis.__stubCompileHold;
  if (!runner.isInitialized()) {
    await runner.initialize();
  }
  if (typeof globalThis.__stubCompileResult === "function") return globalThis.__stubCompileResult(options);
  return {
    success: true,
    pdf: fakePdfBytes(),
    synctex: null,
    log: "stub-engine: fake compile, no real LaTeX ran",
    exitCode: 0,
    logs: [],
  };
}

/**
 * Stub replacement for LuaLatex — the only compile tool build.js
 * constructs (`new LuaLatex(state.runner)`), then calls
 * `.compile({ input, additionalFiles, verbose })` on.
 */
class LuaLatex {
  /**
   * @param {BusyTexRunner} runner - the stub runner build.js already
   *   constructed and initialized.
   */
  constructor(runner) {
    recordCall("LuaLatex.constructor", [runner]);
    this.runner = runner;
  }

  /**
   * @param {{input: string, additionalFiles?: unknown[], verbose?: string,
   *   mainTexPath?: string}} options - same options build.js passes the
   *   real LuaLatex.
   * @returns {Promise<{success: boolean, pdf: Uint8Array, synctex: null,
   *   log: string, exitCode: number, logs: unknown[]}>} a deterministic fake
   *   compile result.
   */
  async compile(options) {
    return stubToolCompile(this.runner, "LuaLatex", options);
  }
}

/** Stub replacement for PdfLatex. Never touched by build.js; kept for export parity. */
class PdfLatex {
  /** @param {BusyTexRunner} runner - the stub runner. */
  constructor(runner) {
    recordCall("PdfLatex.constructor", [runner]);
    this.runner = runner;
  }

  /**
   * @param {{input: string, additionalFiles?: unknown[]}} options - compile options.
   * @returns {Promise<{success: boolean, pdf: Uint8Array, synctex: null,
   *   log: string, exitCode: number, logs: unknown[]}>} a deterministic fake
   *   compile result.
   */
  async compile(options) {
    return stubToolCompile(this.runner, "PdfLatex", options);
  }
}

/** Stub replacement for XeLatex. Never touched by build.js; kept for export parity. */
class XeLatex {
  /** @param {BusyTexRunner} runner - the stub runner. */
  constructor(runner) {
    recordCall("XeLatex.constructor", [runner]);
    this.runner = runner;
  }

  /**
   * @param {{input: string, additionalFiles?: unknown[]}} options - compile options.
   * @returns {Promise<{success: boolean, pdf: Uint8Array, synctex: null,
   *   log: string, exitCode: number, logs: unknown[]}>} a deterministic fake
   *   compile result.
   */
  async compile(options) {
    return stubToolCompile(this.runner, "XeLatex", options);
  }
}

/**
 * Stub for the real module's free function. Never touches IndexedDB.
 * @param {string} packageJsUrl - ignored.
 * @returns {Promise<boolean>} always false: the stub never caches anything.
 */
async function isPackageCached(packageJsUrl) {
  recordCall("isPackageCached", [packageJsUrl]);
  return false;
}

/**
 * Stub for the real module's free function. Never touches IndexedDB.
 * @param {string} packageJsUrl - ignored.
 * @returns {Promise<void>} resolves immediately.
 */
async function deletePackageCache(packageJsUrl) {
  recordCall("deletePackageCache", [packageJsUrl]);
}

/**
 * Stub for the real module's free function. Never touches IndexedDB.
 * @returns {Promise<void>} resolves immediately.
 */
async function clearAllPackageCache() {
  recordCall("clearAllPackageCache", []);
}

/**
 * Stub for the real module's free function. Never touches localStorage.
 * @returns {Promise<void>} resolves immediately.
 */
async function ensureCacheVersion() {
  recordCall("ensureCacheVersion", []);
}

export {
  BusyTexRunner,
  clearAllPackageCache,
  deletePackageCache,
  ensureCacheVersion,
  isPackageCached,
  Logger,
  LuaLatex,
  PdfLatex,
  XeLatex,
};

// Ambient declarations for the test-only globals the integration tests set and
// read inside `page.evaluate` callbacks. They run in the page, where
// tests/stubs/texlyre-busytex-stub.js and the tests themselves hang them on
// `globalThis`. The app's own probe hooks (`window.__editor` and the rest) are
// declared in types/globals.d.ts.

interface StubEngineCall {
  method: string;
  args: unknown[];
}

interface StubCompileOptions {
  input?: string;
  additionalFiles: { path: string; content?: Uint8Array | string }[];
  verbose?: boolean;
}

interface StubCompileResult {
  success: boolean;
  pdf?: Uint8Array | null;
  synctex?: unknown;
  log: string;
  exitCode: number;
  logs?: unknown[];
}

interface BuildStateSnapshot {
  disabled: boolean;
  label: string | null;
  stop: boolean;
  progressShown: boolean;
}

/** Recorded by texlyre-busytex-stub.js: every call the app made to the engine. */
declare var __stubEngineCalls: StubEngineCall[] | undefined;
/** The stub's default PDF, as plain numbers so it survives `page.evaluate`. */
declare var __stubPdfBytes: number[];
/** While set, every compile waits on it before answering. */
declare var __stubCompileHold: Promise<unknown> | null | undefined;
/** Answers each compile in place of the stub's default result. */
declare var __stubCompileResult:
  | ((options: StubCompileOptions) => StubCompileResult | Promise<StubCompileResult>)
  | undefined;
/** What `readProjectFiles()` returns after a compile. */
declare var __stubProjectFiles: { path: string; content: Uint8Array | string }[] | undefined;
/** Releases `__stubCompileHold`, set by the test that created the hold. */
declare var __releaseCompileHold: (() => void) | undefined;
declare var __buildStates: BuildStateSnapshot[] | undefined;
declare var __lastDefaultPrevented: boolean | null | undefined;
/** The app's store state, read through `window.__state` (types/globals.d.ts). */
declare var __state: import("../app/store.ts").AppState | undefined;
declare var __localStore: Window["__localStore"];

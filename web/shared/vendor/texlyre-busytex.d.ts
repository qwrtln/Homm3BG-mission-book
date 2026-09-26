// Hand-written types for the vendored BusyTeX wrapper
// (shared/vendor/texlyre-busytex.js), which ships none of its own and has no
// upstream documentation to consult. This file is what the engine's callers
// type-check against; it is also the contract any engine stub must satisfy.
//
// The .js beside this file is excluded from the type check on purpose — it is
// vendored, and editing it to please a checker is not on the table. TypeScript
// resolves the import of "./texlyre-busytex.js" to this declaration instead.

export interface BusyTexRunnerOptions {
  /** Absolute URL of the busytex build directory. */
  busytexBasePath: string;
  /** Data packages to pull in before the first compile, by URL. */
  preloadDataPackages?: string[];
  verbose?: boolean;
}

export declare class BusyTexRunner {
  constructor(options: BusyTexRunnerOptions);
  /** Downloads and starts the WASM engine. Resolves once it can compile. */
  initialize(preloadData?: boolean): Promise<void>;
  /**
   * Kills the worker at once, mid-compile included. A compile in flight then
   * never settles until its own timeout. The runner cannot compile again
   * until initialize() runs anew.
   */
  terminate(): void;
  /**
   * Every file the last compile left in its project directory, the staged
   * inputs included, by path relative to it.
   */
  readProjectFiles(dir?: string): Promise<{ path: string; content: Uint8Array }[]>;
}

export interface CompileRequest {
  /** The root document's source — what main_en.tex would hold locally. */
  input: string;
  /** Every other file the compile needs, in a flat virtual filesystem. */
  additionalFiles: StagedFile[];
  /**
   * Whether the engine reruns TeX on its own. Left out, it does, and its
   * check matches the rerunfilecheck package's name, so every book build
   * ran four passes. False runs exactly one.
   */
  rerun?: boolean;
  /** "silent", "info" or "debug": how much kpathsea tracing the log carries. */
  verbose?: string;
}

export interface CompileResult {
  success: boolean;
  /** The full engine log. Always present, including on a thrown failure. */
  log: string;
  /**
   * The PDF bytes, present only on success. Backed by a plain ArrayBuffer,
   * never a SharedArrayBuffer, so the bytes can go straight into a Blob.
   */
  pdf?: Uint8Array<ArrayBuffer>;
  exitCode?: number;
}

export declare class LuaLatex {
  constructor(runner: BusyTexRunner);
  compile(request: CompileRequest): Promise<CompileResult>;
}

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
}

export interface CompileRequest {
  /** The root document's source — what main_en.tex would hold locally. */
  input: string;
  /** Every other file the compile needs, in a flat virtual filesystem. */
  additionalFiles: StagedFile[];
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

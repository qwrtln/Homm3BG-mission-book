// Shapes the app passes between its own modules. These are the contracts
// app/modules/* agree on; the GitHub API's own payload shapes live in
// types/github.d.ts, and the LaTeX engine's in
// shared/vendor/texlyre-busytex.d.ts.

/** One scenario the search can offer. Built by app/modules/entries.js. */
interface ScenarioEntry {
  /** Repository-relative path of the .tex file, e.g. "clash/astral_run.tex". */
  path: string;
  /** Which book it came from: the published mission book, or the draft book. */
  book: "mission" | "draft";
  /** Display category — "Coop", "Clash", "Campaign", "Alliance". */
  category: string;
  /** The scenario's own heading, or its path when it declares none. */
  title: string;
  isTemplate: boolean;
}

/** A template pick, which has no repository entry behind it. */
interface TemplateEntry {
  path: string;
  title: string;
  isTemplate: true;
}

/** One file staged for the build: repository text, or uploaded bytes. */
interface StagedFile {
  path: string;
  content: string | Uint8Array;
}

/** The outcome of one build, as the status bar and error panel read it. */
interface BuildRecord {
  ok: boolean;
  bytes?: number;
  pages?: number;
  seconds?: number;
  /** Paths that were planned for but could not be fetched. */
  notFound?: string[];
  /** Paths the engine itself reported as missing. */
  missing?: string[];
  /** The first real LaTeX error line, or null when none was found. */
  firstError: string | null;
  log: string;
}

/** Where the last save landed, and what "Save again" / "Open PR" act on. */
interface SaveTarget {
  owner: string;
  repo: string;
  branch: string;
  isMember: boolean;
  commitSha?: string;
}

/**
 * A scenario's in-flight prefetch. Picking a second scenario aborts the
 * first through its controller.
 */
interface ScenarioPrefetch {
  path: string;
  controller: AbortController;
  promise: Promise<{ pdfBlob: Blob | null }> | null;
}

/** The single shared mutable object in app/modules/state.js. */
interface AppState {
  entries: ScenarioEntry[];
  chosenPath: string | null;
  chosenTitle: string;
  building: boolean;
  runner: import("../shared/vendor/texlyre-busytex.js").BusyTexRunner | null;
  lastPdf: Blob | null;
  lastResult: BuildRecord | null;
  cm: CodeMirrorEditor | null;
  /** Repository path -> the bytes a contributor added from their own machine. */
  uploadedFiles: Map<string, Uint8Array>;
  /** The pending autosave's timer id, from the DOM's setTimeout. */
  saveTimer: number | null;
  scenarioPrefetch: ScenarioPrefetch | null;
}

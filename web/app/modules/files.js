import {
  ALWAYS_PRELOAD, CARRIED_TEXMF, CORE_GLYPHS, glyphFilesFor, collectReferencedAssets,
} from "../../shared/build-plan.js";
import { REPO } from "./config.js";

/**
 * Fetches one repository file by its repository-relative path.
 *
 * @param {string} path
 * @param {AbortSignal} [signal]
 * @returns {Promise<StagedFile>}
 */
export async function fetchRepoFile(path, signal) {
  return fetchAt(`${REPO}/${path}`, path, signal);
}

/**
 * For a file relative to this page rather than REPO, e.g. web/shared/texmf/
 * which ships alongside the app in both layouts and needs no aliasing.
 *
 * Text files come back as strings and everything else as bytes, decided by
 * extension — the engine needs each in its own form.
 *
 * @param {string} url where to fetch from
 * @param {string} path the path the build should see the file at
 * @param {AbortSignal} [signal] optional; an aborted fetch never writes
 *   into preloadedFiles
 * @returns {Promise<StagedFile>}
 */
export async function fetchAt(url, path, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const isText = /\.(tex|sty|cls|cfg|txt|map|enc|json|pdf_tex)$/.test(path);
  return isText
    ? { path, content: await response.text() }
    : { path, content: new Uint8Array(await response.arrayBuffer()) };
}

/**
 * Almost every build file is the same regardless of scenario; only its own
 * pictures vary. This cache holds whatever has already been fetched, by path.
 *
 * @type {Map<string, StagedFile>}
 */
export const preloadedFiles = new Map();

/**
 * @param {string} path repository-relative path
 * @param {AbortSignal} [signal]
 * @returns {Promise<StagedFile>}
 */
export async function preloadFile(path, signal) {
  const cached = preloadedFiles.get(path);
  if (cached) return cached;
  const file = await fetchRepoFile(path, signal);
  preloadedFiles.set(path, file);
  return file;
}

/**
 * The text of a repository file, for the callers that need a string rather
 * than a StagedFile. Only ever called for `.tex` paths, which fetchAt reads
 * as text; a binary path would be a programming error, so it throws.
 *
 * @param {string} path repository-relative path
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function preloadText(path, signal) {
  const { content } = await preloadFile(path, signal);
  if (typeof content !== "string") throw new Error(`${path} was fetched as bytes, not text.`);
  return content;
}

/**
 * @param {string} name a filename under web/shared/texmf/
 * @param {AbortSignal} [signal]
 * @returns {Promise<StagedFile>}
 */
export async function preloadTexmfFile(name, signal) {
  const key = `texmf/${name}`;
  const cached = preloadedFiles.get(key);
  if (cached) return cached;
  const file = await fetchAt(`../shared/texmf/${name}`, key, signal);
  preloadedFiles.set(key, file);
  return file;
}

/**
 * Fetches every file all scenarios need, before any scenario is picked.
 * Failures here aren't fatal; runBuild's own fetch through the same cache
 * surfaces them again.
 *
 * @returns {Promise<void>}
 */
export async function preloadCommonFiles() {
  const metadata = await preloadText("metadata.tex");
  const commonPaths = [...ALWAYS_PRELOAD, ...collectReferencedAssets(metadata), ...glyphFilesFor(CORE_GLYPHS)];
  for (const path of commonPaths) {
    try { await preloadFile(path); } catch { /* retried, and surfaced if it matters, at build time */ }
  }
  for (const name of CARRIED_TEXMF) {
    try { await preloadTexmfFile(name); } catch { /* same */ }
  }
}

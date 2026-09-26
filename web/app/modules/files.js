import {
  ALWAYS_PRELOAD,
  CARRIED_TEXMF_BUNDLE,
  CORE_GLYPHS,
  collectReferencedAssets,
  glyphFilesFor,
} from "../../shared/build-plan.js";
import { unpackBundle } from "../../shared/texmf-carry.js";
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
 * Fetches one file for the build. Text files come back as strings and
 * everything else as bytes; see staged().
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
  return staged(path, new Uint8Array(await response.arrayBuffer()));
}

/**
 * Text files as strings and everything else as bytes, decided by extension —
 * the engine needs each in its own form.
 *
 * @param {string} path
 * @param {Uint8Array} bytes
 * @returns {StagedFile}
 */
function staged(path, bytes) {
  const isText = /\.(tex|sty|cls|cfg|txt|map|enc|json|pdf_tex)$/.test(path);
  return isText ? { path, content: new TextDecoder().decode(bytes) } : { path, content: bytes };
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

// One fetch per page, shared by page-load warm-up and every Build.
/** @type {Promise<StagedFile[]> | null} */
let carriedTexmf = null;

/**
 * The TeX Live files the data package lacks, from the one gzipped bundle
 * carry-texmf.mjs builds, named flat for the working directory.
 *
 * @returns {Promise<StagedFile[]>}
 */
export function loadCarriedTexmf() {
  if (!carriedTexmf) {
    carriedTexmf = fetchCarriedTexmf().catch((error) => {
      carriedTexmf = null; // let the next Build retry instead of staying stuck
      throw error;
    });
  }
  return carriedTexmf;
}

/** @returns {Promise<StagedFile[]>} */
async function fetchCarriedTexmf() {
  const response = await fetch(`../shared/texmf/${CARRIED_TEXMF_BUNDLE}`);
  if (!response.ok || !response.body) throw new Error(`texmf/${CARRIED_TEXMF_BUNDLE}: ${response.status}`);
  const gunzipped = response.body.pipeThrough(new DecompressionStream("gzip"));
  const bundle = new Uint8Array(await new Response(gunzipped).arrayBuffer());
  return unpackBundle(bundle).map((file) => staged(file.name, file.content));
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
    try {
      await preloadFile(path);
    } catch {
      /* retried, and surfaced if it matters, at build time */
    }
  }
  await loadCarriedTexmf().catch(() => {
    /* same */
  });
}

import {
  ALWAYS_PRELOAD,
  CARRIED_TEXMF_BUNDLE,
  CORE_GLYPHS,
  collectReferencedAssets,
  glyphFilesFor,
} from "../../shared/build-plan.ts";
import { unpackBundle } from "../../shared/texmf-carry.ts";
import { REPO } from "./config.ts";

/** Fetches one repository file by its repository-relative path. */
export async function fetchRepoFile(path: string, signal?: AbortSignal): Promise<StagedFile> {
  return fetchAt(`${REPO}/${path}`, path, signal);
}

/**
 * Fetches one file for the build. Text files come back as strings and
 * everything else as bytes; see staged().
 *
 * @param url where to fetch from
 * @param path the path the build should see the file at
 * @param signal optional; an aborted fetch never writes into preloadedFiles
 */
export async function fetchAt(url: string, path: string, signal?: AbortSignal): Promise<StagedFile> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return staged(path, new Uint8Array(await response.arrayBuffer()));
}

/**
 * Text files as strings and everything else as bytes, decided by extension —
 * the engine needs each in its own form.
 */
function staged(path: string, bytes: Uint8Array): StagedFile {
  const isText = /\.(tex|sty|cls|cfg|txt|map|enc|json|pdf_tex)$/.test(path);
  return isText ? { path, content: new TextDecoder().decode(bytes) } : { path, content: bytes };
}

/**
 * Almost every build file is the same regardless of scenario; only its own
 * pictures vary. This cache holds whatever has already been fetched, by path.
 */
export const preloadedFiles: Map<string, StagedFile> = new Map();

export async function preloadFile(path: string, signal?: AbortSignal): Promise<StagedFile> {
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
 */
export async function preloadText(path: string, signal?: AbortSignal): Promise<string> {
  const { content } = await preloadFile(path, signal);
  if (typeof content !== "string") throw new Error(`${path} was fetched as bytes, not text.`);
  return content;
}

// One fetch per page, shared by page-load warm-up and every Build.
let carriedTexmf: Promise<StagedFile[]> | null = null;

/**
 * The TeX Live files the data package lacks, from the one gzipped bundle
 * carry-texmf.ts builds, named flat for the working directory.
 */
export function loadCarriedTexmf(): Promise<StagedFile[]> {
  if (!carriedTexmf) {
    carriedTexmf = fetchCarriedTexmf().catch((error) => {
      carriedTexmf = null; // let the next Build retry instead of staying stuck
      throw error;
    });
  }
  return carriedTexmf;
}

async function fetchCarriedTexmf(): Promise<StagedFile[]> {
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
 */
export async function preloadCommonFiles(): Promise<void> {
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

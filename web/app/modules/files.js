import {
  ALWAYS_PRELOAD, CARRIED_TEXMF, CORE_GLYPHS, glyphFilesFor, collectReferencedAssets,
} from "../../shared/build-plan.js";
import { REPO } from "./config.js";

export async function fetchRepoFile(path, signal) {
  return fetchAt(`${REPO}/${path}`, path, signal);
}

// For a file relative to this page rather than REPO, e.g. web/shared/texmf/
// which ships alongside the app in both layouts and needs no aliasing.
// signal is optional: an aborted fetch never writes into preloadedFiles.
export async function fetchAt(url, path, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const isText = /\.(tex|sty|cls|cfg|txt|map|enc|json|pdf_tex)$/.test(path);
  return isText
    ? { path, content: await response.text() }
    : { path, content: new Uint8Array(await response.arrayBuffer()) };
}

// Almost every build file is the same regardless of scenario; only its own
// pictures vary. This cache holds whatever has already been fetched, by path.
export const preloadedFiles = new Map(); // path -> {path, content}

export async function preloadFile(path, signal) {
  if (preloadedFiles.has(path)) return preloadedFiles.get(path);
  const file = await fetchRepoFile(path, signal);
  preloadedFiles.set(path, file);
  return file;
}

export async function preloadTexmfFile(name, signal) {
  const key = `texmf/${name}`;
  if (preloadedFiles.has(key)) return preloadedFiles.get(key);
  const file = await fetchAt(`../shared/texmf/${name}`, key, signal);
  preloadedFiles.set(key, file);
  return file;
}

// Fetches every file all scenarios need, before any scenario is picked.
// Failures here aren't fatal; runBuild's own fetch through the same cache surfaces them again.
export async function preloadCommonFiles() {
  const metadata = (await preloadFile("metadata.tex")).content;
  const commonPaths = [...ALWAYS_PRELOAD, ...collectReferencedAssets(metadata), ...glyphFilesFor(CORE_GLYPHS)];
  for (const path of commonPaths) {
    try { await preloadFile(path); } catch { /* retried, and surfaced if it matters, at build time */ }
  }
  for (const name of CARRIED_TEXMF) {
    try { await preloadTexmfFile(name); } catch { /* same */ }
  }
}

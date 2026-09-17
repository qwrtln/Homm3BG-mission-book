// Locates the repository root from a test file, so tests can read the book's
// own .tex files without depending on the current working directory.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/** The repository root: web/tests/helpers/ is three levels below it. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Reads a repository file by its repository-relative path, as the app does. */
export function readRepoFile(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

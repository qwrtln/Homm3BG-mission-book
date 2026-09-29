// Whether the open scenario differs from what was last opened or saved.
// Kept free of the DOM so the rule can be tested on its own.

/**
 * A comparable fingerprint of the staged uploads: same files, same bytes in
 * length, same signature.
 *
 * @param {Map<string, Uint8Array>} files repository path -> bytes
 * @returns {string}
 */
export function uploadsSignature(files) {
  return [...files]
    .map(([path, bytes]) => `${path}:${bytes.byteLength}`)
    .sort()
    .join("\n");
}

/**
 * @typedef {object} Baseline
 * @property {string | null} text the source as opened or last saved; null when there is no such copy to compare with
 * @property {string} uploads the uploadsSignature of that moment
 */

/**
 * @param {Baseline} baseline
 * @param {{text: string, uploads: string}} now
 * @returns {boolean} true when leaving would lose something not yet saved
 */
export function hasUnsavedChanges(baseline, now) {
  if (baseline.text === null) return true;
  return baseline.text !== now.text || baseline.uploads !== now.uploads;
}

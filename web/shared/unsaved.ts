// Whether the open scenario differs from what was last opened or saved.
// Kept free of the DOM so the rule can be tested on its own.

/**
 * A comparable fingerprint of the staged uploads: same files, same bytes in
 * length, same signature.
 *
 * @param files repository path -> bytes
 */
export function uploadsSignature(files: Map<string, Uint8Array>): string {
  return [...files]
    .map(([path, bytes]) => `${path}:${bytes.byteLength}`)
    .sort()
    .join("\n");
}

/**
 * uploadsSignature for the `{path, bytes}[]` shape staged uploads travel in
 * once they leave `state.uploadedFiles` (restoreUploads, the local store),
 * rather than the live Map.
 */
export function assetsSignature(assets: { path: string; bytes: Uint8Array }[]): string {
  return uploadsSignature(new Map(assets.map((a) => [a.path, a.bytes])));
}

export interface Baseline {
  /** the source as opened or last saved; null when there is no such copy to compare with */
  text: string | null;
  /** the uploadsSignature of that moment */
  uploads: string;
}

/**
 * @returns true when leaving would lose something not yet saved
 */
export function hasUnsavedChanges(baseline: Baseline, now: { text: string; uploads: string }): boolean {
  if (baseline.text === null) return true;
  return baseline.text !== now.text || baseline.uploads !== now.uploads;
}

/**
 * Whether a local copy should be offered against what is about to open.
 * A missing stored part (null) carries no opinion of its own and never
 * triggers an offer; only a stored part that differs from the loaded part
 * does.
 *
 * @param loaded the copy about to open
 * @param local what is stored locally; null = nothing stored
 * @returns true when the local copy should be offered instead
 */
export function shouldOfferLocalDraft(
  loaded: { text: string; uploads: string },
  local: { text: string | null; uploads: string | null },
): boolean {
  const textDiffers = local.text !== null && local.text !== loaded.text;
  const uploadsDiffer = local.uploads !== null && local.uploads !== loaded.uploads;
  return textDiffers || uploadsDiffer;
}

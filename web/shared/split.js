/** The source pane's share of the workspace, in percent, before any drag. */
export const DEFAULT_SPLIT = 50;

/**
 * A stored split, read back. Anything that is not a percentage strictly
 * between 0 and 100 (a missing key, a hand-edited value) falls back to the
 * default.
 *
 * @param {string | null} stored
 * @returns {number}
 */
export function parseSplit(stored) {
  const value = Number(stored);
  return stored !== null && stored.trim() !== "" && value > 0 && value < 100 ? value : DEFAULT_SPLIT;
}

/**
 * Clamps the source pane's share so both panes keep at least `minPx` of the
 * `totalPx` they share. When the space cannot hold two minimum panes, or has
 * no size at all (the workspace is hidden), the panes split evenly.
 *
 * @param {number} percent the wanted share of the source pane
 * @param {number} totalPx the width both panes share
 * @param {number} minPx the narrowest a pane may get
 * @returns {number}
 */
export function clampSplit(percent, totalPx, minPx) {
  if (!(totalPx > 2 * minPx)) return DEFAULT_SPLIT;
  const floor = (minPx / totalPx) * 100;
  return Math.min(100 - floor, Math.max(floor, percent));
}

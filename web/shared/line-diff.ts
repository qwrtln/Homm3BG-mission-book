/**
 * Longest middle section compared line by line. Past it, every line of the
 * middle counts as changed: the table would cost more than the answer is
 * worth.
 */
const MAX_DIFF_CELLS = 4_000_000;

/**
 * The lines of `after` that differ from `before`: each added or edited line,
 * and for text removed between two lines, the line now in its place.
 *
 * @returns 1-based line numbers in `after`
 */
export function changedLines(before: string, after: string): Set<number> {
  const changed: Set<number> = new Set();
  if (before === after) return changed;
  const old = before.split("\n");
  const now = after.split("\n");

  // Most edits touch one spot: skip the lines the two share at either end.
  let start = 0;
  while (start < old.length && start < now.length && old[start] === now[start]) start += 1;
  let oldEnd = old.length;
  let nowEnd = now.length;
  while (oldEnd > start && nowEnd > start && old[oldEnd - 1] === now[nowEnd - 1]) {
    oldEnd -= 1;
    nowEnd -= 1;
  }

  const mark = (index: number): void => {
    changed.add(Math.min(Math.max(index, 0), now.length - 1) + 1);
  };

  const oldCount = oldEnd - start;
  const nowCount = nowEnd - start;
  if (nowCount === 0) {
    mark(start); // a pure removal
    return changed;
  }
  if (oldCount === 0 || oldCount * nowCount > MAX_DIFF_CELLS) {
    for (let index = start; index < nowEnd; index += 1) mark(index);
    return changed;
  }

  // Longest common subsequence of the middles, filled from the end.
  const width = nowCount + 1;
  const table = new Uint32Array((oldCount + 1) * width);
  for (let i = oldCount - 1; i >= 0; i -= 1) {
    for (let j = nowCount - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        old[start + i] === now[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < oldCount && j < nowCount) {
    if (old[start + i] === now[start + j]) {
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      mark(start + j); // an old line removed here
      i += 1;
    } else {
      mark(start + j);
      j += 1;
    }
  }
  for (; j < nowCount; j += 1) mark(start + j);
  if (i < oldCount) mark(start + j);
  return changed;
}

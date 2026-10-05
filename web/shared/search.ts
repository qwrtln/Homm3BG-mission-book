// The welcome screen's search ranking: substring match ranked by position,
// falling back to letters found in order. Kept free of the DOM so tier 1 can
// test the ranking directly; app/modules/search.js renders it.

/**
 * Substring match ranked by position, else letters found in order (ranked
 * after any substring match).
 *
 * @param query what the contributor typed
 * @param text the candidate title
 * @returns lower is a better match; null means no match
 */
export function matchScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return idx;
  let qi = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      if (first === -1) first = i;
      last = i;
      qi += 1;
    }
  }
  if (qi < q.length) return null;
  return 1000 + (last - first);
}

export interface ResultGroup {
  book: "mission" | "draft";
  category: string;
  items: { entry: ScenarioEntry; score: number }[];
}

/**
 * Every matching entry, grouped by book and category, each group's items
 * sorted best-match first.
 *
 * @param entries every scenario the search can offer
 * @param categoryOrder display order for a book's categories (config.js's CATEGORY_ORDER)
 */
export function groupedResults(
  entries: ScenarioEntry[],
  query: string,
  categoryOrder: readonly string[],
): ResultGroup[] {
  /** "book|category" -> group */
  const groups: Map<string, ResultGroup> = new Map();
  for (const entry of entries) {
    const score = matchScore(query, entry.title);
    if (score === null) continue;
    const key = `${entry.book}|${entry.category}`;
    let group = groups.get(key);
    if (!group) {
      group = { book: entry.book, category: entry.category, items: [] };
      groups.set(key, group);
    }
    group.items.push({ entry, score });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.book !== b.book) return a.book === "mission" ? -1 : 1;
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  });
}

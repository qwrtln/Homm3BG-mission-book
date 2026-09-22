import { DRAFT_GROUP_FILES, GROUP_FILES, parseScenarioIndex, scenarioHeading } from "../../shared/build-plan.js";
import { CATEGORY_LABELS } from "./config.js";
import { fetchRepoFile } from "./files.js";
import { state } from "./state.js";

/**
 * Reads one book's group files and turns every scenario they list into an
 * entry the search can offer.
 *
 * @param {import("../../shared/build-plan.js").GroupFile[]} groupFiles
 * @param {"mission" | "draft"} book
 * @returns {Promise<ScenarioEntry[]>}
 */
export async function loadGroup(groupFiles, book) {
  /** @type {{path: string, source: string}[]} */
  const sources = [];
  for (const group of groupFiles) {
    sources.push({
      path: group.path,
      source: /** @type {string} */ ((await fetchRepoFile(group.path)).content),
    });
  }
  const index = parseScenarioIndex(sources, groupFiles);
  return Promise.all(
    index.map(async (item) => {
      const source = /** @type {string} */ ((await fetchRepoFile(item.path)).content);
      const heading = scenarioHeading(source);
      // split always yields at least one element, so pop never returns undefined.
      const categoryKey = /** @type {string} */ (item.dir.split("/").pop());
      return {
        path: item.path,
        book,
        category: CATEGORY_LABELS[categoryKey] || categoryKey,
        title: heading ? heading.title : item.path,
        isTemplate: false,
      };
    }),
  );
}

/**
 * Loads both books into state.entries, mission first.
 *
 * @returns {Promise<void>}
 */
export async function loadEntries() {
  const [mission, draft] = await Promise.all([
    loadGroup(GROUP_FILES, "mission"),
    loadGroup(DRAFT_GROUP_FILES, "draft"),
  ]);
  state.entries = [...mission, ...draft];
}

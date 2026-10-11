import {
  DRAFT_GROUP_FILES,
  GROUP_FILES,
  type GroupFile,
  parseScenarioIndex,
  scenarioHeading,
} from "../../shared/build-plan.ts";
import { store } from "../store.ts";
import { CATEGORY_LABELS } from "./config.ts";
import { fetchRepoFile } from "./files.ts";

/**
 * Reads one book's group files and turns every scenario they list into an
 * entry the search can offer.
 */
export async function loadGroup(groupFiles: GroupFile[], book: "mission" | "draft"): Promise<ScenarioEntry[]> {
  const sources: { path: string; source: string }[] = [];
  for (const group of groupFiles) {
    sources.push({
      path: group.path,
      source: (await fetchRepoFile(group.path)).content as string,
    });
  }
  const index = parseScenarioIndex(sources, groupFiles);
  return Promise.all(
    index.map(async (item) => {
      const source = (await fetchRepoFile(item.path)).content as string;
      const heading = scenarioHeading(source);
      // split always yields at least one element, so pop never returns undefined.
      const categoryKey = item.dir.split("/").pop() as string;
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

/** Loads both books into store.getState().entries, mission first. */
export async function loadEntries(): Promise<void> {
  const [mission, draft] = await Promise.all([
    loadGroup(GROUP_FILES, "mission"),
    loadGroup(DRAFT_GROUP_FILES, "draft"),
  ]);
  store.setState({ entries: [...mission, ...draft] });
}

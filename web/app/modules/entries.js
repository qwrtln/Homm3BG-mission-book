import { GROUP_FILES, DRAFT_GROUP_FILES, parseScenarioIndex, scenarioHeading } from "../../shared/build-plan.js";
import { CATEGORY_LABELS } from "./config.js";
import { state } from "./state.js";
import { fetchRepoFile } from "./files.js";

export async function loadGroup(groupFiles, book) {
  const sources = [];
  for (const group of groupFiles) {
    sources.push({ path: group.path, source: (await fetchRepoFile(group.path)).content });
  }
  const index = parseScenarioIndex(sources, groupFiles);
  return Promise.all(index.map(async (item) => {
    const source = (await fetchRepoFile(item.path)).content;
    const heading = scenarioHeading(source);
    const categoryKey = item.dir.split("/").pop();
    return {
      path: item.path,
      book,
      category: CATEGORY_LABELS[categoryKey] || categoryKey,
      title: heading ? heading.title : item.path,
      isTemplate: false,
    };
  }));
}

export async function loadEntries() {
  const [mission, draft] = await Promise.all([
    loadGroup(GROUP_FILES, "mission"),
    loadGroup(DRAFT_GROUP_FILES, "draft"),
  ]);
  state.entries = [...mission, ...draft];
}

import { state } from "./state.ts";

const APP_TITLE = "Heroes III: The Board Game – Scenario Builder";

/**
 * Names the open scenario: the shared state (which the header renders) and
 * the tab title. An empty title means no scenario is open, and the tab gets
 * the app's name.
 */
export function setScenarioTitle(title: string): void {
  state.chosenTitle = title;
  document.title = title ? `${title} – Heroes III: The Board Game` : APP_TITLE;
}

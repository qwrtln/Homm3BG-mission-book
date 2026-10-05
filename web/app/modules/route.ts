import { buildRoute, pathToSlug } from "../../shared/route.ts";
import { githubSaveState } from "./github-save-state.js";
import { state } from "./state.ts";

/**
 * Puts the open scenario's address in the URL, without adding a history entry.
 * Call once state.chosenPath and githubSaveState.edit are settled.
 */
export function reflectRoute(): void {
  if (!state.chosenPath) return;
  const kind = githubSaveState.edit ? "updates" : "drafts";
  history.replaceState(null, "", buildRoute(kind, pathToSlug(kind, state.chosenPath)));
}

/** Removes the scenario address from the URL: nothing matched it. */
export function clearRoute(): void {
  history.replaceState(null, "", location.pathname + location.search);
}

/**
 * Ends the loading screen an address-named scenario shows while it is looked
 * up. What is left on screen is the workspace, or the welcome screen.
 */
export function endRouteLoading(): void {
  document.documentElement.classList.remove("route-pending");
}

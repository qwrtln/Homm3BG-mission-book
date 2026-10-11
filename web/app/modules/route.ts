import { buildRoute, pathToSlug } from "../../shared/route.ts";
import { store } from "../store.ts";
import { githubSaveState } from "./github-save-state.ts";

/**
 * Puts the open scenario's address in the URL, without adding a history entry.
 * Call once the store's chosenPath and githubSaveState.edit are settled.
 */
export function reflectRoute(): void {
  const { chosenPath } = store.getState();
  if (!chosenPath) return;
  const kind = githubSaveState.edit ? "updates" : "drafts";
  history.replaceState(null, "", buildRoute(kind, pathToSlug(kind, chosenPath)));
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

import { store } from "../store.ts";

let nextToastId = 1;

/**
 * Shows a short notice in the page's corner, for the modules not yet
 * migrated to components. The Toaster component renders it; showing another
 * while one is up replaces it and restarts the timer.
 *
 * @param message plain text
 */
export function showToast(message: string, tone: "ok" | "bad" = "ok"): void {
  store.setState({ toast: { id: nextToastId++, message, tone } });
}

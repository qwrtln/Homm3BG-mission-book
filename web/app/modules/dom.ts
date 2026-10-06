import { basenameNoExt, escapeHtml, sanitizeFilename } from "../../shared/dom-strings.ts";
import { isMacPlatform, keyLabel, shortcutKeys } from "../../shared/keymap.ts";
import { type ConfirmOptions, requestConfirm, store } from "../store.ts";

export { basenameNoExt, escapeHtml, sanitizeFilename };

/** Whether the browser is running on macOS or iOS, read from the platform the browser itself reports. */
export function isMac(): boolean {
  return isMacPlatform(navigator.userAgentData?.platform || navigator.platform);
}

/** The build key's label for this platform, e.g. "Ctrl+Enter" or "⌘↩". */
export function buildKeyLabel(): string {
  const mac = isMac();
  return keyLabel(shortcutKeys("build", mac)[0], mac);
}

/** The status shown once a scenario is open and nothing differs from what is shown, naming how to start a build. */
export function readyStatus(): string {
  return `Ready. Press Build PDF or ${buildKeyLabel()} to start.`;
}

/**
 * Records the Build button's idle title, naming the build key for this
 * platform (e.g. "Build PDF (Ctrl+Enter)"). The header renders it from the
 * store. Call once at init, since setBuilding may not run before the first
 * build.
 *
 * @param mac true to name the macOS key alternative
 */
export function initBuildTitle(mac: boolean): void {
  const label = keyLabel(shortcutKeys("build", mac)[0], mac);
  store.setState({ buildIdleTitle: `Build PDF (${label})` });
}

/**
 * One element by id, typed from the id itself: `el("workspace")` is an
 * HTMLDivElement, `el("welcome")` an HTMLElement. The mapping lives in
 * web/types/dom-ids.d.ts, so a mistyped id fails the type check.
 *
 * The result is not nullable, because a missing element throws here instead
 * of returning null. tests/unit/dom-ids.test.mjs checks the map against
 * app/index.html, so drift between the two is caught there rather than as an
 * undefined property access further on.
 */
export function el<K extends keyof ElementIdMap>(id: K): ElementIdMap[K] {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`app/index.html has no element with id "${id}".`);
  return element as ElementIdMap[K];
}

/**
 * The nearest ancestor of an event's target matching `selector`, for
 * delegated handlers. Null when the event did not start on an element, or
 * when nothing up the tree matches.
 */
export function closestTo(event: Event, selector: string): HTMLElement | null {
  const { target } = event;
  if (!(target instanceof Element)) return null;
  const match = target.closest(selector);
  return match instanceof HTMLElement ? match : null;
}

/**
 * Asks the contributor to confirm a destructive action in the page's own
 * modal. Escape, the backdrop-less Cancel button and closing all answer no.
 *
 * @param message what is about to be deleted
 * @returns true only when "Delete" was pressed
 */
export function confirmDelete(message: string): Promise<boolean> {
  return confirmAction({
    title: "Delete this work in progress?",
    message,
    warning: "This cannot be undone.",
    okLabel: "Delete",
    danger: true,
  });
}

/**
 * Asks in the page's own modal, the ConfirmDialog component. Escape and
 * Cancel answer no; Cancel has focus.
 *
 * @returns true only when the confirming button was pressed
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return requestConfirm(options);
}

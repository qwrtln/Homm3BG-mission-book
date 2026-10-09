import { basenameNoExt, escapeHtml, sanitizeFilename } from "../../shared/dom-strings.ts";
import { isMacPlatform, keyLabel, shortcutKeys } from "../../shared/keymap.ts";
import { type ConfirmChoice, type ConfirmOptions, requestChoice, requestConfirm, store } from "../store.ts";

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

/**
 * Asks in the page's own modal with up to three buttons: set `altLabel` for the
 * middle one. Escape and Cancel answer "cancel"; Cancel has focus.
 *
 * @returns the button that was pressed
 */
export function chooseAction(options: ConfirmOptions): Promise<ConfirmChoice> {
  return requestChoice(options);
}

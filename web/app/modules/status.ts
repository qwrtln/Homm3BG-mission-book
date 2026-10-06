import { type StatusState, store } from "../store.ts";
import { buildButtonWidth } from "./build-button.ts";
import { buildKeyLabel } from "./dom.ts";

/**
 * Writes the status bar, which renders from the store. `spinning` turns the
 * spinner beside the text; `tone` colours it.
 */
export function setStatus(
  text: string,
  { spinning = false, tone = "" }: Partial<Omit<StatusState, "text">> = {},
): void {
  store.setState({ status: { text, spinning, tone } });
}

/**
 * Enters or leaves the building state: the Build button, the progress bar
 * and the step label together. While building, the Build button turns into
 * Stop. The PDF pane stays readable under the bar.
 */
export function setBuilding(value: boolean): void {
  // Pin the Build width while the shorter "Stop" shows, measured, not guessed:
  // fonts differ, and a shrinking button slides its neighbours under the pointer.
  // Measured before the store changes: the header re-renders the label from it.
  const minWidth = value ? buildButtonWidth() : null;
  // One write, so the button and the progress bar change in the same render.
  store.setState((state) => ({
    building: value,
    buildDisabled: !value && !state.chosenPath,
    buildMinWidth: minWidth,
  }));
}

/**
 * Names the build's current step on the PDF pane: in the label over the
 * pages, and in the caption under the spinner when the pane has no PDF yet.
 *
 * @param text short: it sits over the PDF
 */
export function setBuildPhase(text: string): void {
  store.setState((state) => ({
    buildPhase: text,
    pdfPane: state.pdfPane.kind === "loading" ? { kind: "loading", text } : state.pdfPane,
  }));
}

/** What the status bar says when the shown PDF no longer matches the editor. */
export function staleMessage(): string {
  return `Source changed since last build. Press ${buildKeyLabel()} to rebuild.`;
}

/**
 * Says in the status bar, after every edit, that the shown PDF no longer
 * matches the editor. Silent when no PDF is shown, and while the status bar
 * reports an action still under way (it spins): the next edit says it
 * instead. Derived from the store's `editorText` and the shown PDF's source,
 * so no caller has to ask for it.
 */
export function initStaleStatus(): void {
  store.subscribe((state, previous) => {
    if (state.editorText === previous.editorText) return;
    if (!state.lastPdf || state.pdfSource === null) return;
    if (state.editorText === state.pdfSource || state.status.spinning) return;
    setStatus(staleMessage());
  });
}

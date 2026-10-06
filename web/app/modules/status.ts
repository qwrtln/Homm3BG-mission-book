import { type StatusState, type StoreState, store } from "../store.ts";
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
  store.setState((state) => ({ status: { text, spinning, tone }, statusEditCount: state.editCount }));
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
 * Whether the status bar says the shown PDF no longer matches the editor,
 * in place of the last status: an edit came after that status, and the text
 * differs from the PDF's source. Never over an action still under way (the
 * status spins); a status written after the edit wins until the next one.
 */
export function showsStale(state: StoreState): boolean {
  if (!state.lastPdf || state.pdfSource === null) return false;
  if (state.status.spinning || state.statusEditCount >= state.editCount) return false;
  return state.editorText !== state.pdfSource;
}

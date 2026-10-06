import { Editor } from "../editor/Editor.tsx";
import { Panes } from "./Panes.tsx";
import { PdfView } from "./PdfView.tsx";
import { StatusBar } from "./StatusBar.tsx";

/**
 * Everything inside the workspace: the source and PDF panes with their
 * divider, and the status bar under both. `#workspace` itself stays in
 * index.html, because the modules show and hide it.
 */
export function Workspace() {
  return (
    <>
      <Panes source={<Editor />} pdf={<PdfView />} />
      <StatusBar />
    </>
  );
}

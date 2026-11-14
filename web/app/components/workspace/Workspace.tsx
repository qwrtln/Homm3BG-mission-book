import { Editor } from "../editor/Editor.tsx";
import { Panes } from "./Panes.tsx";
import { PdfView } from "./PdfView.tsx";
import { StatusBar } from "./StatusBar.tsx";

/**
 * Everything inside the workspace: the source and PDF panes with their
 * divider, and the status bar under both. `App.tsx` renders `#workspace`
 * around it, and the modules show and hide that element.
 */
export function Workspace() {
  return (
    <>
      <Panes source={<Editor />} pdf={<PdfView />} />
      <StatusBar />
    </>
  );
}

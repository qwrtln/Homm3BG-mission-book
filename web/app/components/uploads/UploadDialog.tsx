import { MAP_EDITOR_URL } from "../../modules/upload-panel.ts";
import { dialogClosed, useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Dialog, DialogTitle } from "../ui/Dialog.tsx";
import { Link } from "../ui/Link.tsx";
import { UploadPanel } from "./UploadPanel.tsx";

/**
 * The header's Upload images button opens this dialog. No server: a chosen
 * file never leaves the browser, it joins the virtual filesystem the build
 * compiles from, under an editable target name.
 */
export function UploadDialog() {
  const open = useAppStore((s) => s.dialogs.upload);

  return (
    <Dialog id="upload-dialog" labelledBy="upload-title" open={open} onClose={() => dialogClosed("upload")}>
      <div className="flex flex-col gap-3.5 text-[0.82rem]">
        <DialogTitle id="upload-title">Upload images</DialogTitle>
        <UploadPanel
          panel="dialog"
          mapCodes
          headerHint="PNG or JPG. Named after the scenario; rename it if you like."
          mapsHint={
            <>
              PNG exported from the{" "}
              <Link href={MAP_EDITOR_URL} external>
                map editor
              </Link>
              . Add one image for the whole scenario, or one per player-count layout and tick the counts it is for.
            </>
          }
        />
        <div className="flex justify-end">
          <Button id="upload-done" variant="primary" type="submit" value="done">
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

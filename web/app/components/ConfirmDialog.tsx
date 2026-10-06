import { useEffect, useRef } from "react";
import { answerConfirm, type ConfirmOptions, useAppStore } from "../store.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";

/** What the dialog says while it is closed, so it never renders empty. */
const IDLE: ConfirmOptions = { title: "", message: "", warning: "", okLabel: "OK", danger: false };

/**
 * The page's own confirmation, behind confirmAction() in modules/dom.ts.
 * Escape and Cancel answer no; Cancel has focus, the safe default.
 */
export function ConfirmDialog() {
  const request = useAppStore((state) => state.confirm);
  const cancel = useRef<HTMLButtonElement>(null);
  const { title, message, warning, okLabel, cancelLabel = "Cancel", danger } = request?.options ?? IDLE;

  useEffect(() => {
    if (request !== null) cancel.current?.focus();
  }, [request]);

  return (
    <Dialog
      id="confirm-dialog"
      labelledBy="confirm-title"
      open={request !== null}
      onClose={(returnValue) => answerConfirm(returnValue === "confirm")}
    >
      <DialogTitle id="confirm-title">{title}</DialogTitle>
      <p id="confirm-message" className="mb-2">
        {message}
      </p>
      <p id="confirm-warning" className="mb-2 font-semibold text-bad" hidden={warning === ""}>
        {warning}
      </p>
      <DialogActions>
        <Button ref={cancel} id="confirm-cancel" type="submit" value="cancel">
          {cancelLabel}
        </Button>
        <Button id="confirm-ok" variant={danger ? "danger" : undefined} type="submit" value="confirm">
          {okLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

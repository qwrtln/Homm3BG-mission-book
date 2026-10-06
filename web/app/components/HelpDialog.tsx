import { useEffect } from "react";
import { keyLabel, matchesKey, SHORTCUTS, shortcutKeys } from "../../shared/keymap.ts";
import { isMac } from "../modules/dom.ts";
import { dialogClosed, openDialog, useAppStore } from "../store.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";

/**
 * The menu's Help item and the F1 key open this dialog. It lists every
 * keyboard shortcut from web/shared/keymap.ts, one row per SHORTCUTS entry in
 * table order. Each section is its own <section>, so a later section adds
 * without restructuring.
 */
export function HelpDialog() {
  const open = useAppStore((state) => state.dialogs.help);
  const mac = isMac();

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (!shortcutKeys("help", mac).some((key) => matchesKey(event, key))) return;
      event.preventDefault();
      openDialog("help");
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [mac]);

  return (
    <Dialog id="help-dialog" labelledBy="help-title" size="md" open={open} onClose={() => dialogClosed("help")}>
      <DialogTitle id="help-title">Help</DialogTitle>
      <section>
        <h3 className="mt-5 mb-1 text-body font-bold">Keyboard shortcuts</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-line py-1.5 pr-2 pl-0 text-left text-small font-semibold text-muted">
                Action
              </th>
              <th className="border-b border-line py-1.5 pr-2 pl-0 text-left text-small font-semibold text-muted">
                Keys
              </th>
            </tr>
          </thead>
          <tbody id="help-shortcuts">
            {SHORTCUTS.map((row) => (
              <tr key={row.id} data-shortcut={row.id} className="[&:last-child>td]:border-b-0">
                <td className="border-b border-line py-2 pr-2">{row.description}</td>
                <td className="border-b border-line py-2 pr-2">
                  {shortcutKeys(row.id, mac).map((key) => (
                    <kbd
                      key={key}
                      className="mr-1 mb-1 inline-block rounded-sm border border-line bg-code-bg px-1.5 py-0.5 font-mono text-[12px] leading-snug"
                    >
                      {keyLabel(key, mac)}
                    </kbd>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <DialogActions>
        <Button id="help-close" type="submit" value="close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

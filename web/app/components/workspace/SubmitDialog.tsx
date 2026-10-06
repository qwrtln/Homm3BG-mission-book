import { useEffect, useRef, useState } from "react";
import { CHECKLIST_ITEMS, type ChecklistItem } from "../../../shared/submit-checklist.ts";
import { answerSubmit, BLOCKER_TEXT, currentSubmitBlockers } from "../../modules/submit.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Checkbox } from "../ui/Checkbox.tsx";
import { Dialog, DialogActions, DialogTitle } from "../ui/Dialog.tsx";

/** A checklist item's text, with each `*word*` as an <em>. Built from text nodes, never markup. */
function Emphasized({ text }: { text: string }) {
  let offset = 0;
  const segments = text.split(/\*([^*]+)\*/).map((part, index) => {
    const segment = { part, emphasized: index % 2 === 1, at: offset };
    offset += part.length + 1; // a segment starts after the previous one and its marker
    return segment;
  });
  return <>{segments.map(({ part, emphasized, at }) => (emphasized ? <em key={at}>{part}</em> : part))}</>;
}

/**
 * "Before you open a pull request": the unmet conditions, then the
 * checklist, behind askToSubmit() in modules/submit.ts. The conditions are
 * read from the store's fields as they change, so a build or a save that ends
 * under the open dialog updates it. Cancel has focus, the safe default.
 */
export function SubmitDialog() {
  const request = useAppStore((s) => s.submit);
  // The conditions read these; subscribing re-renders the dialog when one changes.
  useAppStore((s) => s.building);
  useAppStore((s) => s.dirty);
  useAppStore((s) => s.clean);
  useAppStore((s) => s.lastPdf);
  useAppStore((s) => s.pdfSource);
  useAppStore((s) => s.pdfUploads);
  const blockers = request === null ? [] : currentSubmitBlockers();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Every opening starts with every box unticked.
    setTicked(new Set());
    if (request !== null) cancel.current?.focus();
  }, [request]);

  const checklist = request?.checklist ?? false;
  const ready = blockers.length === 0 && (!checklist || ticked.size === CHECKLIST_ITEMS.length);

  const onClose = (returnValue: string) => {
    if (request === null) return;
    // Checked again here, not trusted from when the dialog opened.
    const items: ChecklistItem[] | null =
      returnValue === "confirm" && ready ? (checklist ? CHECKLIST_ITEMS.filter((i) => ticked.has(i.id)) : []) : null;
    answerSubmit(items);
  };

  return (
    <Dialog id="submit-dialog" labelledBy="submit-title" size="lg" open={request !== null} onClose={onClose}>
      <DialogTitle id="submit-title">Before you open a pull request</DialogTitle>
      {blockers.length > 0 && (
        <ul id="submit-blockers" className="mb-3 list-disc pl-5 font-semibold text-bad">
          {blockers.map((blocker) => (
            <li key={blocker} className="mt-1 first:mt-0">
              {BLOCKER_TEXT[blocker]}
            </li>
          ))}
        </ul>
      )}
      {/* The checklist vouches for the saved, built scenario, so it cannot be ticked until there is one. */}
      <fieldset
        id="submit-checklist"
        hidden={!checklist}
        disabled={blockers.length > 0}
        className="m-0 min-w-0 border-0 p-0 disabled:opacity-50"
      >
        <legend className="mb-2 p-0 text-small text-muted">Tick each one to confirm it.</legend>
        <div className="flex flex-col gap-2.5">
          {CHECKLIST_ITEMS.map((item) => (
            <Checkbox
              key={item.id}
              value={item.id}
              checked={ticked.has(item.id)}
              onChange={(event) => {
                const next = new Set(ticked);
                if (event.target.checked) next.add(item.id);
                else next.delete(item.id);
                setTicked(next);
              }}
              label={
                <>
                  <strong>{item.label}:</strong> <Emphasized text={item.text} />
                </>
              }
            />
          ))}
        </div>
      </fieldset>
      <DialogActions>
        <Button ref={cancel} id="submit-cancel" type="submit" value="cancel">
          Cancel
        </Button>
        <Button id="submit-confirm" variant="primary" type="submit" value="confirm" disabled={!ready}>
          Open pull request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

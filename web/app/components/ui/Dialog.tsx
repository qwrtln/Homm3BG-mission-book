import { type ReactNode, useEffect, useRef } from "react";

export type DialogSize = "sm" | "md" | "lg";

const SIZES: Record<DialogSize, string> = {
  sm: "max-w-[min(26rem,calc(100vw-2rem))]",
  md: "max-w-[min(30rem,calc(100vw-2rem))]",
  lg: "max-w-[min(38rem,calc(100vw-2rem))]",
};

export interface DialogProps {
  id: string;
  /** The id of the element that names the dialog; usually its DialogTitle. */
  labelledBy: string;
  open: boolean;
  /** Runs when the dialog closes, however it closed: Escape, a submit button, a backdrop click or `open` going false. */
  onClose: (returnValue: string) => void;
  /** Whether a click on the backdrop, outside the dialog's box, closes it. */
  closeOnBackdrop?: boolean;
  size?: DialogSize;
  children: ReactNode;
}

/**
 * A native modal <dialog>, opened with showModal() and closed with close(), so
 * focus trapping, Escape and focus return to the opener come from the browser.
 * Its content sits in a method="dialog" form: a submit button closes it and
 * becomes its returnValue.
 */
export function Dialog({ id, labelledBy, open, onClose, closeOnBackdrop = false, size = "sm", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.returnValue = ""; // Escape leaves it as it was, so an old answer must not linger
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click's keyboard twin is Escape, which the browser handles
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      onClose={(event) => onClose(event.currentTarget.returnValue)}
      onClick={(event) => {
        // A backdrop click targets the <dialog> itself, as does one on its own padding: the box tells them apart.
        const dialog = event.currentTarget;
        if (!closeOnBackdrop || event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;
        if (!inside) dialog.close();
      }}
      className={`${SIZES[size]} rounded-lg border border-line bg-panel px-6 py-5 text-ink shadow-dialog backdrop:bg-backdrop`}
    >
      <form method="dialog">{children}</form>
    </dialog>
  );
}

export function DialogTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-2 text-heading font-bold">
      {children}
    </h2>
  );
}

/** The row of buttons at the bottom of a dialog. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

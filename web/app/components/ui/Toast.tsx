import { useEffect, useRef } from "react";

// Long enough to read a short sentence twice.
const TOAST_MS = 4000;

export interface ToastProps {
  /** Null until the first notice. */
  message: string | null;
  tone: "ok" | "bad";
  /** Changes with every notice, so the same text shown twice still restarts the timer. */
  shownKey: number;
}

/**
 * A short notice in the page's corner, hidden after a few seconds. It is a
 * popover, so it lands in the top layer above an open modal dialog; showing
 * it again moves it back on top.
 */
export function Toast({ message, tone, shownKey }: ToastProps) {
  const ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: shownKey is the trigger, not a value the effect reads
  useEffect(() => {
    const element = ref.current;
    if (!element || message === null) return;
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
    const timer = setTimeout(() => {
      if (element.matches(":popover-open")) element.hidePopover();
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, shownKey]);

  return (
    <div
      ref={ref}
      id="toast"
      popover="manual"
      role="status"
      aria-live="polite"
      className={`top-auto right-4 bottom-4 left-auto m-0 max-w-[min(24rem,calc(100vw-2rem))] rounded-md border border-l-3 border-line bg-panel px-3.5 py-2.5 text-small text-ink shadow-toast ${tone === "bad" ? "border-l-bad" : "border-l-ok"}`}
    >
      {message}
    </div>
  );
}

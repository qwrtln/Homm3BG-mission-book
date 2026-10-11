import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

type FocusTarget = "first" | "last" | "toggle" | "none";

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"]';

/**
 * The behavior of one ARIA menu, for the toggle button and the list it opens:
 * the toggle opens and closes it, the arrow keys move through it, and Escape,
 * Tab, a pick or a click outside close it. Spread `toggleProps` on the
 * button and `menuProps` on the list, and give them the two refs.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** The items a contributor can reach now: hidden ones are skipped. */
  const items = (): HTMLElement[] =>
    [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])].filter((item) => !item.hidden);

  // Flushed before focusing: an item cannot take focus while its list is still hidden.
  const setMenuOpen = (next: boolean, focus: FocusTarget = "none") => {
    flushSync(() => setOpen(next));
    const reachable = items();
    if (focus === "first") reachable[0]?.focus();
    if (focus === "last") reachable[reachable.length - 1]?.focus();
    if (focus === "toggle") toggleRef.current?.focus();
  };

  const moveFocus = (step: number) => {
    const reachable = items();
    if (!reachable.length) return;
    const current = reachable.indexOf(document.activeElement as HTMLElement);
    reachable[(current + step + reachable.length) % reachable.length]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && (menuRef.current?.contains(target) || toggleRef.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const toggleProps = {
    ref: toggleRef,
    "aria-expanded": open,
    onClick: () => setMenuOpen(!open, open ? "none" : "first"),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setMenuOpen(true, event.key === "ArrowDown" ? "first" : "last");
      }
    },
  };

  const menuProps = {
    ref: menuRef,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const reachable = items();
        reachable[event.key === "Home" ? 0 : reachable.length - 1]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false, "toggle");
      } else if (event.key === "Tab") {
        setMenuOpen(false);
      }
    },
    // Capture phase: the menu closes, and focus returns to its button, before
    // the item's own handler runs. Focus is never left on a hidden item, and a
    // dialog an item opens later hands focus back to the button.
    onClickCapture: (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[role^='menuitem']")) setMenuOpen(false, "toggle");
    },
  };

  return { open, toggleProps, menuProps };
}

import type { ComponentProps } from "react";

export interface MenuListProps extends ComponentProps<"div"> {
  open: boolean;
  /** The menu's accessible name. */
  label: string;
}

/** The dropdown an ARIA menu button opens, hanging under its nearest `relative` ancestor. Kept in the DOM while closed, so the button's aria-controls always names it. */
export function MenuList({ open, label, className = "", ...props }: MenuListProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      hidden={!open}
      className={`absolute top-full right-0 z-20 mt-1.5 min-w-48 flex-col rounded-md border border-line bg-panel py-1 shadow-toast ${open ? "flex" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

/** One row of a MenuList. Not in the tab order: the arrow keys move between rows (see useMenu). */
export function MenuItem({ className = "", type = "button", role = "menuitem", ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      role={role}
      tabIndex={-1}
      className={`group flex min-h-8 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-1 text-left text-ui whitespace-nowrap text-ink hover:bg-paper focus-visible:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${className}`.trim()}
      {...props}
    />
  );
}

/** A rule between groups of rows. */
export function MenuSeparator(props: ComponentProps<"hr">) {
  return <hr className="my-1 border-0 border-t border-line" {...props} />;
}

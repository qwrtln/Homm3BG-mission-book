import type { ComponentProps, ReactNode } from "react";

export interface DisclosureProps extends Omit<ComponentProps<"details">, "onToggle" | "open" | "children"> {
  summary: ReactNode;
  open: boolean;
  /** Reports the native toggle event with the new state. */
  onToggle: (open: boolean) => void;
  children?: ReactNode;
}

/** A native details/summary in the Primer look: a chevron that turns when open, and the shared focus ring. */
export function Disclosure({ summary, open, onToggle, className = "", children, ...props }: DisclosureProps) {
  return (
    <details
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className={`group ${className}`.trim()}
      {...props}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-body font-semibold text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="currentColor"
          className="flex-none transition-transform duration-75 group-open:rotate-90"
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        {summary}
      </summary>
      {children}
    </details>
  );
}

import type { ComponentProps } from "react";

/** A drop-down in the GitHub Primer look, light and dark. A disabled one reads as fixed, not faded. */
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`rounded-sm border border-line bg-panel px-1 py-0.5 text-small text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:text-muted disabled:opacity-100 ${className}`.trim()}
      {...props}
    />
  );
}

import type { ComponentProps } from "react";

export interface LinkProps extends ComponentProps<"a"> {
  /** "hover" shows the underline only under the pointer, for a link that is a whole row. */
  underline?: "always" | "hover";
  /** Opens in a new tab, without handing the new page a reference to this one. */
  external?: boolean;
}

/** A hyperlink in the accent color, with a visible keyboard focus ring. */
export function Link({ underline = "always", external = false, className = "", ...props }: LinkProps) {
  const decoration = underline === "always" ? "underline" : "no-underline hover:underline";
  return (
    <a
      className={`text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${decoration} ${className}`.trim()}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      {...props}
    />
  );
}

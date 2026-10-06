import type { ComponentProps, ReactNode } from "react";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  label: ReactNode;
  /** "center" lines the box up with a label that carries an image; "start" keeps it on the first line of a long one. */
  align?: "start" | "center";
}

/** Primer's checkbox: a small rounded box that fills with the accent and a white tick, inside its label. */
export function Checkbox({ label, align = "start", className = "", ...props }: CheckboxProps) {
  return (
    <label className={`group flex cursor-pointer gap-2 ${align === "center" ? "items-center" : "items-start"}`}>
      <input
        type="checkbox"
        className={`m-0 ${align === "center" ? "" : "mt-0.5"} grid size-4 flex-none cursor-pointer appearance-none place-content-center rounded-sm border border-muted bg-panel transition-colors duration-75 before:size-2.5 before:scale-0 before:bg-on-emphasis before:transition-transform before:duration-75 before:content-[''] before:[clip-path:polygon(14%_44%,0_58%,38%_96%,100%_22%,86%_8%,38%_68%)] checked:border-accent checked:bg-accent checked:before:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed group-hover:enabled:not-checked:border-accent ${className}`.trim()}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

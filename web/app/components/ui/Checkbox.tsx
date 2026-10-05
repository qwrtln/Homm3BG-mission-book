import type { ComponentProps, ReactNode } from "react";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  label: ReactNode;
}

/** Primer's checkbox: a small rounded box that fills with the accent and a white tick, inside its label. */
export function Checkbox({ label, className = "", ...props }: CheckboxProps) {
  return (
    <label className="group flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        className={`m-0 mt-0.5 grid size-4 flex-none cursor-pointer appearance-none place-content-center rounded-sm border border-muted bg-panel transition-colors duration-75 before:size-[0.6rem] before:scale-0 before:bg-white before:transition-transform before:duration-75 before:content-[''] before:[clip-path:polygon(14%_44%,0_58%,38%_96%,100%_22%,86%_8%,38%_68%)] checked:border-accent checked:bg-accent checked:before:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed group-hover:enabled:not-checked:border-accent ${className}`.trim()}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

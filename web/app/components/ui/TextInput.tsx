import type { ComponentProps } from "react";

export type TextInputProps = ComponentProps<"input">;

/** The app's single-line text field: Primer border and fill, an accent border on focus, a red one when invalid. */
export function TextInput({ type = "text", className = "", ...props }: TextInputProps) {
  return (
    <input
      type={type}
      className={`w-full rounded-sm border border-line bg-panel px-3 py-2 text-body text-ink focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-bad ${className}`.trim()}
      {...props}
    />
  );
}

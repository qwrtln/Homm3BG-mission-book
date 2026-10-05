import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "link" | "withIcon" | "icon" | "danger" | "attention";

/** Every variant spells out its own colors: Tailwind orders utilities by property, not by class order, so a shared color would fight a variant's. */
const BASE =
  "cursor-pointer rounded-sm border text-ui focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const NEUTRAL = "border-line bg-panel text-ink hover:enabled:border-accent hover:enabled:text-accent";
/** Primer's disabled look: grey reads as unavailable, where a faded colour reads as merely faint. */
const DISABLED = "disabled:cursor-default disabled:border-line disabled:bg-paper disabled:text-muted";

const VARIANTS: Record<ButtonVariant | "default", string> = {
  default: `${NEUTRAL} px-4 py-2`,
  primary:
    "border-primary bg-primary px-4 py-2 font-semibold text-white hover:enabled:border-primary-hover hover:enabled:bg-primary-hover",
  link: "border-transparent bg-transparent px-1 py-1 text-accent underline disabled:border-transparent disabled:bg-transparent",
  withIcon: `${NEUTRAL} inline-flex items-center justify-center gap-1.5 px-4 py-2`,
  icon: `${NEUTRAL} px-2.5 py-2 text-icon leading-none`,
  danger: "border-bad bg-bad px-4 py-2 text-white hover:enabled:brightness-90",
  attention:
    "border-attention-border bg-attention-bg px-4 py-2 text-warn hover:enabled:border-warn hover:enabled:bg-attention-hover-bg",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
}

/** The app's button in the GitHub Primer look, light and dark. Without a `variant` it is the neutral one. */
export function Button({ variant, type = "button", className = "", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANTS[variant ?? "default"]} ${DISABLED} ${className}`.trim()}
      {...props}
    />
  );
}

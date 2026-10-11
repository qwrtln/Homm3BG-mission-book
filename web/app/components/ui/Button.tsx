import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "link" | "withIcon" | "icon" | "danger" | "attention" | "stop";
export type ButtonSize = "default" | "compact";

/** Every variant spells out its own colors: Tailwind orders utilities by property, not by class order, so a shared color would fight a variant's. */
const BASE =
  "cursor-pointer rounded-sm border text-ui focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const NEUTRAL = "border-line bg-panel text-ink hover:enabled:border-accent hover:enabled:text-accent";
/** Primer's disabled look: grey reads as unavailable, where a faded colour reads as merely faint. */
const DISABLED = "disabled:cursor-default disabled:border-line disabled:bg-paper disabled:text-muted";
/** The icon, then the label, on one line. */
const ICONED = "inline-flex items-center justify-center gap-1.5";

const VARIANTS: Record<ButtonVariant | "default", string> = {
  default: NEUTRAL,
  primary:
    "border-primary bg-primary font-semibold text-white hover:enabled:border-primary-hover hover:enabled:bg-primary-hover",
  link: "border-transparent bg-transparent text-accent underline disabled:border-transparent disabled:bg-transparent",
  withIcon: `${NEUTRAL} ${ICONED}`,
  icon: `${NEUTRAL} text-icon leading-none`,
  danger: "border-bad bg-bad text-white hover:enabled:brightness-90",
  attention:
    "border-attention-border bg-attention-bg text-warn hover:enabled:border-warn hover:enabled:bg-attention-hover-bg",
  /** The Build button mid-build: Primer's danger button, red on a quiet fill until hovered. */
  stop: "border-danger-border bg-danger-bg font-semibold text-danger-fg hover:enabled:border-danger-hover-border hover:enabled:bg-danger-hover-bg hover:enabled:text-white active:enabled:bg-danger-active-bg",
};

/** Padding by variant: the default row, and the compact one the header uses. */
const PADDING: Record<ButtonVariant | "default", Record<ButtonSize, string>> = {
  default: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
  primary: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
  link: { default: "px-1 py-1", compact: "px-1 py-1" },
  withIcon: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
  icon: { default: "px-2.5 py-2", compact: "min-h-8 px-2 py-1" },
  danger: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
  attention: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
  stop: { default: "px-4 py-2", compact: "min-h-8 px-3 py-1" },
};

export interface ButtonLook {
  variant?: ButtonVariant;
  /** "compact" is the header's row: shorter, with less side padding. */
  size?: ButtonSize;
  /** Lays an icon and a label out on one line, whatever the variant. */
  iconed?: boolean;
}

/** The classes of a button's look, for an element that is not a <button> but must look like one, such as a link. */
export function buttonClasses({ variant, size = "default", iconed = false }: ButtonLook = {}): string {
  const key = variant ?? "default";
  return `${BASE} ${VARIANTS[key]} ${PADDING[key][size]} ${iconed && key !== "withIcon" ? ICONED : ""} ${DISABLED}`
    .replace(/\s+/g, " ")
    .trim();
}

export interface ButtonProps extends ComponentProps<"button">, ButtonLook {}

/** The app's button in the GitHub Primer look, light and dark. Without a `variant` it is the neutral one. */
export function Button({ variant, size, iconed, type = "button", className = "", ...props }: ButtonProps) {
  return (
    <button type={type} className={`${buttonClasses({ variant, size, iconed })} ${className}`.trim()} {...props} />
  );
}

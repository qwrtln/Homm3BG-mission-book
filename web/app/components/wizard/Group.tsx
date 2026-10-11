import type { ComponentProps } from "react";

/**
 * A named cluster of controls (`role="group"`), on the legacy class the pane's
 * layout hangs on. A <fieldset> would add a default border and padding those
 * rules do not expect.
 */
export function Group({ children, ...props }: Omit<ComponentProps<"div">, "role">) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a default border and padding the wizard CSS does not expect
    <div role="group" {...props}>
      {children}
    </div>
  );
}

/** Joined toggle buttons, as the picker's mode choice draws them; wraps on a narrow screen. */
export function Segmented({ className = "", ...props }: Omit<ComponentProps<"div">, "role">) {
  return <Group className={`segmented wizard-segmented ${className}`.trim()} {...props} />;
}

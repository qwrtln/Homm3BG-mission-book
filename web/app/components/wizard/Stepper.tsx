import type { ComponentProps } from "react";
import { type StepperUnit, stepped } from "../../../shared/wizard-fields.ts";

export interface StepperProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "min" | "max"> {
  /** The field's name, for the buttons' accessible names. */
  label: string;
  min: number;
  max: number;
  /** "P" counts in multiples of the player count. */
  unit?: StepperUnit;
  value: string;
  onChange: (text: string) => void;
}

/**
 * Puts a field between a − and a + button, Primer's stepper, in place of the
 * browser's own spinner. The buttons move the number by one, held to min and
 * max; a field that holds no whole number, such as an empty one, steps from
 * the min.
 */
export function Stepper({ label, min, max, unit = "", value, onChange, ...input }: StepperProps) {
  return (
    <span className="wizard-stepper">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(stepped(value, -1, min, max, unit))}
      >
        −
      </button>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(input.type === "number" ? { min, max } : {})}
        {...input}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(stepped(value, 1, min, max, unit))}
      >
        +
      </button>
    </span>
  );
}

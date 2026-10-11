export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  /** Names the group for assistive technology. */
  label: string;
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Joined buttons over hidden radios: the wizard's game-mode choice. The radios stay in the tab order and answer arrow keys. */
export function RadioGroup({ label, name, options, value, onChange }: RadioGroupProps) {
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex">
      {options.map((option) => (
        <label
          key={option.value}
          className="relative -ml-px cursor-pointer border border-line bg-panel px-3 py-1.5 text-ui text-ink first:ml-0 first:rounded-l-sm last:rounded-r-sm hover:z-10 hover:border-accent hover:text-accent has-checked:z-20 has-checked:border-accent has-checked:font-semibold has-checked:text-accent has-focus-visible:z-10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="absolute inset-0 m-0 cursor-pointer opacity-0"
          />
          {option.label}
        </label>
      ))}
    </span>
  );
}

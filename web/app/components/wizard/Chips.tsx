import { Group } from "./Group.tsx";

export interface ChipsProps {
  id: string;
  /** The id of the element that names the chips. */
  labelledBy: string;
  /** The id of the hint under them. */
  describedBy: string;
  chips: readonly string[];
  onClick: (index: number) => void;
}

/** Inspiration chips: draggable onto a field (the target takes `text/plain`), or clickable to put into one. */
export function Chips({ id, labelledBy, describedBy, chips, onClick }: ChipsProps) {
  return (
    <Group className="wizard-chips" id={id} aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {chips.map((text, i) => (
        <button
          key={text}
          type="button"
          className="wizard-chip"
          draggable="true"
          data-chip={i}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", text);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onClick(i)}
        >
          {text}
        </button>
      ))}
    </Group>
  );
}

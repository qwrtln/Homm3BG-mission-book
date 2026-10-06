import { setPickerMode } from "../../modules/picker.ts";
import { useAppStore } from "../../store.ts";

/**
 * A project member's choice: change a scenario that already exists ("Edit
 * existing"), or add a new one ("Add new", the only option everyone else
 * has). Hidden until membership is known.
 */
export function ModeChoice() {
  const isMember = useAppStore((s) => s.isMember);
  const pickerMode = useAppStore((s) => s.pickerMode);

  return (
    <div className="mode-choice" id="mode-choice" hidden={!isMember}>
      <p className="mode-label" id="mode-label">
        You're a project member. Change a scenario that already exists, or add a new one:
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a default border and padding the .segmented CSS does not expect */}
      <div className="segmented" role="group" aria-labelledby="mode-label">
        <button id="mode-edit" type="button" aria-pressed={pickerMode === "edit"} onClick={() => setPickerMode("edit")}>
          Edit existing
        </button>
        <button
          id="mode-new"
          type="button"
          aria-pressed={pickerMode === "new" && isMember}
          onClick={() => setPickerMode("new")}
        >
          Add new
        </button>
      </div>
    </div>
  );
}

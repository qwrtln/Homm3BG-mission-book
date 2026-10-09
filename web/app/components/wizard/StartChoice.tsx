import { openWizard, showPicker } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";

/**
 * How to start a new scenario: copy one (or begin blank) from the picker, or
 * answer the wizard's questions. Edit mode changes a scenario in place, so it
 * has no start choice.
 */
export function StartChoice() {
  const pickerMode = useAppStore((s) => s.pickerMode);
  const wizardOpen = useAppStore((s) => s.wizard.open);

  return (
    <div className="start-choice" id="start-choice" hidden={pickerMode === "edit"}>
      <p className="mode-label" id="start-choice-label">
        How do you want to start?
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a default border and padding the .start-options CSS does not expect */}
      <div className="start-options" role="group" aria-labelledby="start-choice-label">
        <button id="start-copy" type="button" aria-pressed={!wizardOpen} onClick={showPicker}>
          <strong>Start from an existing scenario</strong>
          <span>Copy a scenario from the book, or begin with the empty template.</span>
        </button>
        <button id="start-wizard" type="button" aria-pressed={wizardOpen} onClick={openWizard}>
          <strong>Use the setup wizard</strong>
          <span>Answer a few questions and get a scenario file already filled in.</span>
        </button>
      </div>
    </div>
  );
}

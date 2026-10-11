import { openCreate, setPickerMode } from "../../modules/picker.ts";
import { openWizard, showPicker } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { ChoiceCards } from "../ui/ChoiceCards.tsx";

/**
 * How to start: copy an existing scenario, answer the wizard's questions, or
 * (project members only) change an existing scenario in place.
 */
export function StartChoice() {
  const pickerMode = useAppStore((s) => s.pickerMode);
  const wizardOpen = useAppStore((s) => s.wizard.open);
  const isMember = useAppStore((s) => s.isMember);

  return (
    <div className="start-choice" id="start-choice">
      <p className="mode-label text-small" id="start-choice-label">
        How do you want to start?
      </p>
      <ChoiceCards
        labelledBy="start-choice-label"
        options={[
          {
            id: "start-copy",
            title: "Copy an existing scenario",
            description: "Copy a scenario from the book, or begin with the empty template.",
            pressed: pickerMode === "new" && !wizardOpen,
            onSelect: () => {
              openCreate();
              setPickerMode("new");
              showPicker();
            },
          },
          {
            id: "start-wizard",
            title: "Use the setup wizard",
            description: "Answer a few questions and get a scenario file already filled in.",
            pressed: wizardOpen,
            onSelect: () => {
              setPickerMode("new");
              openWizard();
            },
          },
          {
            id: "start-edit",
            title: "Edit an existing scenario",
            description: "Change a scenario in the Mission Book or the Draft Scenarios booklet.",
            pressed: pickerMode === "edit",
            onSelect: () => setPickerMode("edit"),
            hidden: !isMember,
            badge: "Members only",
          },
        ]}
      />
    </div>
  );
}

import { useState } from "react";
import { DRAFT_CATEGORIES, validateScenarioName } from "../../../shared/scenario-name.ts";
import { startEdit } from "../../github/resume.ts";
import { CATEGORY_LABELS } from "../../modules/config.ts";
import { chooseCategory, isTemplatePath, pickBlank } from "../../modules/picker.ts";
import { commitEntry } from "../../modules/workspace.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { RadioGroup } from "../ui/RadioGroup.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { SearchCombobox } from "./SearchCombobox.tsx";

/**
 * Everything between the start choice and the wizard: pick a scenario (the
 * search box and the blank-template links), name it and file it, then "Open
 * editor". Edit mode skips naming and filing — the picked scenario keeps its
 * own name and path — so the name step stays on screen, greyed out, rather
 * than appearing and disappearing.
 */
export function PickerMain() {
  const pickerMode = useAppStore((s) => s.pickerMode);
  const pendingPath = useAppStore((s) => s.pendingPath);
  const pendingTitle = useAppStore((s) => s.pendingTitle);
  const chosenCategory = useAppStore((s) => s.chosenCategory);
  const pickerBusy = useAppStore((s) => s.pickerBusy);
  const pickerError = useAppStore((s) => s.pickerError);
  const [name, setName] = useState("");

  const editMode = pickerMode === "edit";
  const activeBlank = pendingPath && isTemplatePath(pendingPath) ? chosenCategory : null;
  const check = validateScenarioName(name);
  const nameTyped = name.trim().length > 0;
  const showNameError = !editMode && !check.valid && nameTyped;

  let disabled: boolean;
  let hint: string;
  if (editMode) {
    disabled = pickerBusy || !pendingPath;
    hint = pickerError ?? (pendingPath ? "" : "Pick the scenario to edit.");
  } else {
    disabled = pickerBusy || !pendingPath || chosenCategory === null || !check.valid;
    hint =
      pickerError ??
      (!pendingPath
        ? "Pick a scenario or a blank template first."
        : chosenCategory === null
          ? "Choose where to file your scenario."
          : check.message);
  }

  function handleGoClick(): void {
    if (editMode) {
      if (pendingPath) void startEdit(pendingPath, pendingTitle);
      return;
    }
    if (!pendingPath || !validateScenarioName(name).valid) return;
    if (!chosenCategory) return;
    void commitEntry(pendingPath, name, chosenCategory);
  }

  return (
    <>
      <div className="pick-step">
        <h3 id="pick-heading" className="text-heading">
          {editMode ? "Pick the scenario to edit" : "Start from an existing scenario"}
        </h3>
        <p className="hint text-small" id="pick-hint">
          {editMode
            ? "Your changes go into this scenario itself. Search the Mission Book and the Draft Scenarios by name."
            : "Your new scenario starts as a copy of it. Search the Mission Book and the Draft Scenarios by name."}
        </p>
        <SearchCombobox />
        <p className={`scratch-row text-small${editMode ? " dimmed" : ""}`} id="scratch-row" inert={editMode}>
          <span id="scratch-label">No close match? Start blank:</span>
          {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a default border and padding the .blank-links CSS does not expect */}
          <span className="blank-links" role="group" aria-labelledby="scratch-label">
            <Button
              id="scratch-clash"
              variant="link"
              className="hover:enabled:text-ink aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:decoration-2"
              data-category="clash"
              aria-pressed={activeBlank === "clash"}
              onClick={() => pickBlank("clash")}
            >
              Clash
            </Button>{" "}
            <span aria-hidden="true">·</span>
            <Button
              id="scratch-coop"
              variant="link"
              className="hover:enabled:text-ink aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:decoration-2"
              data-category="coops"
              aria-pressed={activeBlank === "coops"}
              onClick={() => pickBlank("coops")}
            >
              Coop
            </Button>{" "}
            <span aria-hidden="true">·</span>
            <Button
              id="scratch-alliance"
              variant="link"
              className="hover:enabled:text-ink aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:decoration-2"
              data-category="alliances"
              aria-pressed={activeBlank === "alliances"}
              onClick={() => pickBlank("alliances")}
            >
              Alliance
            </Button>{" "}
            <span aria-hidden="true">·</span>
            <Button
              id="scratch-campaign"
              variant="link"
              className="hover:enabled:text-ink aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:decoration-2"
              data-category="campaigns"
              aria-pressed={activeBlank === "campaigns"}
              onClick={() => pickBlank("campaigns")}
            >
              Campaign
            </Button>
          </span>
        </p>
      </div>
      <div
        className={`name-step${editMode || !pendingPath ? " dimmed" : ""}`}
        id="name-slide"
        inert={editMode || !pendingPath}
      >
        <h3 id="name-heading" className="text-heading">
          Name your new scenario
        </h3>
        <p className="hint text-small">Used for the file name and the download.</p>
        <div className="name-field">
          <TextInput
            id="scenario-name"
            aria-labelledby="name-heading"
            placeholder="Your new scenario's name"
            maxLength={60}
            required
            value={name}
            aria-invalid={showNameError ? "true" : "false"}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="name-error text-small" id="name-error" role="alert" hidden={!showNameError}>
            {showNameError ? check.message : ""}
          </p>
        </div>
        <fieldset className="category-choice" id="category-choice" aria-describedby="category-hint">
          <legend className="mb-2 p-0 text-small text-muted">Game mode</legend>
          <RadioGroup
            label="Game mode"
            name="category"
            options={DRAFT_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }))}
            value={chosenCategory ?? ""}
            onChange={chooseCategory}
          />
          <p className="hint category-hint text-small" id="category-hint">
            {chosenCategory ? `Filed in the Draft Scenarios under ${CATEGORY_LABELS[chosenCategory]}.` : ""}
          </p>
        </fieldset>
      </div>
      <div className="go-row">
        <Button variant="primary" id="go" disabled={disabled} onClick={handleGoClick}>
          Open editor
        </Button>
        <p className="go-hint text-small" id="go-hint" role="status">
          {hint}
        </p>
      </div>
    </>
  );
}

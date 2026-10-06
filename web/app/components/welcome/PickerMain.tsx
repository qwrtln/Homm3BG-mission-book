import { useState } from "react";
import { DRAFT_CATEGORIES, validateScenarioName } from "../../../shared/scenario-name.ts";
import { CATEGORY_LABELS } from "../../modules/config.ts";
import { chooseCategory, isTemplatePath, openEditPick, pickBlank } from "../../modules/picker.ts";
import { commitEntry } from "../../modules/workspace.ts";
import { useAppStore } from "../../store.ts";
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
      if (pendingPath) openEditPick(pendingPath, pendingTitle);
      return;
    }
    if (!pendingPath || !validateScenarioName(name).valid) return;
    if (!chosenCategory) return;
    void commitEntry(pendingPath, name, chosenCategory);
  }

  return (
    <>
      <div className="pick-step">
        <h2 id="pick-heading">{editMode ? "Pick the scenario to edit" : "Start from an existing scenario"}</h2>
        <p className="hint" id="pick-hint">
          {editMode
            ? "Your changes go into this scenario itself. Search the Mission Book and the Draft Scenarios by name."
            : "Your new scenario starts as a copy of it. Search the Mission Book and the Draft Scenarios by name."}
        </p>
        <SearchCombobox />
        <p className={`scratch-row${editMode ? " dimmed" : ""}`} id="scratch-row" inert={editMode}>
          <span id="scratch-label">No close match? Start blank:</span>
          {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a default border and padding the .blank-links CSS does not expect */}
          <span className="blank-links" role="group" aria-labelledby="scratch-label">
            <button
              id="scratch-clash"
              className="link"
              type="button"
              data-category="clash"
              aria-pressed={activeBlank === "clash"}
              onClick={() => pickBlank("clash")}
            >
              Clash
            </button>{" "}
            <span aria-hidden="true">·</span>
            <button
              id="scratch-coop"
              className="link"
              type="button"
              data-category="coops"
              aria-pressed={activeBlank === "coops"}
              onClick={() => pickBlank("coops")}
            >
              Coop
            </button>{" "}
            <span aria-hidden="true">·</span>
            <button
              id="scratch-alliance"
              className="link"
              type="button"
              data-category="alliances"
              aria-pressed={activeBlank === "alliances"}
              onClick={() => pickBlank("alliances")}
            >
              Alliance
            </button>{" "}
            <span aria-hidden="true">·</span>
            <button
              id="scratch-campaign"
              className="link"
              type="button"
              data-category="campaigns"
              aria-pressed={activeBlank === "campaigns"}
              onClick={() => pickBlank("campaigns")}
            >
              Campaign
            </button>
          </span>
        </p>
      </div>
      <div
        className={`name-step${editMode || !pendingPath ? " dimmed" : ""}`}
        id="name-slide"
        inert={editMode || !pendingPath}
      >
        <h2 id="name-heading">Name your new scenario</h2>
        <p className="hint">Used for the file name and the download.</p>
        <div className="name-field">
          <input
            type="text"
            id="scenario-name"
            aria-labelledby="name-heading"
            placeholder="Your new scenario's name"
            maxLength={60}
            required
            value={name}
            aria-invalid={showNameError ? "true" : "false"}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="name-error" id="name-error" role="alert" hidden={!showNameError}>
            {showNameError ? check.message : ""}
          </p>
        </div>
        <fieldset className="category-choice" id="category-choice" aria-describedby="category-hint">
          <legend>Game mode</legend>
          <span className="segmented">
            {DRAFT_CATEGORIES.map((category) => (
              <label key={category}>
                <input
                  type="radio"
                  name="category"
                  value={category}
                  checked={chosenCategory === category}
                  onChange={() => chooseCategory(category)}
                />
                <span>{CATEGORY_LABELS[category]}</span>
              </label>
            ))}
          </span>
          <p className="hint category-hint" id="category-hint">
            {chosenCategory ? `Filed in the Draft Scenarios under ${CATEGORY_LABELS[chosenCategory]}.` : ""}
          </p>
        </fieldset>
      </div>
      <div className="go-row">
        <button id="go" className="primary" type="button" disabled={disabled} onClick={handleGoClick}>
          Open editor
        </button>
        <p className="go-hint" id="go-hint" role="status">
          {hint}
        </p>
      </div>
    </>
  );
}

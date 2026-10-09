import { WIZARD_CATEGORIES } from "../../../shared/scenario-wizard.ts";
import { CATEGORY_LABELS } from "../../modules/config.ts";
import { nameProblem, setName, updateFields } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { RadioGroup } from "../ui/RadioGroup.tsx";
import { UploadPanel } from "../uploads/UploadPanel.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

const HEADER_HINT = "PNG or JPG. It shows at the top of the scenario. Drop it here, or add it.";

const CATEGORY_OPTIONS = WIZARD_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }));

/** Pane 1: game mode, name, author and the header image. */
export function BasicsPane({ hidden }: PaneProps) {
  const fields = useAppStore((s) => s.wizard.fields);
  const problem = nameProblem(fields);
  // An empty field is not yet a mistake: the hint under the pane asks for it.
  const showProblem = problem !== "" && fields.name.trim().length > 0;

  return (
    <Pane id="basics" hidden={hidden}>
      <fieldset className="wizard-choice" id="wizard-category">
        <legend className="wizard-heading">Game mode</legend>
        <p className="hint">Who plays against whom.</p>
        <RadioGroup
          label="Game mode"
          name="wizard-category"
          options={CATEGORY_OPTIONS}
          value={fields.category ?? ""}
          onChange={(category) => updateFields({ category })}
        />
      </fieldset>
      <h3>
        <label htmlFor="wizard-name">Scenario name</label>
      </h3>
      <p className="hint">It names the file too.</p>
      <div className="wizard-field">
        <input
          type="text"
          id="wizard-name"
          placeholder="Your new scenario's name"
          maxLength={60}
          autoComplete="off"
          required
          value={fields.name}
          aria-invalid={showProblem ? "true" : "false"}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="name-error" id="wizard-name-error" role="alert" hidden={!showProblem}>
          {showProblem ? problem : ""}
        </p>
      </div>
      <h3>
        <label htmlFor="wizard-author">Author</label>
      </h3>
      <p className="hint">Printed under the title. It can wait.</p>
      <div className="wizard-field">
        <input
          type="text"
          id="wizard-author"
          placeholder="Your name or nickname"
          autoComplete="off"
          value={fields.author}
          onChange={(event) => updateFields({ author: event.target.value })}
        />
      </div>
      <h3 id="wizard-header-label">Header image</h3>
      <UploadPanel panel="wizard" show="header" headerHint={HEADER_HINT} mapsHint={null} />
    </Pane>
  );
}

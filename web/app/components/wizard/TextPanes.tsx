import { updateFields } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Glyph } from "./Glyph.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

/** Pane 2: the flavor text. */
export function LorePane({ hidden }: PaneProps) {
  const lore = useAppStore((s) => s.wizard.fields.lore);

  return (
    <Pane id="lore" hidden={hidden}>
      <h3>Lore</h3>
      <p className="hint">A short story to set the mood. It is printed in italics under the author.</p>
      <div className="wizard-field">
        <label htmlFor="wizard-lore">Flavor text</label>
        <textarea
          id="wizard-lore"
          rows={6}
          placeholder="Power struggle at the border escalates. This trade route is incredibly important as a supply line, and you cannot allow it to fall into enemy hands."
          value={lore}
          onChange={(event) => updateFields({ lore: event.target.value })}
        />
      </div>
    </Pane>
  );
}

/** Pane 5: the Starting Units lines. */
export function UnitsPane({ hidden }: PaneProps) {
  const units = useAppStore((s) => s.wizard.fields.units);

  return (
    <Pane id="units" hidden={hidden}>
      <h3>Starting units</h3>
      <p className="hint">
        One Unit per line. Glyphs are kept as typed: the Unit glyphs are <Glyph name="bronze" inline />{" "}
        <code>{"\\svg{bronze}"}</code>, <Glyph name="silver" inline /> <code>{"\\svg{silver}"}</code> and{" "}
        <Glyph name="golden" inline /> <code>{"\\svg{golden}"}</code>.
      </p>
      <div className="wizard-field">
        <label htmlFor="wizard-units">Starting units</label>
        <textarea
          id="wizard-units"
          rows={4}
          spellCheck={false}
          value={units}
          onChange={(event) => updateFields({ units: event.target.value })}
        />
      </div>
    </Pane>
  );
}

/** Pane 9: how the Scenario is won and lost. */
export function ConditionsPane({ hidden }: PaneProps) {
  const victory = useAppStore((s) => s.wizard.fields.victory);
  const defeat = useAppStore((s) => s.wizard.fields.defeat);

  return (
    <Pane id="conditions" hidden={hidden}>
      <h3>Victory and defeat</h3>
      <p className="hint">How the Scenario is won, and how it is lost. A blank line starts a new paragraph.</p>
      <div className="wizard-field">
        <label htmlFor="wizard-victory">Victory conditions</label>
        <textarea
          id="wizard-victory"
          rows={4}
          placeholder="Take control of the enemy Town."
          value={victory}
          onChange={(event) => updateFields({ victory: event.target.value })}
        />
      </div>
      <div className="wizard-field">
        <label htmlFor="wizard-defeat">Defeat conditions</label>
        <textarea
          id="wizard-defeat"
          rows={4}
          placeholder="At end of Round 12 the game ends in a draw."
          value={defeat}
          onChange={(event) => updateFields({ defeat: event.target.value })}
        />
      </div>
    </Pane>
  );
}

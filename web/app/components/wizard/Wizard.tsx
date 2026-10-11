import { type ComponentType, useEffect, useRef } from "react";
import { advanceWizard, backWizard, PANES, wizardNav } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { BasicsPane } from "./BasicsPane.tsx";
import { EventsPane } from "./EventsPane.tsx";
import { LengthPane } from "./LengthPane.tsx";
import { MapsPane } from "./MapsPane.tsx";
import type { PaneProps } from "./Pane.tsx";
import { RulesPane } from "./RulesPane.tsx";
import { BuildingsPane, MapPane, PoolPane, ResourcesPane } from "./SetupPanes.tsx";
import { ConditionsPane, LorePane, UnitsPane } from "./TextPanes.tsx";

/** The pane components, by the ids modules/wizard.ts's PANES list them under. */
const PANE_COMPONENTS: Record<string, ComponentType<PaneProps>> = {
  basics: BasicsPane,
  lore: LorePane,
  length: LengthPane,
  resources: ResourcesPane,
  units: UnitsPane,
  buildings: BuildingsPane,
  pool: PoolPane,
  map: MapPane,
  conditions: ConditionsPane,
  events: EventsPane,
  rules: RulesPane,
  maps: MapsPane,
};

/**
 * The start wizard: one pane of questions at a time, with Back and Next (or
 * Skip, or Create) under it. It shows in place of the copy-or-blank picker.
 * What each pane asks, and when it can be left, is modules/wizard.ts.
 */
export function Wizard() {
  const wizard = useAppStore((s) => s.wizard);
  const panel = useAppStore((s) => s.uploadPanels.wizard);
  const panes = useRef<HTMLDivElement>(null);
  const { open, current } = wizard;
  const nav = wizardNav(wizard, panel);

  // A shown pane takes focus: its first field, or else its first button (a
  // stepper's − button comes before its field, so fields are looked for first).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `current` is no input of the effect, but a new pane means new fields to focus
  useEffect(() => {
    if (!open) return;
    const root = panes.current?.querySelector<HTMLElement>(".wizard-pane:not([hidden])");
    const first = root?.querySelector<HTMLElement>("input, select, textarea") ?? root?.querySelector("button");
    first?.focus();
  }, [open, current]);

  return (
    <section className="wizard" id="wizard" aria-labelledby="wizard-title" hidden={!open}>
      <div className="wizard-head">
        <h2 id="wizard-title">Set up a new scenario</h2>
        <p className="wizard-step" id="wizard-step" aria-live="polite">
          {nav.step}
        </p>
      </div>
      <div className="wizard-panes" id="wizard-panes" ref={panes}>
        {PANES.map((pane, index) => {
          const Pane = PANE_COMPONENTS[pane.id];
          return <Pane key={pane.id} hidden={index !== current} />;
        })}
      </div>
      <p className="wizard-hint" id="wizard-hint" role="status">
        {nav.hint}
      </p>
      <div className="wizard-nav">
        <span className="wizard-nav-end">
          <Button id="wizard-back" disabled={nav.backDisabled} onClick={backWizard}>
            Back
          </Button>
          <Button
            id="wizard-next"
            variant={nav.nextPrimary ? "primary" : undefined}
            className={nav.nextPrimary ? "primary" : ""}
            disabled={nav.nextDisabled}
            onClick={advanceWizard}
          >
            {nav.nextLabel}
          </Button>
        </span>
      </div>
    </section>
  );
}

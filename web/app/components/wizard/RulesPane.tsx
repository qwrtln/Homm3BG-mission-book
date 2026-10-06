import { useEffect, useRef } from "react";
import { MAX_RULE_FIELDS, RULE_CHIPS } from "../../../shared/wizard-fields.ts";
import { addRuleField, clickRuleChip, putRuleChip, setRule } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Chips } from "./Chips.tsx";
import { Group } from "./Group.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

/** Pane 11: one field per additional rule, with a chip row of the rules the book uses most. */
export function RulesPane({ hidden }: PaneProps) {
  const rules = useAppStore((s) => s.wizard.fields.rules);
  const hint = useAppStore((s) => s.wizard.fields.ruleChipsHint);
  const full = rules.length >= MAX_RULE_FIELDS;
  // The field the + button added, which takes focus once it is on screen.
  const focusRule = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the new field exists once the list is longer
  useEffect(() => {
    if (focusRule.current === null) return;
    document.getElementById(`wizard-rule-${focusRule.current}`)?.focus();
    focusRule.current = null;
  }, [rules.length]);

  return (
    <Pane id="rules" hidden={hidden}>
      <h3 id="wizard-rules-label">Additional rules</h3>
      <p className="hint">
        One rule per field. Glyphs such as <code>{"\\svg{gold}"}</code> are kept as typed.
      </p>
      <div className="wizard-field">
        <p className="wizard-label" id="wizard-rule-chips-label">
          Common rules
        </p>
        <Chips
          id="wizard-rule-chips"
          labelledBy="wizard-rule-chips-label"
          describedBy="wizard-rule-chips-hint"
          chips={RULE_CHIPS}
          onClick={clickRuleChip}
        />
        <p className="wizard-status" id="wizard-rule-chips-hint">
          {hint}
        </p>
      </div>
      <Group className="wizard-rules" id="wizard-rules" aria-labelledby="wizard-rules-label">
        {rules.map((rule, index) => {
          const n = index + 1;
          return (
            // The fields have no identity beyond their place in the list: one is never moved, only added.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <div key={index} className="wizard-field">
              <label htmlFor={`wizard-rule-${n}`}>Rule {n}</label>
              <textarea
                id={`wizard-rule-${n}`}
                rows={2}
                value={rule}
                onChange={(event) => setRule(index, event.target.value)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const text = event.dataTransfer.getData("text/plain");
                  if (text) putRuleChip(index, text);
                }}
              />
            </div>
          );
        })}
      </Group>
      <Button
        className="wizard-rules-add"
        id="wizard-rules-add"
        aria-label="Add another rule"
        hidden={full}
        onClick={() => {
          const n = rules.length + 1;
          if (addRuleField()) focusRule.current = n;
        }}
      >
        +
      </Button>
      <p className="hint wizard-rules-limit" id="wizard-rules-limit" hidden={!full}>
        That's the limit here. You can add more rules in the editor.
      </p>
    </Pane>
  );
}

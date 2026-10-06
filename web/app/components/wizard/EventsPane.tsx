import { CHIPS_HINT, EVENT_CHIPS, FIRST_EVENT_ROUND } from "../../../shared/wizard-fields.ts";
import {
  appendEventText,
  clickEventChip,
  focusEventRound,
  lastEventRound,
  setEventText,
  toggleEventRound,
} from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Chips } from "./Chips.tsx";
import { Group, Segmented } from "./Group.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

/** Pane 10: pick the Rounds that have events, then one field per picked Round. */
export function EventsPane({ hidden }: PaneProps) {
  const fields = useAppStore((s) => s.wizard.fields);
  const last = lastEventRound(fields);
  const rounds: number[] = [];
  for (let round = FIRST_EVENT_ROUND; round <= last; round++) rounds.push(round);
  const picked = [...fields.selectedRounds].sort((a, b) => a - b);

  return (
    <Pane id="events" hidden={hidden}>
      <h3 id="wizard-events-label">Timed events</h3>
      <p className="hint">
        Pick the Rounds that have events. One event per line; glyphs such as <code>{"\\svg{gold}"}</code> are kept as
        typed.
      </p>
      <div className="wizard-field">
        <Segmented id="wizard-event-rounds" aria-labelledby="wizard-events-label">
          {rounds.map((round) => (
            <button
              key={round}
              type="button"
              data-round={round}
              aria-pressed={fields.selectedRounds.includes(round)}
              onClick={() => toggleEventRound(round)}
            >
              Round {round}
            </button>
          ))}
        </Segmented>
      </div>
      <div className="wizard-field">
        <p className="wizard-label" id="wizard-chips-label">
          Common events
        </p>
        <Chips
          id="wizard-chips"
          labelledBy="wizard-chips-label"
          describedBy="wizard-chips-hint"
          chips={EVENT_CHIPS}
          onClick={clickEventChip}
        />
        <p className="wizard-status" id="wizard-chips-hint">
          {fields.eventChipsHint || CHIPS_HINT}
        </p>
      </div>
      <Group className="wizard-events" id="wizard-events" aria-labelledby="wizard-events-label">
        {picked.map((round) => (
          <div key={round} className="wizard-event" data-round={round}>
            <label htmlFor={`wizard-event-${round}`}>Round {round}</label>
            <textarea
              id={`wizard-event-${round}`}
              rows={2}
              aria-label={`Round ${round} events, one per line`}
              value={fields.eventTexts[round] ?? ""}
              onChange={(event) => setEventText(round, event.target.value)}
              onFocus={() => focusEventRound(round)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const text = event.dataTransfer.getData("text/plain");
                if (text) appendEventText(round, text);
              }}
            />
          </div>
        ))}
      </Group>
    </Pane>
  );
}

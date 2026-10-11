import { FIRST_ROUND, LAST_ROUND, MAX_PLAYER_COUNT } from "../../../shared/wizard-fields.ts";
import { setRounds, togglePlayerCount } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Segmented } from "./Group.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Pane 3: how many Rounds, and which player counts. */
export function LengthPane({ hidden }: PaneProps) {
  const rounds = useAppStore((s) => s.wizard.fields.rounds);
  const playerCounts = useAppStore((s) => s.wizard.fields.playerCounts);

  return (
    <Pane id="length" hidden={hidden}>
      <h3 id="wizard-rounds-label">Scenario length</h3>
      <p className="hint">How many Rounds the game lasts.</p>
      <div className="wizard-field">
        <Segmented id="wizard-rounds" aria-labelledby="wizard-rounds-label">
          {range(FIRST_ROUND, LAST_ROUND).map((n) => (
            <button
              key={n}
              type="button"
              data-value={n}
              aria-pressed={rounds === n}
              aria-label={`${n} Rounds`}
              onClick={() => setRounds(n)}
            >
              {n}
            </button>
          ))}
        </Segmented>
      </div>
      <h3 id="wizard-players-label">Player count</h3>
      <p className="hint">Pick all that apply.</p>
      <div className="wizard-field">
        <Segmented id="wizard-players" aria-labelledby="wizard-players-label">
          {range(1, MAX_PLAYER_COUNT).map((n) => (
            <button
              key={n}
              type="button"
              data-value={n}
              aria-pressed={playerCounts.includes(n)}
              aria-label={`${n} player${n === 1 ? "" : "s"}`}
              onClick={() => togglePlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </Segmented>
      </div>
    </Pane>
  );
}

import { BUILDINGS, INCOME_TRACK } from "../../../shared/scenario-wizard.ts";
import {
  MAX_POOL_TILES,
  MAX_RESOURCE,
  RESOURCE_LABELS,
  RESOURCES,
  TILE_KEYS,
  type TileKey,
  tileRange,
} from "../../../shared/wizard-fields.ts";
import { FIRST_COLUMN, setTileMode, tileCountBad, toggleBuilding, updateFields } from "../../modules/wizard.ts";
import { useAppStore } from "../../store.ts";
import { Checkbox } from "../ui/Checkbox.tsx";
import { RadioGroup } from "../ui/RadioGroup.tsx";
import { Select } from "../ui/Select.tsx";
import { Glyph } from "./Glyph.tsx";
import { Group } from "./Group.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";
import { Stepper } from "./Stepper.tsx";

/** Pane 4: a select per resource on its income track, and a stepped number field per resource for what a player starts with. */
export function ResourcesPane({ hidden }: PaneProps) {
  const fields = useAppStore((s) => s.wizard.fields);

  return (
    <Pane id="resources" hidden={hidden}>
      <h3>Starting income and resources</h3>
      <p className="hint">
        What each player earns every Round, and what they start with. Income starts at the bottom of each track; an
        empty resource starts at 0.
      </p>
      <div className="wizard-field">
        <p className="wizard-label" id="wizard-income-label">
          Starting income
        </p>
        <Group className="wizard-row" id="wizard-income" aria-labelledby="wizard-income-label">
          {RESOURCES.map((resource) => (
            <span key={resource} className="wizard-resource">
              <Glyph name={resource} />
              <Select
                data-resource={resource}
                aria-label={`${RESOURCE_LABELS[resource]} income`}
                value={fields.income[resource]}
                onChange={(event) => updateFields({ income: { ...fields.income, [resource]: event.target.value } })}
              >
                {INCOME_TRACK[resource].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </span>
          ))}
        </Group>
      </div>
      <div className="wizard-field">
        <p className="wizard-label" id="wizard-resources-label">
          Starting resources
        </p>
        <Group className="wizard-row" id="wizard-resources" aria-labelledby="wizard-resources-label">
          {RESOURCES.map((resource) => (
            <span key={resource} className="wizard-resource">
              <Glyph name={resource} />
              <Stepper
                label={`Starting ${RESOURCE_LABELS[resource]}`}
                min={0}
                max={MAX_RESOURCE}
                type="number"
                step={1}
                data-resource={resource}
                aria-label={`Starting ${RESOURCE_LABELS[resource]}`}
                value={fields.resources[resource]}
                onChange={(text) => updateFields({ resources: { ...fields.resources, [resource]: text } })}
              />
            </span>
          ))}
        </Group>
      </div>
    </Pane>
  );
}

/** Pane 6: the buildings each player starts with, in two columns. The line they write keeps the BUILDINGS order whatever the columns show. */
export function BuildingsPane({ hidden }: PaneProps) {
  const ticked = useAppStore((s) => s.wizard.fields.buildings);

  const column = (first: boolean) => (
    <div className="wizard-check-column">
      {BUILDINGS.filter((building) => FIRST_COLUMN.has(building.key) === first).map((building) => (
        <Checkbox
          key={building.key}
          align="center"
          value={building.key}
          checked={ticked.includes(building.key)}
          onChange={(event) => toggleBuilding(building.key, event.target.checked)}
          label={
            <span className="flex items-center gap-2">
              <Glyph name={building.glyph} dark={building.darkGlyph} />
              <span>{building.label}</span>
            </span>
          }
        />
      ))}
    </div>
  );

  return (
    <Pane id="buildings" hidden={hidden}>
      <h3>Town buildings</h3>
      <p className="hint">The buildings each player starts with. Tick none for a Town with no buildings.</p>
      <fieldset className="wizard-choice">
        <legend>Town buildings</legend>
        <div className="wizard-checks" id="wizard-buildings">
          {column(true)}
          {column(false)}
        </div>
      </fieldset>
    </Pane>
  );
}

/** Pane 7: whether each player takes random Map Tiles, and how many of each kind. */
export function PoolPane({ hidden }: PaneProps) {
  const fields = useAppStore((s) => s.wizard.fields);
  const counts = [
    { id: "wizard-pool-far", label: "Far (II–III)", value: fields.poolFar, key: "poolFar" },
    { id: "wizard-pool-near", label: "Near (IV–V)", value: fields.poolNear, key: "poolNear" },
  ] as const;

  return (
    <Pane id="pool" hidden={hidden}>
      <h3>Map tile pool</h3>
      <p className="hint">Whether each player takes random Map Tiles to place during the game.</p>
      <fieldset className="wizard-choice" id="wizard-pool">
        <legend>Map tile pool</legend>
        <RadioGroup
          label="Map tile pool"
          name="wizard-pool"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          value={fields.pool ?? ""}
          onChange={(pool) => updateFields({ pool: pool === "yes" ? "yes" : "no" })}
        />
      </fieldset>
      <div className="wizard-counts" id="wizard-pool-counts" hidden={fields.pool !== "yes"}>
        {counts.map((count) => (
          <div key={count.id} className="wizard-count">
            <label htmlFor={count.id}>{count.label}</label>
            <Stepper
              label={`${count.label} Map Tiles`}
              min={0}
              max={MAX_POOL_TILES}
              type="number"
              id={count.id}
              step={1}
              placeholder="0"
              value={count.value}
              onChange={(text) => updateFields({ [count.key]: text })}
            />
          </div>
        ))}
      </div>
    </Pane>
  );
}

const TILE_LABELS: Record<TileKey, string> = {
  starting: "Starting (I)",
  far: "Far (II–III)",
  near: "Near (IV–V)",
  center: "Center (VI–VII)",
};

/** Pane 8: how many Map Tiles of each type the map is built from, fixed or a multiple of the players. */
export function MapPane({ hidden }: PaneProps) {
  const fields = useAppStore((s) => s.wizard.fields);

  return (
    <Pane id="map" hidden={hidden}>
      <h3>Map setup</h3>
      <p className="hint">
        How many Map Tiles of each type the map is built from: a fixed number, or a multiple of the number of players
        (P, 2P … 6P).
      </p>
      <Group className="wizard-counts" id="wizard-map" aria-label="Map Tiles">
        {TILE_KEYS.map((key) => {
          const mode = fields.mapModes[key];
          const { min, max, unit } = tileRange(mode);
          return (
            <div key={key} className="wizard-count" data-tile={key} data-mode={mode}>
              <label htmlFor={`wizard-map-${key}`}>{TILE_LABELS[key]}</label>
              <Group
                className="wizard-tile-mode segmented"
                aria-label={`${TILE_LABELS[key]}: fixed count or multiple of players`}
              >
                <button
                  type="button"
                  data-mode="fixed"
                  aria-pressed={mode === "fixed"}
                  onClick={() => setTileMode(key, "fixed")}
                >
                  Fixed
                </button>
                <button
                  type="button"
                  data-mode="perplayer"
                  aria-pressed={mode === "perplayer"}
                  onClick={() => setTileMode(key, "perplayer")}
                >
                  × Players
                </button>
              </Group>
              <Stepper
                label={`${TILE_LABELS[key]} Map Tiles`}
                min={min}
                max={max}
                unit={unit}
                type="text"
                id={`wizard-map-${key}`}
                maxLength={2}
                placeholder="0"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={tileCountBad(fields, key) ? "true" : "false"}
                value={fields.mapCounts[key]}
                onChange={(text) => updateFields({ mapCounts: { ...fields.mapCounts, [key]: text } })}
              />
            </div>
          );
        })}
      </Group>
    </Pane>
  );
}

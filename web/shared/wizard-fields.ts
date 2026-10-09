// What the start wizard's panes hold, and the DOM-free rules for reading it:
// the raw field values (text, as a contributor typed it), the stepper
// arithmetic, and the Map Tile count syntax. app/modules/wizard.ts turns these
// into answers and drives the panes; the LaTeX itself is scenario-wizard.ts's.

import { INCOME_TRACK, MAX_PER_PLAYER, type TileCount } from "./scenario-wizard.ts";

export const FIRST_ROUND = 4;
export const LAST_ROUND = 16;
export const MAX_PLAYER_COUNT = 8;
export const MAX_RESOURCE = 99;
export const MAX_POOL_TILES = 6;
export const MAX_MAP_TILES = 20;
/** The first Round a Timed Event can fall in. */
export const FIRST_EVENT_ROUND = 2;
export const FIRST_RULE_FIELDS = 3;
export const MAX_RULE_FIELDS = 8;

export type Resource = "gold" | "building_materials" | "valuables";

export const RESOURCES: readonly Resource[] = ["gold", "building_materials", "valuables"];

export const RESOURCE_LABELS: Readonly<Record<Resource, string>> = {
  gold: "Gold",
  building_materials: "Building Materials",
  valuables: "Valuables",
};

/** What a Starting Resources field holds until the contributor changes it. */
export const DEFAULT_RESOURCES: Readonly<Record<Resource, number>> = { gold: 10, building_materials: 0, valuables: 0 };

/** What the Starting Units field holds until the contributor changes it: Chain Link's two lines. */
export const DEFAULT_UNITS = [
  String.raw`A "Pack" of the cheapest \svg{bronze} Units`,
  String.raw`A "Few" of the most expensive \svg{bronze} Units`,
].join("\n");

/** The three inspiration chips offered above the Timed Events fields. */
export const EVENT_CHIPS: readonly string[] = [
  "Remove all Black Cubes from the map.",
  String.raw`All Heroes gain +1 \svg{movement}.`,
  String.raw`Each player may Search (2) \svg{artifact}.`,
];

/** The inspiration chips offered above the rule fields: rules the book's scenarios use most. */
export const RULE_CHIPS: readonly string[] = [
  "Level VII Neutral Combats cannot be skipped.",
  "You cannot recruit a Secondary Hero.",
  String.raw`\textbf{Obelisk:} Roll 1 \svg{resource} or \svg{treasure}.`,
];

export const CHIPS_HINT = "Drag a chip onto a Round below, or click one to add it to the last-focused Round.";
export const CHIPS_NEED_ROUND = "Pick a Round first.";
export const RULE_CHIPS_HINT = "Drag a chip onto a rule field, or click one to fill the next empty field.";
export const RULE_CHIPS_FULL = "Every field holds a rule. Clear one, or add the rest in the editor.";

/** The four Map Setup fields, in the order the pane lists them. */
export const TILE_KEYS = ["starting", "far", "near", "center"] as const;
export type TileKey = (typeof TILE_KEYS)[number];

/** How a Map Setup field counts: a fixed number, or a multiple of the player count. */
export type TileMode = "fixed" | "perplayer";

/**
 * Every field of every pane, as typed. A number field holds its text, so an
 * empty one and a half-typed one stay distinguishable from a 0.
 */
export interface WizardFields {
  name: string;
  /** The checked game mode; null until one is. */
  category: string | null;
  author: string;
  lore: string;
  rounds: number | null;
  /** The player counts ticked, in the order they were ticked. */
  playerCounts: number[];
  income: Record<Resource, string>;
  resources: Record<Resource, string>;
  units: string;
  /** The ticked BUILDINGS keys. */
  buildings: string[];
  pool: "yes" | "no" | null;
  poolFar: string;
  poolNear: string;
  mapCounts: Record<TileKey, string>;
  mapModes: Record<TileKey, TileMode>;
  victory: string;
  defeat: string;
  /** The Rounds picked to have events. */
  selectedRounds: number[];
  /** Each selected Round's typed text. */
  eventTexts: Record<number, string>;
  /** The Round whose textarea last had focus, for a chip click. */
  focusedEventRound: number | null;
  eventChipsHint: string;
  /** The rule fields' text, in order; at least FIRST_RULE_FIELDS of them. */
  rules: string[];
  ruleChipsHint: string;
}

/** The fields of a wizard nobody has touched: empty, with the prefilled defaults. */
export function initialWizardFields(): WizardFields {
  return {
    name: "",
    category: null,
    author: "",
    lore: "",
    rounds: null,
    playerCounts: [],
    // Income starts at the bottom of each track.
    income: {
      gold: String(INCOME_TRACK.gold[0]),
      building_materials: String(INCOME_TRACK.building_materials[0]),
      valuables: String(INCOME_TRACK.valuables[0]),
    },
    resources: {
      gold: String(DEFAULT_RESOURCES.gold),
      building_materials: String(DEFAULT_RESOURCES.building_materials),
      valuables: String(DEFAULT_RESOURCES.valuables),
    },
    units: DEFAULT_UNITS,
    buildings: [],
    pool: null,
    poolFar: "",
    poolNear: "",
    mapCounts: { starting: "", far: "", near: "", center: "" },
    mapModes: { starting: "fixed", far: "fixed", near: "fixed", center: "fixed" },
    victory: "",
    defeat: "",
    selectedRounds: [],
    eventTexts: {},
    focusedEventRound: null,
    eventChipsHint: CHIPS_HINT,
    rules: Array.from({ length: FIRST_RULE_FIELDS }, () => ""),
    ruleChipsHint: RULE_CHIPS_HINT,
  };
}

/** What a stepper counts in: plain numbers, or multiples of the player count ("P", "2P"). */
export type StepperUnit = "" | "P";

/**
 * The whole number a stepper field shows. A stepper with the "P" unit shows a
 * multiple of the player count, "P" for one and "2P" for two, and also takes
 * a bare number.
 *
 * @returns null when the field holds no such number
 */
export function stepperNumber(typed: string, unit: StepperUnit): number | null {
  const text = typed.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const multiple = unit === "P" ? /^(\d*)P$/i.exec(text) : null;
  return multiple ? Number(multiple[1] || 1) : null;
}

/** @returns n as the stepper shows it: "P", "2P" with the "P" unit, else the number */
export function stepperText(n: number, unit: StepperUnit): string {
  if (unit !== "P") return String(n);
  return n === 1 ? "P" : `${n}P`;
}

/**
 * What a stepper button leaves in its field: the field's number moved by
 * `delta`, held to min and max. A field that holds no whole number, such as an
 * empty one, steps from the min.
 */
export function stepped(typed: string, delta: number, min: number, max: number, unit: StepperUnit): string {
  const from = stepperNumber(typed, unit) ?? min;
  return stepperText(Math.min(max, Math.max(min, from + delta)), unit);
}

/** @returns a number field's value, or null while it is empty */
export function numberIn(typed: string): number | null {
  return typed === "" ? null : Number(typed);
}

/** @returns whether a number field holds nothing, or a whole number from min to max */
export function numberOk(typed: string, min: number, max: number): boolean {
  if (typed === "") return true;
  const n = Number(typed);
  return Number.isInteger(n) && n >= min && n <= max;
}

/** The range a Map Setup field's stepper moves in, for its mode. */
export function tileRange(mode: TileMode): { min: number; max: number; unit: StepperUnit } {
  return mode === "perplayer" ? { min: 1, max: MAX_PER_PLAYER, unit: "P" } : { min: 0, max: MAX_MAP_TILES, unit: "" };
}

/**
 * A Map Setup field's count: a whole number up to MAX_MAP_TILES in fixed
 * mode, or a multiple of the player count from 1 to MAX_PER_PLAYER in
 * per-player mode, shown as P, 2P … 6P (a bare number is taken too).
 *
 * @returns null while empty, undefined when out of range
 */
export function tileCountIn(typed: string, mode: TileMode): TileCount | null | undefined {
  const text = typed.trim();
  if (text === "") return null;
  if (mode === "perplayer") {
    const multiple = /^(\d*)P$/i.exec(text) ?? /^(\d+)$/.exec(text);
    const n = multiple ? Number(multiple[1] || 1) : 0;
    return n >= 1 && n <= MAX_PER_PLAYER ? { perPlayer: n } : undefined;
  }
  if (!/^\d+$/.test(text)) return undefined;
  const n = Number(text);
  return n <= MAX_MAP_TILES ? n : undefined;
}

/** @returns whether the count asks for any Map Tile */
export function usesTiles(count: TileCount): boolean {
  return typeof count === "object" ? count.perPlayer > 0 : count > 0;
}

/**
 * A Map Setup field's text once its mode changes: the number it held, held to
 * the new mode's range and written in its unit.
 */
export function retiled(typed: string, from: TileMode, to: TileMode): string {
  const { min, max, unit } = tileRange(to);
  const current = stepperNumber(typed, tileRange(from).unit) ?? min;
  return stepperText(Math.min(max, Math.max(min, current)), unit);
}

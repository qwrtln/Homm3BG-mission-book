// The start wizard: a fourth way onto a new scenario, beside resume, copy and
// blank. It asks one pane of questions at a time, collects the answers into a
// WizardAnswers object, and hands the text shared/scenario-wizard.ts makes
// from them to the workspace. It holds no LaTeX knowledge of its own.
//
// The wizard is state (`store.wizard`: the current and furthest pane, the
// answers of the panes passed, and every field as typed); components/wizard/
// renders it. This module is what changes it: the actions the components call,
// and the rules that say whether a pane is answered and good enough to go on.
//
// Each pane is data (see WizardPane); navigation reads only that interface,
// so a later pane is one more entry in the list.

import { errorMessage } from "../../shared/errors.ts";
import { validateScenarioName } from "../../shared/scenario-name.ts";
import {
  BUILDINGS,
  fillScenarioTemplate,
  MAX_PER_PLAYER,
  type MapSetup,
  type ResourceValues,
  type TimedEvent,
  WIZARD_TEMPLATE_PATH,
  type WizardAnswers,
} from "../../shared/scenario-wizard.ts";
import {
  CHIPS_HINT,
  CHIPS_NEED_ROUND,
  EVENT_CHIPS,
  FIRST_EVENT_ROUND,
  MAX_MAP_TILES,
  MAX_POOL_TILES,
  MAX_RESOURCE,
  MAX_RULE_FIELDS,
  numberIn,
  numberOk,
  RESOURCES,
  RULE_CHIPS,
  RULE_CHIPS_FULL,
  RULE_CHIPS_HINT,
  retiled,
  TILE_KEYS,
  type TileKey,
  type TileMode,
  tileCountIn,
  usesTiles,
  type WizardFields,
} from "../../shared/wizard-fields.ts";
import { initialWizard, store, type UploadPanelState, type WizardState } from "../store.ts";
import { CATEGORY_LABELS } from "./config.ts";
import { sanitizeFilename } from "./dom.ts";
import { loadDraft } from "./drafts.ts";
import { preloadText } from "./files.ts";
import {
  configureUploadPanel,
  followUploadSlug,
  resetUploadPanel,
  type StagedMap,
  stagedMaps,
  wizardFiles,
} from "./upload-panel.ts";
import { commitGeneratedEntry, newScenarioPath } from "./workspace.ts";

/** What a pane reads its answers from: its own fields, and the images the upload panel holds. */
interface PaneContext {
  fields: WizardFields;
  headerPath: string | null;
  maps: StagedMap[];
}

/**
 * One pane of questions. `read` names every field the pane owns, with
 * `undefined` for an empty one, so a skip can drop exactly those fields.
 */
export interface WizardPane {
  /** The id after "wizard-pane-". */
  id: string;
  /** Whether the pane can be skipped. */
  required: boolean;
  /** The pane's answers. */
  read: (context: PaneContext) => Partial<WizardAnswers>;
  /** Whether anything in the pane is filled in. */
  answered: (context: PaneContext) => boolean;
  /** Whether the answers are good enough to go on. */
  valid: (context: PaneContext) => boolean;
}

// --- pane 1: name, game mode, author, header image -----------------------------

/**
 * Why the typed name cannot be used, or "" when it can. A name that already
 * has a local draft in the chosen category is refused: opening it would show
 * that draft instead of the wizard's answers.
 */
export function nameProblem(fields: WizardFields): string {
  const check = validateScenarioName(fields.name);
  if (!check.valid) return check.message;
  if (fields.category && loadDraft(newScenarioPath(fields.name, fields.category)) !== null) {
    return `You already have a local draft with this name under ${CATEGORY_LABELS[fields.category]}. Open it from the list, or pick another name.`;
  }
  return "";
}

const basicsPane: WizardPane = {
  id: "basics",
  required: true,
  read: ({ fields, headerPath }) => ({
    name: fields.name.trim(),
    category: fields.category ?? undefined,
    author: fields.author.trim() || undefined,
    headerImage: headerPath ?? undefined,
  }),
  answered: ({ fields, headerPath }) =>
    fields.name.trim() !== "" || fields.category !== null || fields.author.trim() !== "" || headerPath !== null,
  valid: ({ fields }) => nameProblem(fields) === "" && fields.category !== null,
};

// --- pane 2: lore ---------------------------------------------------------------

const lorePane: WizardPane = {
  id: "lore",
  required: false,
  read: ({ fields }) => ({ lore: fields.lore.trim() || undefined }),
  answered: ({ fields }) => fields.lore.trim() !== "",
  valid: () => true,
};

// --- pane 3: length and player count --------------------------------------------

const lengthPane: WizardPane = {
  id: "length",
  required: true,
  read: ({ fields }) => ({
    rounds: fields.rounds ?? undefined,
    playerCounts: fields.playerCounts.length ? [...fields.playerCounts].sort((a, b) => a - b) : undefined,
  }),
  answered: ({ fields }) => fields.rounds !== null || fields.playerCounts.length > 0,
  valid: ({ fields }) => fields.rounds !== null,
};

// --- pane 4: starting income and resources -------------------------------------------

/** @returns undefined when all three are empty */
function resourceValues(texts: WizardFields["income"]): ResourceValues | undefined {
  const values = {
    gold: numberIn(texts.gold),
    building_materials: numberIn(texts.building_materials),
    valuables: numberIn(texts.valuables),
  };
  return Object.values(values).some((v) => v !== null) ? values : undefined;
}

const resourcesPane: WizardPane = {
  id: "resources",
  required: false,
  read: ({ fields }) => ({ income: resourceValues(fields.income), resources: resourceValues(fields.resources) }),
  answered: ({ fields }) =>
    resourceValues(fields.income) !== undefined || resourceValues(fields.resources) !== undefined,
  valid: ({ fields }) => RESOURCES.every((resource) => numberOk(fields.resources[resource], 0, MAX_RESOURCE)),
};

// --- pane 5: starting units ------------------------------------------------------------

const unitsPane: WizardPane = {
  id: "units",
  required: false,
  read: ({ fields }) => ({ startingUnits: fields.units.trim() || undefined }),
  answered: ({ fields }) => fields.units.trim() !== "",
  valid: () => true,
};

// --- pane 6: town buildings ------------------------------------------------------------

/** Pane 6's first column: the Dwellings and the Citadel. The rest go in the second. */
export const FIRST_COLUMN: ReadonlySet<string> = new Set(["bronze", "silver", "golden", "citadel"]);

/** @returns the ticked BUILDINGS keys, in the order the two columns list them */
function tickedBuildings(fields: WizardFields): string[] {
  const ticked = new Set(fields.buildings);
  return [
    ...BUILDINGS.filter((building) => FIRST_COLUMN.has(building.key)),
    ...BUILDINGS.filter((building) => !FIRST_COLUMN.has(building.key)),
  ]
    .map((building) => building.key)
    .filter((key) => ticked.has(key));
}

/**
 * Required only in the sense that it cannot be skipped: nothing ticked is an
 * answer too, and writes None.
 */
const buildingsPane: WizardPane = {
  id: "buildings",
  required: true,
  read: ({ fields }) => ({ buildings: tickedBuildings(fields) }),
  answered: ({ fields }) => fields.buildings.length > 0,
  valid: () => true,
};

// --- pane 7: map tile pool -------------------------------------------------------------

/** @returns the two counts, an empty one as 0 */
function poolCounts(fields: WizardFields): { far: number; near: number } {
  return { far: numberIn(fields.poolFar) ?? 0, near: numberIn(fields.poolNear) ?? 0 };
}

function poolCountsOk(fields: WizardFields): boolean {
  return numberOk(fields.poolFar, 0, MAX_POOL_TILES) && numberOk(fields.poolNear, 0, MAX_POOL_TILES);
}

const poolPane: WizardPane = {
  id: "pool",
  required: false,
  read: ({ fields }) => ({
    tilePool: fields.pool === "no" ? false : fields.pool === "yes" ? poolCounts(fields) : undefined,
  }),
  answered: ({ fields }) => fields.pool !== null,
  valid: ({ fields }) => {
    if (fields.pool !== "yes") return true;
    if (!poolCountsOk(fields)) return false;
    const { far, near } = poolCounts(fields);
    return far > 0 || near > 0;
  },
};

// --- pane 8: map setup -----------------------------------------------------------------

/** @returns the four counts, an empty or invalid one as 0 */
function mapCounts(fields: WizardFields): MapSetup {
  const [starting, far, near, center] = TILE_KEYS.map(
    (key) => tileCountIn(fields.mapCounts[key], fields.mapModes[key]) ?? 0,
  );
  return { starting, far, near, center };
}

/** @returns whether Map Setup field `key` holds neither a valid fixed count nor a valid multiplier */
export function tileCountBad(fields: WizardFields, key: TileKey): boolean {
  return tileCountIn(fields.mapCounts[key], fields.mapModes[key]) === undefined;
}

const mapPane: WizardPane = {
  id: "map",
  required: false,
  read: (context) => ({ mapSetup: mapPane.answered(context) ? mapCounts(context.fields) : undefined }),
  answered: ({ fields }) => Object.values(mapCounts(fields)).some(usesTiles),
  valid: ({ fields }) => !TILE_KEYS.some((key) => tileCountBad(fields, key)),
};

// --- pane 9: victory and defeat ----------------------------------------------------------

const conditionsPane: WizardPane = {
  id: "conditions",
  required: false,
  read: ({ fields }) => ({
    victory: fields.victory.trim() || undefined,
    defeat: fields.defeat.trim() || undefined,
  }),
  answered: ({ fields }) => fields.victory.trim() !== "" || fields.defeat.trim() !== "",
  valid: () => true,
};

// --- pane 10: timed events ---------------------------------------------------------------

/** @returns the last Round Timed Events reach, or one below the first while unset */
export function lastEventRound(fields: WizardFields): number {
  return fields.rounds ?? FIRST_EVENT_ROUND - 1;
}

/** @returns the selected Rounds that hold text, in order */
function timedEvents(fields: WizardFields): TimedEvent[] {
  return [...fields.selectedRounds]
    .sort((a, b) => a - b)
    .map((round) => ({ round, text: (fields.eventTexts[round] ?? "").trim() }))
    .filter((event) => event.text !== "");
}

const eventsPane: WizardPane = {
  id: "events",
  required: false,
  read: ({ fields }) => {
    const events = timedEvents(fields);
    return { timedEvents: events.length ? events : undefined };
  },
  answered: ({ fields }) => timedEvents(fields).length > 0,
  valid: () => true,
};

// --- pane 11: additional rules --------------------------------------------------------------

/** @returns the rules typed, empty fields left out */
function typedRules(fields: WizardFields): string[] {
  return fields.rules.map((rule) => rule.trim()).filter(Boolean);
}

const rulesPane: WizardPane = {
  id: "rules",
  required: false,
  read: ({ fields }) => {
    const rules = typedRules(fields);
    return { rules: rules.length ? rules : undefined };
  },
  answered: ({ fields }) => typedRules(fields).length > 0,
  valid: () => true,
};

// --- pane 12: map images ---------------------------------------------------------------

const mapsPane: WizardPane = {
  id: "maps",
  required: false,
  read: ({ maps }) => {
    const staged = maps.map(({ path, counts }) => ({ path, counts }));
    return { maps: staged.length ? staged : undefined };
  },
  answered: ({ maps }) => maps.length > 0,
  valid: () => true,
};

// --- navigation -------------------------------------------------------------------

/**
 * The panes in the order they are asked. The last one creates the scenario.
 */
export const PANES: readonly WizardPane[] = [
  basicsPane,
  lorePane,
  lengthPane,
  resourcesPane,
  unitsPane,
  buildingsPane,
  poolPane,
  mapPane,
  conditionsPane,
  eventsPane,
  rulesPane,
  mapsPane,
];

function contextOf(wizard: WizardState, panel: UploadPanelState): PaneContext {
  return { fields: wizard.fields, headerPath: panel.header?.path ?? null, maps: stagedMaps(panel) };
}

function currentContext(): PaneContext {
  const { wizard, uploadPanels } = store.getState();
  return contextOf(wizard, uploadPanels.wizard);
}

/**
 * Keeps only the fields that hold something.
 */
function filled(fields: Partial<WizardAnswers>): Partial<WizardAnswers> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/**
 * Takes a pane's answers into a copy of the answers object, or drops its
 * fields when it is skipped.
 */
function recorded(pane: WizardPane, answers: Partial<WizardAnswers>, context: PaneContext): Partial<WizardAnswers> {
  const fields = pane.read(context);
  const next = { ...answers };
  for (const key of Object.keys(fields) as (keyof WizardAnswers)[]) delete next[key];
  if (pane.required || pane.answered(context)) Object.assign(next, filled(fields));
  return next;
}

/** @returns whether leaving the wizard now would lose anything */
function holdsAnswers(): boolean {
  const { wizard } = store.getState();
  const context = currentContext();
  // A pane not yet reached holds no answer of the contributor's, only a prefilled default.
  return PANES.slice(0, wizard.furthest + 1).some((pane) => pane.answered(context));
}

function guardUnload(event: BeforeUnloadEvent): void {
  // Switching back to copy or blank keeps the answers, so the guard holds
  // for the whole welcome screen, not just while the wizard shows.
  if (store.getState().workspaceShown || !holdsAnswers()) return;
  event.preventDefault();
  event.returnValue = ""; // older Chromium needs it set to show the prompt
}

/** @returns the first number field in the pane that holds something outside its range, as that range */
function badNumber(pane: WizardPane, fields: WizardFields): { min: number; max: number } | null {
  if (pane === resourcesPane) {
    return RESOURCES.some((resource) => !numberOk(fields.resources[resource], 0, MAX_RESOURCE))
      ? { min: 0, max: MAX_RESOURCE }
      : null;
  }
  if (pane === poolPane) return poolCountsOk(fields) ? null : { min: 0, max: MAX_POOL_TILES };
  return null;
}

/**
 * Why the Next button is greyed out, or "".
 */
function blockedHint(pane: WizardPane, context: PaneContext): string {
  if (pane.valid(context)) return "";
  const { fields } = context;
  if (pane === basicsPane) {
    const problem = nameProblem(fields);
    if (problem && fields.name.trim() === "") return problem;
    if (problem) return "Pick a name that works to continue.";
    return "Choose a game mode to continue.";
  }
  if (pane === lengthPane) return "Choose how many Rounds the Scenario lasts.";
  if (pane === mapPane) {
    return `Use a whole number from 0 to ${MAX_MAP_TILES}, or from 1 to ${MAX_PER_PLAYER} in × Players mode.`;
  }
  const bad = badNumber(pane, fields);
  if (bad) return `Use a whole number from ${bad.min} to ${bad.max}.`;
  if (pane === poolPane) return "Set how many Map Tiles each player takes, or choose No.";
  return "";
}

/** What the nav row shows for the current pane. */
export interface WizardNav {
  /** The Next button's label. */
  nextLabel: string;
  /** Whether the Next button is the green one: the pane is answered, or cannot be skipped. */
  nextPrimary: boolean;
  nextDisabled: boolean;
  backDisabled: boolean;
  step: string;
  hint: string;
}

/**
 * The buttons and notes to match the current pane's answer: Next disabled
 * while the pane is not valid, green Next when answered or required, grey Skip
 * when not. The last pane creates the scenario.
 */
export function wizardNav(wizard: WizardState, panel: UploadPanelState): WizardNav {
  const context = contextOf(wizard, panel);
  const pane = PANES[wizard.current];
  const last = wizard.current === PANES.length - 1;
  const answered = pane.required || pane.answered(context);
  const labels = last ? ["Create scenario", "Skip and create"] : ["Next", "Skip"];
  return {
    nextLabel: answered ? labels[0] : labels[1],
    nextPrimary: answered,
    nextDisabled: wizard.creating || !pane.valid(context),
    backDisabled: wizard.current === 0 || wizard.creating,
    step: `Step ${wizard.current + 1} of ${PANES.length}`,
    hint: wizard.creating ? "Creating your scenario…" : (wizard.error ?? blockedHint(pane, context)),
  };
}

function setWizard(change: Partial<WizardState> | ((wizard: WizardState) => Partial<WizardState>)): void {
  store.setState((s) => ({ wizard: { ...s.wizard, ...(typeof change === "function" ? change(s.wizard) : change) } }));
}

/**
 * Changes the fields the contributor can type into. A message about the last
 * attempt to make the scenario no longer applies once they do.
 */
export function updateFields(change: Partial<WizardFields> | ((fields: WizardFields) => Partial<WizardFields>)): void {
  setWizard((wizard) => ({
    error: null,
    fields: { ...wizard.fields, ...(typeof change === "function" ? change(wizard.fields) : change) },
  }));
}

/** The scenario's name was typed in. The images are named after it until the contributor renames them. */
export function setName(name: string): void {
  updateFields({ name });
  followUploadSlug("wizard");
}

/**
 * Sets the scenario length. A Round above it loses its Timed Event, text
 * included.
 */
export function setRounds(rounds: number): void {
  updateFields((fields) => {
    const last = rounds;
    const kept = fields.selectedRounds.filter((round) => round <= last);
    const eventTexts = Object.fromEntries(Object.entries(fields.eventTexts).filter(([round]) => Number(round) <= last));
    return { rounds, selectedRounds: kept, eventTexts };
  });
}

/** Ticks or unticks one player count. */
export function togglePlayerCount(count: number): void {
  updateFields((fields) => ({
    playerCounts: fields.playerCounts.includes(count)
      ? fields.playerCounts.filter((n) => n !== count)
      : [...fields.playerCounts, count],
  }));
}

/** Ticks or unticks one town building. */
export function toggleBuilding(key: string, ticked: boolean): void {
  updateFields((fields) => ({
    buildings: ticked ? [...fields.buildings.filter((k) => k !== key), key] : fields.buildings.filter((k) => k !== key),
  }));
}

/** Puts a Map Setup field's count toggle into `mode`, clamping its current value to match. */
export function setTileMode(key: TileKey, mode: TileMode): void {
  updateFields((fields) => ({
    mapModes: { ...fields.mapModes, [key]: mode },
    mapCounts: { ...fields.mapCounts, [key]: retiled(fields.mapCounts[key], fields.mapModes[key], mode) },
  }));
}

/** Picks or drops a Round for Timed Events. A dropped one loses its text. */
export function toggleEventRound(round: number): void {
  updateFields((fields) => {
    if (fields.selectedRounds.includes(round)) {
      const { [round]: _dropped, ...eventTexts } = fields.eventTexts;
      return { selectedRounds: fields.selectedRounds.filter((r) => r !== round), eventTexts };
    }
    return { selectedRounds: [...fields.selectedRounds, round] };
  });
}

export function setEventText(round: number, text: string): void {
  updateFields((fields) => ({ eventTexts: { ...fields.eventTexts, [round]: text } }));
}

/** Remembers which Round's textarea has focus, for a chip click. */
export function focusEventRound(round: number): void {
  setWizard((wizard) => ({ fields: { ...wizard.fields, focusedEventRound: round } }));
}

/** Appends a chip's text to a Round's field as a new line. */
export function appendEventText(round: number, text: string): void {
  updateFields((fields) => {
    const current = fields.eventTexts[round] ?? "";
    return { eventTexts: { ...fields.eventTexts, [round]: current ? `${current}\n${text}` : text } };
  });
}

/** A Timed Events chip was clicked: it goes to the last-focused Round, or the first picked one. */
export function clickEventChip(index: number): void {
  const { fields } = store.getState().wizard;
  const order = [...fields.selectedRounds].sort((a, b) => a - b);
  const focused = fields.focusedEventRound;
  const target = focused !== null && fields.selectedRounds.includes(focused) ? focused : order[0];
  if (target === undefined) {
    updateFields({ eventChipsHint: CHIPS_NEED_ROUND });
    return;
  }
  appendEventText(target, EVENT_CHIPS[index]);
  updateFields({ eventChipsHint: CHIPS_HINT });
}

export function setRule(index: number, text: string): void {
  updateFields((fields) => ({ rules: fields.rules.map((rule, i) => (i === index ? text : rule)) }));
}

/** Adds one empty rule field, up to the limit. @returns whether one was added */
export function addRuleField(): boolean {
  if (store.getState().wizard.fields.rules.length >= MAX_RULE_FIELDS) return false;
  updateFields((fields) => ({ rules: [...fields.rules, ""] }));
  return true;
}

/**
 * Puts a rule chip's text into a rule field: an empty field takes it as it
 * is, a filled one gets it after a space, since one field holds one rule.
 */
export function putRuleChip(index: number, text: string): void {
  updateFields((fields) => ({
    rules: fields.rules.map((rule, i) => (i === index ? (rule.trim() ? `${rule.trimEnd()} ${text}` : text) : rule)),
  }));
}

/**
 * A rule chip's click: it fills the first empty rule field, or a new one
 * while there is room.
 */
export function clickRuleChip(index: number): void {
  const { rules } = store.getState().wizard.fields;
  let target = rules.findIndex((rule) => rule.trim() === "");
  if (target === -1 && addRuleField()) target = rules.length;
  if (target === -1) {
    updateFields({ ruleChipsHint: RULE_CHIPS_FULL });
    return;
  }
  updateFields({ ruleChipsHint: RULE_CHIPS_HINT });
  putRuleChip(target, RULE_CHIPS[index]);
}

/** Empties every pane, for the next time the wizard opens. */
function resetPanes(): void {
  resetUploadPanel("wizard");
  store.setState({ wizard: { ...initialWizard(), open: store.getState().wizard.open } });
}

/**
 * Shows the wizard or the copy-or-blank picker, whichever the start choice
 * names. The wizard shows in place of the copy-or-blank steps (the welcome
 * screen's `wizard-open` class follows `wizard.open`), so a pending
 * edit-branch question makes way for it too.
 */
function setStartChoice(wizardOn: boolean): void {
  if (wizardOn) store.setState({ editBranch: null });
  setWizard({ open: wizardOn });
}

/**
 * Swaps the picker for the wizard. A run left earlier comes back on the same
 * pane with its answers; otherwise the wizard starts at its first pane.
 */
export function openWizard(): void {
  if (store.getState().wizard.open) return;
  if (!store.getState().wizard.started) {
    resetPanes();
    setWizard({ current: 0, furthest: 0, started: true });
  }
  setStartChoice(true);
  window.addEventListener("beforeunload", guardUnload);
}

/** Back to copy or blank. The answers stay for the next switch to the wizard. */
export function showPicker(): void {
  setStartChoice(false);
}

/** Ends the run after the scenario is made, dropping every answer. */
function closeWizard(): void {
  window.removeEventListener("beforeunload", guardUnload);
  resetUploadPanel("wizard");
  store.setState({ wizard: initialWizard() });
}

/** Shows one pane. */
function showPane(index: number, answers: Partial<WizardAnswers>): void {
  setWizard((wizard) => ({ current: index, furthest: Math.max(wizard.furthest, index), answers, error: null }));
}

/** Makes the scenario from the answers and opens it in the editor. */
async function create(): Promise<void> {
  const { answers } = store.getState().wizard;
  const { name, category } = answers;
  if (!name || !category) return;
  setWizard({ creating: true, error: null });
  try {
    const template = await preloadText(WIZARD_TEMPLATE_PATH);
    const source = fillScenarioTemplate(template, { ...answers, name, category });
    const files = [...wizardFiles.entries()].map(([path, bytes]) => ({ path, bytes }));
    await commitGeneratedEntry(name, category, source, files);
    closeWizard();
  } catch (error) {
    setWizard({ creating: false, error: `Could not create the scenario: ${errorMessage(error)}` });
  }
}

/** Next, Skip or Create: records the pane and moves on. */
export function advanceWizard(): void {
  const { wizard } = store.getState();
  const pane = PANES[wizard.current];
  const context = currentContext();
  if (wizard.creating || !pane.valid(context)) return;
  const answers = recorded(pane, wizard.answers, context);
  if (wizard.current === PANES.length - 1) {
    setWizard({ answers });
    void create();
    return;
  }
  showPane(wizard.current + 1, answers);
}

/** Back one pane, keeping every answer. */
export function backWizard(): void {
  const { wizard } = store.getState();
  if (wizard.current > 0 && !wizard.creating) showPane(wizard.current - 1, wizard.answers);
}

/** Tells the wizard's upload panel how to name the images: after the scenario. */
export function initWizard(): void {
  configureUploadPanel("wizard", {
    slug: () => sanitizeFilename(store.getState().wizard.fields.name),
    // The wizard renders from the panel's state, so there is nothing to refresh by hand.
    onChange: () => {},
  });
}

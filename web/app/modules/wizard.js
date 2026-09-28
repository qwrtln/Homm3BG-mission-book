// The start wizard: a fourth way onto a new scenario, beside resume, copy and
// blank. It asks one pane of questions at a time, collects the answers into a
// WizardAnswers object, and hands the text shared/scenario-wizard.js makes
// from them to the workspace. It holds no LaTeX knowledge of its own.
//
// Each pane is data (see WizardPane); navigation reads only that interface,
// so a later pane is one more entry in the list.

import { errorMessage } from "../../shared/errors.js";
import { validateScenarioName } from "../../shared/scenario-name.js";
import {
  BUILDINGS,
  fillScenarioTemplate,
  INCOME_TRACK,
  MAX_PER_PLAYER,
  WIZARD_CATEGORIES,
  WIZARD_TEMPLATE_PATH,
} from "../../shared/scenario-wizard.js";
import { CATEGORY_LABELS, REPO } from "./config.js";
import { el, escapeHtml, sanitizeFilename } from "./dom.js";
import { loadDraft } from "./drafts.js";
import { preloadText } from "./files.js";
import { createUploadPanel, MAX_MAP_FILES } from "./upload-panel.js";
import { commitGeneratedEntry, newScenarioPath } from "./workspace.js";

/** @typedef {import("../../shared/scenario-wizard.js").WizardAnswers} WizardAnswers */

/**
 * One pane of questions. `read` names every field the pane owns, with
 * `undefined` for an empty one, so a skip can drop exactly those fields.
 *
 * @typedef {object} WizardPane
 * @property {keyof ElementIdMap} id the pane's element
 * @property {boolean} required whether the pane can be skipped
 * @property {() => void} render draws the pane's current state into its controls
 * @property {() => Partial<WizardAnswers>} read the pane's answers
 * @property {() => boolean} answered whether anything in the pane is filled in
 * @property {() => boolean} valid whether the answers are good enough to go on
 */

const FIRST_ROUND = 4;
const LAST_ROUND = 16;
const MAX_PLAYER_COUNT = 8;
const MAX_RESOURCE = 99;
const MAX_POOL_TILES = 6;
const MAX_MAP_TILES = 20;

const HEADER_HINT = "PNG or JPG. It shows at the top of the scenario. Drop it here, or add it.";
const MAPS_HINT = `PNG only, up to ${MAX_MAP_FILES}. Drop them here, or add them.`;

// --- the header image and the maps ---------------------------------------------------

/**
 * Where the wizard stages its images until the scenario is made. They move
 * into the editor through restoreUploads, at these same paths — the panel
 * stages straight into this map, so create() only has to read it back.
 *
 * @type {Map<string, Uint8Array>}
 */
const wizardFiles = new Map();

/** @type {import("./upload-panel.js").UploadPanel | null} */
let uploadPanel = null;

/** @returns {import("./upload-panel.js").UploadPanel} pane 1's header field and pane 12's maps, as the upload popover draws them */
function uploads() {
  if (!uploadPanel) throw new Error("initWizard() has not run.");
  return uploadPanel;
}

// --- pane 1: name, game mode, author, header image -----------------------------

/** @returns {string | null} the checked game mode */
function chosenCategory() {
  const checked = /** @type {HTMLInputElement | null} */ (el("wizard-category").querySelector("input:checked"));
  return checked ? checked.value : null;
}

/**
 * Why the typed name cannot be used, or "" when it can. A name that already
 * has a local draft in the chosen category is refused: opening it would show
 * that draft instead of the wizard's answers.
 *
 * @returns {string}
 */
function nameProblem() {
  const name = el("wizard-name").value;
  const check = validateScenarioName(name);
  if (!check.valid) return check.message;
  const category = chosenCategory();
  if (category && loadDraft(newScenarioPath(name, category)) !== null) {
    return `You already have a local draft with this name under ${CATEGORY_LABELS[category]}. Open it from the list, or pick another name.`;
  }
  return "";
}

/** @type {WizardPane} */
const basicsPane = {
  id: "wizard-pane-basics",
  required: true,
  render() {
    const typed = el("wizard-name").value;
    const problem = nameProblem();
    // An empty field is not yet a mistake: the hint under the pane asks for it.
    const show = problem !== "" && typed.trim().length > 0;
    el("wizard-name-error").textContent = show ? problem : "";
    el("wizard-name-error").hidden = !show;
    el("wizard-name").setAttribute("aria-invalid", show ? "true" : "false");
    // The images are named after the scenario until the contributor renames them.
    uploads().followSlug();
  },
  read() {
    const name = el("wizard-name").value.trim();
    return {
      name,
      category: chosenCategory() ?? undefined,
      author: el("wizard-author").value.trim() || undefined,
      headerImage: uploads().headerPath() ?? undefined,
    };
  },
  answered() {
    return (
      el("wizard-name").value.trim() !== "" ||
      chosenCategory() !== null ||
      el("wizard-author").value.trim() !== "" ||
      uploads().headerPath() !== null
    );
  },
  valid() {
    return nameProblem() === "" && chosenCategory() !== null;
  },
};

// --- pane 2: lore ---------------------------------------------------------------

/** @type {WizardPane} */
const lorePane = {
  id: "wizard-pane-lore",
  required: false,
  render() {},
  read() {
    return { lore: el("wizard-lore").value.trim() || undefined };
  },
  answered() {
    return el("wizard-lore").value.trim() !== "";
  },
  valid() {
    return true;
  },
};

// --- pane 3: length and player count --------------------------------------------

/** @type {number | null} */
let rounds = null;
/** @type {Set<number>} */
const playerCounts = new Set();

/** @type {WizardPane} */
const lengthPane = {
  id: "wizard-pane-length",
  required: true,
  render() {
    el("wizard-rounds")
      .querySelectorAll("button")
      .forEach((button) => {
        button.setAttribute("aria-pressed", String(Number(button.dataset.value) === rounds));
      });
    el("wizard-players")
      .querySelectorAll("button")
      .forEach((button) => {
        button.setAttribute("aria-pressed", String(playerCounts.has(Number(button.dataset.value))));
      });
  },
  read() {
    return {
      rounds: rounds ?? undefined,
      playerCounts: playerCounts.size ? [...playerCounts].sort((a, b) => a - b) : undefined,
    };
  },
  answered() {
    return rounds !== null || playerCounts.size > 0;
  },
  valid() {
    return rounds !== null;
  },
};

// --- setup pane helpers --------------------------------------------------------------

/** @typedef {"gold" | "building_materials" | "valuables"} Resource */

/** @type {readonly Resource[]} */
const RESOURCES = ["gold", "building_materials", "valuables"];

/** @type {Record<Resource, string>} */
const RESOURCE_LABELS = { gold: "Gold", building_materials: "Building Materials", valuables: "Valuables" };

/** What a Starting Resources field holds until the contributor changes it. */
const DEFAULT_RESOURCES = { gold: 10, building_materials: 0, valuables: 0 };

/**
 * @param {string} name an assets/glyphs basename
 * @returns {string} the glyph's URL
 */
function glyphUrl(name) {
  return `${REPO}/assets/glyphs/${encodeURIComponent(name)}.svg`;
}

/**
 * A decorative glyph image; the control beside it carries the name. With a
 * dark variant, a second image follows that only the dark theme shows.
 *
 * @param {string} name an assets/glyphs basename
 * @param {string | null} [dark] the basename the dark theme shows instead
 * @returns {string}
 */
function glyphImage(name, dark = null) {
  const light = `<img class="wizard-glyph" src="${escapeHtml(glyphUrl(name))}" alt="">`;
  return dark ? `${light}<img class="wizard-glyph dark" src="${escapeHtml(glyphUrl(dark))}" alt="">` : light;
}

/**
 * Puts a field between a − and a + button, Primer's stepper, in place of the
 * browser's own spinner. The field keeps its id, label and value.
 *
 * @param {HTMLInputElement} input
 * @param {string} label the field's name, for the buttons' accessible names
 * @param {number} min
 * @param {number} max
 * @returns {void}
 */
function addStepper(input, label, min, max) {
  const group = document.createElement("span");
  group.className = "wizard-stepper";
  group.dataset.min = String(min);
  group.dataset.max = String(max);
  input.replaceWith(group);
  const name = escapeHtml(label);
  group.innerHTML = `<button type="button" data-step="-1" aria-label="Decrease ${name}">−</button><button type="button" data-step="1" aria-label="Increase ${name}">+</button>`;
  group.insertBefore(input, group.lastElementChild);
}

/**
 * The whole number a stepper field shows. A stepper with the "P" unit shows a
 * multiple of the player count, "P" for one and "2P" for two, and also takes
 * a bare number.
 *
 * @param {HTMLElement} group the .wizard-stepper
 * @param {string} typed the field's value
 * @returns {number | null} null when the field holds no such number
 */
function stepperNumber(group, typed) {
  const text = typed.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const multiple = group.dataset.unit === "P" ? /^(\d*)P$/i.exec(text) : null;
  return multiple ? Number(multiple[1] || 1) : null;
}

/**
 * @param {HTMLElement} group the .wizard-stepper
 * @param {number} n
 * @returns {string} n as the stepper shows it: "P", "2P" with the "P" unit, else the number
 */
function stepperText(group, n) {
  if (group.dataset.unit !== "P") return String(n);
  return n === 1 ? "P" : `${n}P`;
}

/**
 * Steps the field beside a stepper button by one, held to the stepper's min
 * and max. A field that holds no whole number, such as an empty one, steps
 * from the min.
 *
 * @param {Element} button
 * @returns {void}
 */
function step(button) {
  const group = /** @type {HTMLElement | null} */ (button.closest(".wizard-stepper"));
  const input = group?.querySelector("input");
  if (!group || !input) return;
  const min = Number(group.dataset.min);
  const max = Number(group.dataset.max);
  const from = stepperNumber(group, input.value) ?? min;
  const next = Math.min(max, Math.max(min, from + Number(/** @type {HTMLElement} */ (button).dataset.step)));
  input.value = stepperText(group, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * A number field's value, or null while it is empty.
 *
 * @param {HTMLInputElement | HTMLSelectElement} control
 * @returns {number | null}
 */
function numberIn(control) {
  return control.value === "" ? null : Number(control.value);
}

/**
 * The first number field in `root` that holds something outside its min, max
 * or step, or null when every one is good.
 *
 * @param {HTMLElement} root
 * @returns {HTMLInputElement | null}
 */
function badNumber(root) {
  const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll("input[type='number']"));
  return [...inputs].find((input) => !input.validity.valid) ?? null;
}

/**
 * @param {HTMLElement} group
 * @returns {import("../../shared/scenario-wizard.js").ResourceValues | undefined} undefined when all three are empty
 */
function resourceValues(group) {
  /** @param {Resource} resource */
  const value = (resource) => {
    const control = /** @type {HTMLInputElement | HTMLSelectElement} */ (
      group.querySelector(`[data-resource="${resource}"]`)
    );
    return numberIn(control);
  };
  const values = {
    gold: value("gold"),
    building_materials: value("building_materials"),
    valuables: value("valuables"),
  };
  return Object.values(values).some((v) => v !== null) ? values : undefined;
}

// --- pane 4: starting income and resources -------------------------------------------

/** @type {WizardPane} */
const resourcesPane = {
  id: "wizard-pane-resources",
  required: false,
  render() {},
  read() {
    return { income: resourceValues(el("wizard-income")), resources: resourceValues(el("wizard-resources")) };
  },
  answered() {
    return resourceValues(el("wizard-income")) !== undefined || resourceValues(el("wizard-resources")) !== undefined;
  },
  valid() {
    return badNumber(el("wizard-pane-resources")) === null;
  },
};

// --- pane 5: starting units ------------------------------------------------------------

/** What the Starting Units field holds until the contributor changes it: Chain Link's two lines. */
const DEFAULT_UNITS = [
  String.raw`A "Pack" of the cheapest \svg{bronze} Units`,
  String.raw`A "Few" of the most expensive \svg{bronze} Units`,
].join("\n");

/** @type {WizardPane} */
const unitsPane = {
  id: "wizard-pane-units",
  required: false,
  render() {},
  read() {
    return { startingUnits: el("wizard-units").value.trim() || undefined };
  },
  answered() {
    return el("wizard-units").value.trim() !== "";
  },
  valid() {
    return true;
  },
};

// --- pane 6: town buildings ------------------------------------------------------------

/** @returns {string[]} the ticked BUILDINGS keys */
function tickedBuildings() {
  const boxes = /** @type {NodeListOf<HTMLInputElement>} */ (el("wizard-buildings").querySelectorAll("input:checked"));
  return [...boxes].map((box) => box.value);
}

/**
 * Required only in the sense that it cannot be skipped: nothing ticked is an
 * answer too, and writes None.
 *
 * @type {WizardPane}
 */
const buildingsPane = {
  id: "wizard-pane-buildings",
  required: true,
  render() {},
  read() {
    return { buildings: tickedBuildings() };
  },
  answered() {
    return tickedBuildings().length > 0;
  },
  valid() {
    return true;
  },
};

// --- pane 7: map tile pool -------------------------------------------------------------

/** @returns {"yes" | "no" | null} */
function poolChoice() {
  const checked = /** @type {HTMLInputElement | null} */ (el("wizard-pool").querySelector("input:checked"));
  return checked ? /** @type {"yes" | "no"} */ (checked.value) : null;
}

/** @returns {{far: number, near: number}} the two counts, an empty one as 0 */
function poolCounts() {
  return { far: numberIn(el("wizard-pool-far")) ?? 0, near: numberIn(el("wizard-pool-near")) ?? 0 };
}

/** @type {WizardPane} */
const poolPane = {
  id: "wizard-pane-pool",
  required: false,
  render() {
    el("wizard-pool-counts").hidden = poolChoice() !== "yes";
  },
  read() {
    const choice = poolChoice();
    return { tilePool: choice === "no" ? false : choice === "yes" ? poolCounts() : undefined };
  },
  answered() {
    return poolChoice() !== null;
  },
  valid() {
    if (poolChoice() !== "yes") return true;
    if (badNumber(el("wizard-pool-counts"))) return false;
    const { far, near } = poolCounts();
    return far > 0 || near > 0;
  },
};

// --- pane 8: map setup -----------------------------------------------------------------

/** @typedef {import("../../shared/scenario-wizard.js").TileCount} TileCount */

/** @returns {HTMLInputElement[]} the four count fields, in Starting, Far, Near, Center order */
function mapFields() {
  return [el("wizard-map-starting"), el("wizard-map-far"), el("wizard-map-near"), el("wizard-map-center")];
}

/**
 * @param {HTMLInputElement} input
 * @returns {"fixed" | "perplayer"} the count type its mode toggle is set to
 */
function tileMode(input) {
  const wrap = input.closest(".wizard-count");
  return wrap?.getAttribute("data-mode") === "perplayer" ? "perplayer" : "fixed";
}

/**
 * A Map Setup field's count: a whole number up to MAX_MAP_TILES in fixed
 * mode, or a multiple of the player count from 1 to MAX_PER_PLAYER in
 * per-player mode, shown as P, 2P … 6P (a bare number is taken too).
 *
 * @param {HTMLInputElement} input
 * @returns {TileCount | null | undefined} null while empty, undefined when out of range
 */
function tileCountIn(input) {
  const typed = input.value.trim();
  if (typed === "") return null;
  if (tileMode(input) === "perplayer") {
    const multiple = /^(\d*)P$/i.exec(typed) ?? /^(\d+)$/.exec(typed);
    const n = multiple ? Number(multiple[1] || 1) : 0;
    return n >= 1 && n <= MAX_PER_PLAYER ? { perPlayer: n } : undefined;
  }
  if (!/^\d+$/.test(typed)) return undefined;
  const n = Number(typed);
  return n <= MAX_MAP_TILES ? n : undefined;
}

/** @returns {HTMLInputElement | null} the first field that holds neither a valid fixed count nor a valid multiplier */
function badTileCount() {
  return mapFields().find((input) => tileCountIn(input) === undefined) ?? null;
}

/**
 * @param {TileCount} count
 * @returns {boolean} whether the count asks for any Map Tile
 */
function usesTiles(count) {
  return typeof count === "object" ? count.perPlayer > 0 : count > 0;
}

/** @returns {import("../../shared/scenario-wizard.js").MapSetup} the four counts, an empty one as 0 */
function mapCounts() {
  const [starting, far, near, center] = mapFields().map((input) => tileCountIn(input) ?? 0);
  return { starting, far, near, center };
}

/**
 * Puts a field's tile-count mode toggle into `mode`, clamping its stepper
 * range and current value to match.
 *
 * @param {HTMLInputElement} input
 * @param {"fixed" | "perplayer"} mode
 * @returns {void}
 */
function setTileMode(input, mode) {
  const wrap = input.closest(".wizard-count");
  if (!wrap) return;
  wrap.setAttribute("data-mode", mode);
  wrap.querySelectorAll(".wizard-tile-mode button").forEach((button) => {
    button.setAttribute("aria-pressed", String(/** @type {HTMLElement} */ (button).dataset.mode === mode));
  });
  const min = mode === "perplayer" ? 1 : 0;
  const max = mode === "perplayer" ? MAX_PER_PLAYER : MAX_MAP_TILES;
  const group = input.closest(".wizard-stepper");
  if (!(group instanceof HTMLElement)) return;
  const current = stepperNumber(group, input.value) ?? min;
  group.dataset.min = String(min);
  group.dataset.max = String(max);
  group.dataset.unit = mode === "perplayer" ? "P" : "";
  input.value = stepperText(group, Math.min(max, Math.max(min, current)));
}

/** @type {WizardPane} */
const mapPane = {
  id: "wizard-pane-map",
  required: false,
  render() {
    for (const input of mapFields()) {
      input.setAttribute("aria-invalid", tileCountIn(input) === undefined ? "true" : "false");
    }
  },
  read() {
    return { mapSetup: mapPane.answered() ? mapCounts() : undefined };
  },
  answered() {
    return Object.values(mapCounts()).some(usesTiles);
  },
  valid() {
    return badTileCount() === null;
  },
};

// --- pane 9: victory and defeat ----------------------------------------------------------

/** @type {WizardPane} */
const conditionsPane = {
  id: "wizard-pane-conditions",
  required: false,
  render() {},
  read() {
    return {
      victory: el("wizard-victory").value.trim() || undefined,
      defeat: el("wizard-defeat").value.trim() || undefined,
    };
  },
  answered() {
    return el("wizard-victory").value.trim() !== "" || el("wizard-defeat").value.trim() !== "";
  },
  valid() {
    return true;
  },
};

// --- pane 10: timed events ---------------------------------------------------------------

/** The first Round a Timed Event can fall in. */
const FIRST_EVENT_ROUND = 2;

/** The three inspiration chips offered above the Timed Events fields. */
const EVENT_CHIPS = [
  "Remove all Black Cubes from the map.",
  String.raw`All Heroes gain +1 \svg{movement}.`,
  String.raw`Each player may Search (2) \svg{artifact}.`,
];

const CHIPS_HINT = "Drag a chip onto a Round below, or click one to add it to the last-focused Round.";
const CHIPS_NEED_ROUND = "Pick a Round first.";

/** @type {Set<number>} the Rounds picked to have events */
const selectedRounds = new Set();
/** @type {Map<number, string>} each selected Round's typed text */
const eventTexts = new Map();
/** The Round textarea that last had focus, for a chip click. @type {number | null} */
let focusedEventRound = null;

/** @returns {number} the last Round Timed Events reach, or one below the first while unset */
function lastEventRound() {
  return rounds ?? FIRST_EVENT_ROUND - 1;
}

/** Draws the Round picker buttons for pane 10, one per Round from 2 to the chosen length. @returns {void} */
function drawEventRounds() {
  const last = lastEventRound();
  const buttons = [];
  for (let round = FIRST_EVENT_ROUND; round <= last; round++) {
    buttons.push(
      `<button type="button" data-round="${round}" aria-pressed="${selectedRounds.has(round)}">Round ${round}</button>`,
    );
  }
  el("wizard-event-rounds").innerHTML = buttons.join("");
}

/** Draws one textarea per selected Round, in Round order. @returns {void} */
function drawEventFields() {
  const order = [...selectedRounds].sort((a, b) => a - b);
  el("wizard-events").innerHTML = order
    .map(
      (round) =>
        `<div class="wizard-event" data-round="${round}"><label for="wizard-event-${round}">Round ${round}</label><textarea id="wizard-event-${round}" rows="2" aria-label="Round ${round} events, one per line">${escapeHtml(eventTexts.get(round) ?? "")}</textarea></div>`,
    )
    .join("");
}

/**
 * Keeps only the Rounds still in range after a length change, dropping a
 * Round above it together with its text, then redraws the picker and the
 * fields.
 *
 * @returns {void}
 */
function syncEventRounds() {
  const last = lastEventRound();
  for (const round of [...selectedRounds]) {
    if (round > last) {
      selectedRounds.delete(round);
      eventTexts.delete(round);
    }
  }
  drawEventRounds();
  drawEventFields();
}

/** @returns {import("../../shared/scenario-wizard.js").TimedEvent[]} the selected Rounds that hold text, in order */
function timedEvents() {
  return [...selectedRounds]
    .sort((a, b) => a - b)
    .map((round) => ({ round, text: (eventTexts.get(round) ?? "").trim() }))
    .filter((event) => event.text !== "");
}

/**
 * Appends a chip's text to a Round's textarea as a new line, and saves it.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {string} text
 * @returns {void}
 */
function appendChipText(textarea, text) {
  textarea.value = textarea.value ? `${textarea.value}\n${text}` : text;
  const round = Number(textarea.closest(".wizard-event")?.getAttribute("data-round"));
  eventTexts.set(round, textarea.value);
  refresh();
}

/** @type {WizardPane} */
const eventsPane = {
  id: "wizard-pane-events",
  required: false,
  // The fields are redrawn only when a Round is (de)selected or the length
  // changes, never on every keystroke — a redraw mid-typing would drop focus.
  render() {},
  read() {
    const events = timedEvents();
    return { timedEvents: events.length ? events : undefined };
  },
  answered() {
    return timedEvents().length > 0;
  },
  valid() {
    return true;
  },
};

// --- pane 11: additional rules --------------------------------------------------------------

const FIRST_RULE_FIELDS = 3;
const MAX_RULE_FIELDS = 8;

/** The inspiration chips offered above the rule fields: rules the book's scenarios use most. */
const RULE_CHIPS = [
  "Level VII Neutral Combats cannot be skipped.",
  "You cannot recruit a Secondary Hero.",
  String.raw`\textbf{Obelisk:} Roll 1 \svg{resource} or \svg{treasure}.`,
];

const RULE_CHIPS_HINT = "Drag a chip onto a rule field, or click one to fill the next empty field.";
const RULE_CHIPS_FULL = "Every field holds a rule. Clear one, or add the rest in the editor.";

/** @returns {HTMLTextAreaElement[]} the rule fields, in order */
function ruleFields() {
  return [.../** @type {NodeListOf<HTMLTextAreaElement>} */ (el("wizard-rules").querySelectorAll("textarea"))];
}

/** @returns {string[]} the rules typed, empty fields left out */
function typedRules() {
  return ruleFields()
    .map((field) => field.value.trim())
    .filter(Boolean);
}

/**
 * Adds one rule field, and hides + with a note once the limit is reached.
 *
 * @returns {HTMLTextAreaElement} the new field
 */
function addRuleField() {
  const n = ruleFields().length + 1;
  const wrap = document.createElement("div");
  wrap.className = "wizard-field";
  const id = `wizard-rule-${n}`;
  wrap.innerHTML = `<label for="${id}">Rule ${n}</label><textarea id="${id}" rows="2"></textarea>`;
  el("wizard-rules").append(wrap);
  const full = n >= MAX_RULE_FIELDS;
  el("wizard-rules-add").hidden = full;
  el("wizard-rules-limit").hidden = !full;
  return /** @type {HTMLTextAreaElement} */ (wrap.querySelector("textarea"));
}

/**
 * Puts a rule chip's text into a rule field: an empty field takes it as it
 * is, a filled one gets it after a space, since one field holds one rule.
 *
 * @param {HTMLTextAreaElement} field
 * @param {string} text
 * @returns {void}
 */
function putRuleChip(field, text) {
  field.value = field.value.trim() ? `${field.value.trimEnd()} ${text}` : text;
  refresh();
}

/**
 * A chip click's target: the first empty rule field, or a new one while
 * there is room.
 *
 * @returns {HTMLTextAreaElement | null} null when every field is filled and the limit is reached
 */
function emptyRuleField() {
  const empty = ruleFields().find((field) => field.value.trim() === "");
  if (empty) return empty;
  return ruleFields().length < MAX_RULE_FIELDS ? addRuleField() : null;
}

/** @type {WizardPane} */
const rulesPane = {
  id: "wizard-pane-rules",
  required: false,
  render() {},
  read() {
    const rules = typedRules();
    return { rules: rules.length ? rules : undefined };
  },
  answered() {
    return typedRules().length > 0;
  },
  valid() {
    return true;
  },
};

// --- pane 12: map images ---------------------------------------------------------------

/** @type {WizardPane} */
const mapsPane = {
  id: "wizard-pane-maps",
  required: false,
  render() {},
  read() {
    const maps = uploads()
      .maps()
      .map(({ path, counts }) => ({ path, counts }));
    return { maps: maps.length ? maps : undefined };
  },
  answered() {
    return uploads().maps().length > 0;
  },
  valid() {
    return true;
  },
};

// --- navigation -------------------------------------------------------------------

/**
 * The panes in the order they are asked. The last one creates the scenario.
 *
 * @type {WizardPane[]}
 */
const PANES = [
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

let current = 0;
/** The furthest pane shown in this run; the panes past it hold only their defaults. */
let furthest = 0;
/** @type {Partial<WizardAnswers>} what the passed panes answered; a skipped pane has no fields here */
let answers = {};
let creating = false;
/** Whether the panes hold a run that switching away keeps for later. */
let started = false;

/**
 * Keeps only the fields that hold something.
 *
 * @param {Partial<WizardAnswers>} fields
 * @returns {Partial<WizardAnswers>}
 */
function filled(fields) {
  return /** @type {Partial<WizardAnswers>} */ (
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
  );
}

/**
 * Takes a pane's answers into the answers object, or drops its fields when
 * it is skipped.
 *
 * @param {WizardPane} pane
 * @returns {void}
 */
function record(pane) {
  const fields = pane.read();
  const keys = /** @type {(keyof WizardAnswers)[]} */ (Object.keys(fields));
  for (const key of keys) delete answers[key];
  if (pane.required || pane.answered()) Object.assign(answers, filled(fields));
}

/** @returns {boolean} whether leaving the wizard now would lose anything */
function holdsAnswers() {
  // A pane not yet reached holds no answer of the contributor's, only a prefilled default.
  return PANES.slice(0, furthest + 1).some((pane) => pane.answered());
}

/**
 * @param {BeforeUnloadEvent} event
 * @returns {void}
 */
function guardUnload(event) {
  // Switching back to copy or blank keeps the answers, so the guard holds
  // for the whole welcome screen, not just while the wizard shows.
  if (el("welcome").hidden || !holdsAnswers()) return;
  event.preventDefault();
  event.returnValue = ""; // older Chromium needs it set to show the prompt
}

/**
 * Why the Next button is greyed out, or "".
 *
 * @param {WizardPane} pane
 * @returns {string}
 */
function blockedHint(pane) {
  if (pane.valid()) return "";
  if (pane === basicsPane) {
    const problem = nameProblem();
    if (problem && el("wizard-name").value.trim() === "") return problem;
    if (problem) return "Pick a name that works to continue.";
    return "Choose a game mode to continue.";
  }
  if (pane === lengthPane) return "Choose how many Rounds the Scenario lasts.";
  if (pane === mapPane) {
    return `Use a whole number from 0 to ${MAX_MAP_TILES}, or from 1 to ${MAX_PER_PLAYER} in × Players mode.`;
  }
  const bad = badNumber(el(pane.id));
  if (bad) return `Use a whole number from ${bad.min} to ${bad.max}.`;
  if (pane === poolPane) return "Set how many Map Tiles each player takes, or choose No.";
  return "";
}

/**
 * Draws the current pane and sets the buttons to match its answer: disabled
 * while the pane is not valid, green Next when answered or required, grey
 * Skip when not. The last pane creates the scenario.
 *
 * @returns {void}
 */
function refresh() {
  const pane = PANES[current];
  pane.render();
  const last = current === PANES.length - 1;
  const answered = pane.required || pane.answered();
  const next = el("wizard-next");
  next.disabled = creating || !pane.valid();
  next.classList.toggle("primary", answered);
  const labels = last ? ["Create scenario", "Skip and create"] : ["Next", "Skip"];
  next.textContent = answered ? labels[0] : labels[1];
  el("wizard-back").disabled = current === 0 || creating;
  el("wizard-step").textContent = `Step ${current + 1} of ${PANES.length}`;
  el("wizard-hint").textContent = creating ? "Creating your scenario…" : blockedHint(pane);
}

/**
 * Shows one pane and hides the rest.
 *
 * @param {number} index
 * @returns {void}
 */
function showPane(index) {
  current = index;
  furthest = Math.max(furthest, index);
  PANES.forEach((pane, i) => {
    el(pane.id).hidden = i !== index;
  });
  refresh();
  // A field before a button: a stepper's − button comes before its field.
  const root = el(PANES[index].id);
  const first = /** @type {HTMLElement | null} */ (
    root.querySelector("input, select, textarea") ?? root.querySelector("button")
  );
  first?.focus();
}

/** Empties every pane, for the next time the wizard opens. @returns {void} */
function resetPanes() {
  el("wizard-name").value = "";
  el("wizard-author").value = "";
  el("wizard-lore").value = "";
  el("wizard-category")
    .querySelectorAll("input")
    .forEach((radio) => {
      /** @type {HTMLInputElement} */ (radio).checked = false;
    });
  uploads().reset();
  rounds = null;
  playerCounts.clear();
  el("wizard-panes")
    .querySelectorAll("input[type='number'], #wizard-map input, #wizard-pool-counts input")
    .forEach((control) => {
      /** @type {HTMLInputElement} */ (control).value = "";
    });
  for (const input of mapFields()) setTileMode(input, "fixed");
  // Income starts at the bottom of each track.
  for (const resource of RESOURCES) {
    /** @type {HTMLSelectElement} */ (el("wizard-income").querySelector(`[data-resource="${resource}"]`)).value =
      String(INCOME_TRACK[resource][0]);
    /** @type {HTMLInputElement} */ (el("wizard-resources").querySelector(`[data-resource="${resource}"]`)).value =
      String(DEFAULT_RESOURCES[resource]);
  }
  el("wizard-units").value = DEFAULT_UNITS;
  el("wizard-victory").value = "";
  el("wizard-defeat").value = "";
  selectedRounds.clear();
  eventTexts.clear();
  focusedEventRound = null;
  el("wizard-chips-hint").textContent = CHIPS_HINT;
  el("wizard-rule-chips-hint").textContent = RULE_CHIPS_HINT;
  syncEventRounds(); // rounds is null: no rounds, no fields
  el("wizard-rules").innerHTML = "";
  for (let n = 0; n < FIRST_RULE_FIELDS; n++) addRuleField();
  el("wizard-panes")
    .querySelectorAll("#wizard-buildings input, #wizard-pool input[type='radio']")
    .forEach((box) => {
      /** @type {HTMLInputElement} */ (box).checked = false;
    });
  answers = {};
  creating = false;
}

/**
 * Shows the wizard or the copy-or-blank picker, whichever the start choice
 * names. Signed in, the resume list shows beside the picker once it has
 * anything to list.
 *
 * @param {boolean} wizardOn
 * @returns {void}
 */
function setStartChoice(wizardOn) {
  el("welcome").classList.toggle("wizard-open", wizardOn);
  el("wizard").hidden = !wizardOn;
  el("start-copy").setAttribute("aria-pressed", String(!wizardOn));
  el("start-wizard").setAttribute("aria-pressed", String(wizardOn));
  el("resume-drafts").hidden = wizardOn || el("resume-list").childElementCount === 0;
  if (wizardOn) el("edit-branch-prompt").hidden = true;
}

/**
 * Swaps the picker for the wizard. A run left earlier comes back on the same
 * pane with its answers; otherwise the wizard starts at its first pane.
 *
 * @returns {void}
 */
export function openWizard() {
  if (!el("wizard").hidden) return;
  if (!started) {
    resetPanes();
    current = 0;
    furthest = 0;
    started = true;
  }
  setStartChoice(true);
  window.addEventListener("beforeunload", guardUnload);
  showPane(current);
}

/**
 * Back to copy or blank. The answers stay for the next switch to the wizard.
 *
 * @returns {void}
 */
export function showPicker() {
  setStartChoice(false);
}

/**
 * Ends the run after the scenario is made, dropping every answer.
 *
 * @returns {void}
 */
function closeWizard() {
  window.removeEventListener("beforeunload", guardUnload);
  setStartChoice(false);
  resetPanes();
  started = false;
  current = 0;
  furthest = 0;
  PANES.forEach((pane) => {
    el(pane.id).hidden = true;
  });
}

/**
 * Makes the scenario from the answers and opens it in the editor.
 *
 * @returns {Promise<void>}
 */
async function create() {
  const name = answers.name;
  const category = answers.category;
  if (!name || !category) return;
  creating = true;
  refresh();
  try {
    const template = await preloadText(WIZARD_TEMPLATE_PATH);
    const source = fillScenarioTemplate(template, /** @type {WizardAnswers} */ ({ ...answers }));
    const files = [...wizardFiles.entries()].map(([path, bytes]) => ({ path, bytes }));
    await commitGeneratedEntry(name, category, source, files);
    closeWizard();
  } catch (error) {
    creating = false;
    refresh();
    el("wizard-hint").textContent = `Could not create the scenario: ${errorMessage(error)}`;
  }
}

/** Next, Skip or Create: records the pane and moves on. @returns {void} */
function advance() {
  const pane = PANES[current];
  if (creating || !pane.valid()) return;
  record(pane);
  if (current === PANES.length - 1) {
    void create();
    return;
  }
  showPane(current + 1);
}

/**
 * Draws one row of joined toggle buttons.
 *
 * @param {HTMLElement} group
 * @param {number} from
 * @param {number} to
 * @param {(n: number) => string} label the button's accessible name
 * @returns {void}
 */
function drawToggles(group, from, to, label) {
  const buttons = [];
  for (let n = from; n <= to; n++) {
    buttons.push(
      `<button type="button" data-value="${n}" aria-pressed="false" aria-label="${escapeHtml(label(n))}">${n}</button>`,
    );
  }
  group.innerHTML = buttons.join("");
}

/**
 * Draws pane 4's controls: a select per resource on its income track, and a
 * stepped number field per resource for what a player starts with.
 *
 * @returns {void}
 */
function drawResourceControls() {
  el("wizard-income").innerHTML = RESOURCES.map((resource) => {
    const options = INCOME_TRACK[resource].map((n) => `<option value="${n}">${n}</option>`).join("");
    return `<label class="wizard-resource">${glyphImage(resource)}<select data-resource="${resource}" aria-label="${RESOURCE_LABELS[resource]} income">${options}</select></label>`;
  }).join("");
  el("wizard-resources").innerHTML = RESOURCES.map(
    (resource) =>
      `<span class="wizard-resource">${glyphImage(resource)}<input type="number" data-resource="${resource}" min="0" max="${MAX_RESOURCE}" step="1" value="${DEFAULT_RESOURCES[resource]}" aria-label="Starting ${RESOURCE_LABELS[resource]}"></span>`,
  ).join("");
  for (const resource of RESOURCES) {
    const input = /** @type {HTMLInputElement} */ (
      el("wizard-resources").querySelector(`[data-resource="${resource}"]`)
    );
    addStepper(input, `Starting ${RESOURCE_LABELS[resource]}`, 0, MAX_RESOURCE);
  }
}

/** Pane 6's first column: the Dwellings and the Citadel. The rest go in the second. */
const FIRST_COLUMN = new Set(["bronze", "silver", "golden", "citadel"]);

/**
 * Draws pane 6's checkboxes in two columns. The line they write keeps the
 * BUILDINGS order whatever the columns show.
 *
 * @returns {void}
 */
function drawBuildings() {
  /** @param {import("../../shared/scenario-wizard.js").Building} building */
  const box = (building) =>
    `<label class="wizard-check"><input type="checkbox" value="${escapeHtml(building.key)}">${glyphImage(building.glyph, building.darkGlyph)}<span>${escapeHtml(building.label)}</span></label>`;
  /** @param {boolean} first */
  const column = (first) =>
    `<div class="wizard-check-column">${BUILDINGS.filter((building) => FIRST_COLUMN.has(building.key) === first)
      .map(box)
      .join("")}</div>`;
  el("wizard-buildings").innerHTML = column(true) + column(false);
}

/**
 * Puts a stepper round each Map Tile count, on panes 7 and 8.
 *
 * @returns {void}
 */
function drawTileSteppers() {
  /** @type {[HTMLInputElement, number][]} */
  const fields = [
    [el("wizard-pool-far"), MAX_POOL_TILES],
    [el("wizard-pool-near"), MAX_POOL_TILES],
    ...mapFields().map((input) => /** @type {[HTMLInputElement, number]} */ ([input, MAX_MAP_TILES])),
  ];
  for (const [input, max] of fields) {
    addStepper(input, `${input.labels?.[0]?.textContent ?? ""} Map Tiles`, 0, max);
  }
}

/**
 * @param {string[]} chips
 * @returns {string} one draggable chip button per text
 */
function chipButtons(chips) {
  return chips
    .map(
      (text, i) =>
        `<button type="button" class="wizard-chip" draggable="true" data-chip="${i}">${escapeHtml(text)}</button>`,
    )
    .join("");
}

/** Draws the inspiration chips above the Timed Events and the rule fields. @returns {void} */
function drawChips() {
  el("wizard-chips").innerHTML = chipButtons(EVENT_CHIPS);
  el("wizard-chips-hint").textContent = CHIPS_HINT;
  el("wizard-rule-chips").innerHTML = chipButtons(RULE_CHIPS);
  el("wizard-rule-chips-hint").textContent = RULE_CHIPS_HINT;
}

/**
 * Wires the entry link, the panes and the wizard's buttons.
 *
 * @returns {void}
 */
export function initWizard() {
  uploadPanel = createUploadPanel({
    elements: {
      headerInput: el("wizard-header"),
      headerAdd: el("wizard-header-add"),
      headerCard: el("wizard-header-card"),
      headerName: el("wizard-header-name"),
      headerOrig: el("wizard-header-orig"),
      headerPreview: el("wizard-header-preview"),
      headerRemove: el("wizard-header-remove"),
      headerStatus: el("wizard-header-status"),
      headerZone: el("wizard-header-field"),
      mapsInput: el("wizard-maps"),
      mapsAdd: el("wizard-maps-add"),
      mapsList: el("wizard-maps-names"),
      mapsStatus: el("wizard-maps-status"),
      mapsZone: el("wizard-maps-field"),
    },
    slug: () => sanitizeFilename(el("wizard-name").value),
    staged: wizardFiles,
    mapCodes: false,
    headerHint: HEADER_HINT,
    mapsHint: MAPS_HINT,
    onChange: refresh,
  });

  el("wizard-category-options").innerHTML = WIZARD_CATEGORIES.map(
    (category) =>
      `<label><input type="radio" name="wizard-category" value="${escapeHtml(category)}"><span>${escapeHtml(CATEGORY_LABELS[category])}</span></label>`,
  ).join("");
  drawToggles(el("wizard-rounds"), FIRST_ROUND, LAST_ROUND, (n) => `${n} Rounds`);
  drawToggles(el("wizard-players"), 1, MAX_PLAYER_COUNT, (n) => `${n} player${n === 1 ? "" : "s"}`);
  drawResourceControls();
  drawBuildings();
  drawTileSteppers();
  drawChips();
  el("wizard")
    .querySelectorAll("img[data-glyph]")
    .forEach((img) => {
      /** @type {HTMLImageElement} */ (img).src = glyphUrl(/** @type {HTMLImageElement} */ (img).dataset.glyph ?? "");
    });

  el("start-wizard").addEventListener("click", openWizard);
  el("start-copy").addEventListener("click", showPicker);
  el("wizard-back").addEventListener("click", () => {
    if (current > 0 && !creating) showPane(current - 1);
  });
  el("wizard-next").addEventListener("click", advance);

  el("wizard-panes").addEventListener("input", refresh);
  el("wizard-panes").addEventListener("change", refresh);
  el("wizard-panes").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".wizard-stepper button") : null;
    if (button) step(button);
  });

  el("wizard-rounds").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    rounds = Number(button.dataset.value);
    syncEventRounds();
    refresh();
  });
  el("wizard-players").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    const n = Number(button.dataset.value);
    if (playerCounts.has(n)) playerCounts.delete(n);
    else playerCounts.add(n);
    refresh();
  });

  // Pane 8's mode toggle: Fixed count or a multiple of the number of players.
  el("wizard-map").addEventListener("click", (event) => {
    const button = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest(".wizard-tile-mode button") : null
    );
    if (!button) return;
    const input = button.closest(".wizard-count")?.querySelector("input");
    const mode = /** @type {"fixed" | "perplayer"} */ (button.dataset.mode);
    if (input instanceof HTMLInputElement) setTileMode(input, mode);
    refresh();
  });

  // Pane 11's chips: dragged onto a rule field, or clicked into the next empty one.
  el("wizard-rule-chips").addEventListener("dragstart", (event) => {
    const chip = event.target instanceof Element ? event.target.closest(".wizard-chip") : null;
    if (!(chip instanceof HTMLElement) || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", RULE_CHIPS[Number(chip.dataset.chip)]);
    event.dataTransfer.effectAllowed = "copy";
  });
  el("wizard-rule-chips").addEventListener("click", (event) => {
    const chip = event.target instanceof Element ? event.target.closest(".wizard-chip") : null;
    if (!(chip instanceof HTMLElement)) return;
    const field = emptyRuleField();
    el("wizard-rule-chips-hint").textContent = field ? RULE_CHIPS_HINT : RULE_CHIPS_FULL;
    if (field) putRuleChip(field, RULE_CHIPS[Number(chip.dataset.chip)]);
  });
  el("wizard-rules").addEventListener("dragover", (event) => {
    if (event.target instanceof HTMLTextAreaElement) event.preventDefault();
  });
  el("wizard-rules").addEventListener("drop", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    const text = event.dataTransfer?.getData("text/plain");
    if (text) putRuleChip(field, text);
  });

  el("wizard-rules-add").addEventListener("click", () => {
    if (ruleFields().length >= MAX_RULE_FIELDS) return;
    const field = addRuleField();
    field.focus();
    refresh();
  });

  // Pane 10: the Round picker, its fields, and the inspiration chips.
  el("wizard-event-rounds").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    const round = Number(button.dataset.round);
    if (selectedRounds.has(round)) {
      selectedRounds.delete(round);
      eventTexts.delete(round);
    } else {
      selectedRounds.add(round);
    }
    drawEventRounds();
    drawEventFields();
    refresh();
  });
  el("wizard-events").addEventListener("input", (event) => {
    const textarea = event.target;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const round = Number(textarea.closest(".wizard-event")?.getAttribute("data-round"));
    eventTexts.set(round, textarea.value);
  });
  el("wizard-events").addEventListener("focusin", (event) => {
    const textarea = event.target;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    focusedEventRound = Number(textarea.closest(".wizard-event")?.getAttribute("data-round"));
  });
  el("wizard-events").addEventListener("dragover", (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("textarea") : null;
    if (!textarea) return;
    event.preventDefault();
  });
  el("wizard-events").addEventListener("drop", (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("textarea") : null;
    if (!textarea) return;
    event.preventDefault();
    const text = event.dataTransfer?.getData("text/plain");
    if (text) appendChipText(/** @type {HTMLTextAreaElement} */ (textarea), text);
  });
  el("wizard-chips").addEventListener("dragstart", (event) => {
    const chip = event.target instanceof Element ? event.target.closest(".wizard-chip") : null;
    if (!(chip instanceof HTMLElement) || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", EVENT_CHIPS[Number(chip.dataset.chip)]);
    event.dataTransfer.effectAllowed = "copy";
  });
  el("wizard-chips").addEventListener("click", (event) => {
    const chip = event.target instanceof Element ? event.target.closest(".wizard-chip") : null;
    if (!(chip instanceof HTMLElement)) return;
    const text = EVENT_CHIPS[Number(chip.dataset.chip)];
    const order = [...selectedRounds].sort((a, b) => a - b);
    const target = focusedEventRound !== null && selectedRounds.has(focusedEventRound) ? focusedEventRound : order[0];
    if (target === undefined) {
      el("wizard-chips-hint").textContent = CHIPS_NEED_ROUND;
      return;
    }
    const textarea = document.getElementById(`wizard-event-${target}`);
    if (textarea instanceof HTMLTextAreaElement) appendChipText(textarea, text);
    el("wizard-chips-hint").textContent = CHIPS_HINT;
  });
}

// What a contributor may type as a scenario name on the welcome screen.
//
// The name is a title, not a path: sanitizeFilename() and slugify() derive the
// file name and the branch from it later, and both would happily fold "@#$"
// into "untitled". Rejecting those characters here keeps the derived name
// recognisable, and keeps the reason for a disabled "Open editor" sayable.

export const MIN_SCENARIO_NAME_LENGTH = 3;
export const MAX_SCENARIO_NAME_LENGTH = 60;

/**
 * A new scenario named this would take the branch `scenario-editor/<user>/updates`,
 * and git cannot also hold `.../updates/<slug>`, where in-place edits live.
 */
const RESERVED_SLUG = "updates";

/** Letters (any script), digits, spaces, hyphens and apostrophes. */
const ALLOWED_NAME_CHARACTERS = /^[\p{L}\p{N} '’-]+$/u;

export interface NameCheck {
  valid: boolean;
  /** empty when valid; what to show the contributor otherwise */
  message: string;
}

/**
 * Checks a typed scenario name, ignoring leading and trailing spaces.
 *
 * @param name what the contributor typed
 */
export function validateScenarioName(name: string): NameCheck {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, message: "Name your scenario to continue." };
  if (trimmed.length < MIN_SCENARIO_NAME_LENGTH) {
    return { valid: false, message: `Use at least ${MIN_SCENARIO_NAME_LENGTH} characters.` };
  }
  if (trimmed.length > MAX_SCENARIO_NAME_LENGTH) {
    return { valid: false, message: `Use at most ${MAX_SCENARIO_NAME_LENGTH} characters.` };
  }
  if (!ALLOWED_NAME_CHARACTERS.test(trimmed)) {
    return { valid: false, message: "Use letters, digits, spaces, hyphens and apostrophes only." };
  }
  if (trimmed.toLowerCase() === RESERVED_SLUG) {
    return { valid: false, message: `"${trimmed}" is reserved. Pick another name.` };
  }
  return { valid: true, message: "" };
}

const DRAFT_ROOT = "draft-scenarios";

/**
 * The categories a new scenario can be filed under, as draft-scenarios/
 * subdirectory names, in the order the welcome screen lists them. A test
 * keeps this in step with DRAFT_GROUP_FILES in build-plan.ts.
 */
export const DRAFT_CATEGORIES: readonly string[] = Object.freeze(["clash", "coops", "alliances", "campaigns"]);

/**
 * The category a scenario's file sits in, published or draft.
 *
 * @param path repository path, e.g. "clash/x.tex" or "draft-scenarios/coops/x.tex"
 * @returns the category key, or null for a path outside every category
 */
export function categoryOfPath(path: string): string | null {
  const parts = path.split("/");
  const start = parts[0] === DRAFT_ROOT ? 1 : 0;
  if (parts.length !== start + 2) return null;
  const category = parts[start];
  return DRAFT_CATEGORIES.includes(category) ? category : null;
}

/**
 * Directory a new scenario's file lands in. A new scenario is always a draft,
 * so it never goes into a published directory, whatever it starts from.
 *
 * @param category one of DRAFT_CATEGORIES
 * @returns e.g. "draft-scenarios/coops"
 */
export function newScenarioDir(category: string): string {
  if (!DRAFT_CATEGORIES.includes(category)) throw new Error(`Unknown scenario category "${category}".`);
  return `${DRAFT_ROOT}/${category}`;
}

/**
 * The kind a scenario names in the second argument of \addscenariosection,
 * for each category with one fixed kind. A campaign's kind names the
 * campaign itself, so it has no entry.
 */
export const SCENARIO_KINDS: Readonly<Record<string, string>> = Object.freeze({
  clash: "Clash Scenario",
  coops: "Cooperative Scenario",
  alliances: "Alliance Scenario",
});

/**
 * Makes a scenario's heading name the kind of its category. Only a standard
 * kind is replaced: a hand-written one such as "Clash/Alliance Scenario" and
 * every campaign heading stay as they are, as does any source filed under
 * campaigns.
 *
 * @param source one .tex file's text
 * @param category one of DRAFT_CATEGORIES
 * @returns the source, with at most the heading's kind changed
 */
export function withScenarioKind(source: string, category: string): string {
  const kind = SCENARIO_KINDS[category];
  if (!kind) return source;
  const standard = Object.values(SCENARIO_KINDS);
  return source.replace(/(\\addscenariosection(?:\[[^\]]*\])?\{[^}]*\}\{)([^}]*)(\})/, (whole, head, current, tail) =>
    standard.includes(current) ? `${head}${kind}${tail}` : whole,
  );
}

/**
 * Moves a draft scenario's path into another category, keeping its file name.
 *
 * @param path a draft path, "draft-scenarios/<category>/<file>.tex"
 * @param category one of DRAFT_CATEGORIES
 * @returns "draft-scenarios/<category>/<file>.tex"
 */
export function withCategory(path: string, category: string): string {
  const parts = path.split("/");
  if (parts[0] !== DRAFT_ROOT || categoryOfPath(path) === null) {
    throw new Error(`"${path}" is not a draft scenario path.`);
  }
  return `${newScenarioDir(category)}/${parts[2]}`;
}

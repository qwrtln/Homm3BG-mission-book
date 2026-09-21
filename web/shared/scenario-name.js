// What a contributor may type as a scenario name on the welcome screen.
//
// The name is a title, not a path: sanitizeFilename() and slugify() derive the
// file name and the branch from it later, and both would happily fold "@#$"
// into "untitled". Rejecting those characters here keeps the derived name
// recognisable, and keeps the reason for a disabled "Let's go!" sayable.

export const MIN_SCENARIO_NAME_LENGTH = 3;
export const MAX_SCENARIO_NAME_LENGTH = 60;

/**
 * A new scenario named this would take the branch `scenario-editor/<user>/updates`,
 * and git cannot also hold `.../updates/<slug>`, where in-place edits live.
 */
const RESERVED_SLUG = "updates";

/** Letters (any script), digits, spaces, hyphens and apostrophes. */
const ALLOWED_NAME_CHARACTERS = /^[\p{L}\p{N} '’-]+$/u;

/**
 * @typedef {object} NameCheck
 * @property {boolean} valid
 * @property {string} message empty when valid; what to show the contributor otherwise
 */

/**
 * Checks a typed scenario name, ignoring leading and trailing spaces.
 *
 * @param {string} name what the contributor typed
 * @returns {NameCheck}
 */
export function validateScenarioName(name) {
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
 * Directory a new scenario's file lands in. A new scenario is always a draft,
 * so it never goes into a published directory, even when it starts from a
 * published scenario's source.
 *
 * @param {string} pickedPath repository path of the entry the contributor started from
 * @param {string | null} [category] template picks only: the category button chosen
 * @returns {string} e.g. "draft-scenarios/coops"
 */
export function newScenarioDir(pickedPath, category = null) {
  if (category) return `${DRAFT_ROOT}/${category}`;
  const parts = pickedPath.split("/");
  const start = parts[0] === DRAFT_ROOT ? 1 : 0;
  return `${DRAFT_ROOT}/${parts[start]}`;
}

// The address of an open scenario: "#/drafts/<name>" for a new scenario's
// draft, "#/updates/<name>" for a member's in-place edit of an existing one.
// The name is the scenario's repository path without ".tex", so two scenarios
// sharing a file name in different categories get different addresses:
// "#/drafts/clash/gold_rush", "#/updates/coops/gold_rush". A draft's path drops
// its leading "draft-scenarios/", which every draft shares.
// A hash, not a path: the app is served as static files, where a path such as
// "/drafts/<name>" would 404 on reload.

/** @typedef {"drafts" | "updates"} RouteKind */

/**
 * @typedef {object} Route
 * @property {RouteKind} kind
 * @property {string} slug the scenario's path, see pathToSlug
 */

const ROUTE_PATTERN = /^#\/(drafts|updates)\/(.+?)\/?$/;
const DRAFT_ROOT = "draft-scenarios/";

/**
 * @param {string} hash a location.hash value
 * @returns {Route | null} null when the hash is not a scenario address
 */
export function parseRoute(hash) {
  const match = ROUTE_PATTERN.exec(hash);
  if (!match) return null;
  let slug;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (slug.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return { kind: /** @type {RouteKind} */ (match[1]), slug };
}

/**
 * @param {RouteKind} kind
 * @param {string} slug
 * @returns {string} a location.hash value
 */
export function buildRoute(kind, slug) {
  return `#/${kind}/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * @param {RouteKind} kind
 * @param {string} texPath a scenario's repository path, e.g. "draft-scenarios/clash/x.tex"
 * @returns {string} e.g. "clash/x" for a draft, "draft-scenarios/clash/x" for an update
 */
export function pathToSlug(kind, texPath) {
  const bare = texPath.replace(/\.tex$/, "");
  return kind === "drafts" && bare.startsWith(DRAFT_ROOT) ? bare.slice(DRAFT_ROOT.length) : bare;
}

/**
 * @param {RouteKind} kind
 * @param {string} slug
 * @returns {string} the repository path pathToSlug turned into `slug`
 */
export function slugToPath(kind, slug) {
  return `${kind === "drafts" ? DRAFT_ROOT : ""}${slug}.tex`;
}

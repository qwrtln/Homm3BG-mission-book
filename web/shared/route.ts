// The address of an open scenario: "#/drafts/<name>" for a new scenario's
// draft, "#/updates/<name>" for a member's in-place edit of an existing one.
// The name is the scenario's repository path without ".tex", so two scenarios
// sharing a file name in different categories get different addresses:
// "#/drafts/clash/gold_rush", "#/updates/coops/gold_rush". A draft's path drops
// its leading "draft-scenarios/", which every draft shares.
// A hash, not a path: the app is served as static files, where a path such as
// "/drafts/<name>" would 404 on reload.

export type RouteKind = "drafts" | "updates";

export interface Route {
  kind: RouteKind;
  /** the scenario's path, see pathToSlug */
  slug: string;
}

const ROUTE_PATTERN = /^#\/(drafts|updates)\/(.+?)\/?$/;
const DRAFT_ROOT = "draft-scenarios/";

/**
 * @param hash a location.hash value
 * @returns null when the hash is not a scenario address
 */
export function parseRoute(hash: string): Route | null {
  const match = ROUTE_PATTERN.exec(hash);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (slug.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return { kind: match[1] as RouteKind, slug };
}

/** @returns a location.hash value */
export function buildRoute(kind: RouteKind, slug: string): string {
  return `#/${kind}/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * @param texPath a scenario's repository path, e.g. "draft-scenarios/clash/x.tex"
 * @returns e.g. "clash/x" for a draft, "draft-scenarios/clash/x" for an update
 */
export function pathToSlug(kind: RouteKind, texPath: string): string {
  const bare = texPath.replace(/\.tex$/, "");
  return kind === "drafts" && bare.startsWith(DRAFT_ROOT) ? bare.slice(DRAFT_ROOT.length) : bare;
}

/** @returns the repository path pathToSlug turned into `slug` */
export function slugToPath(kind: RouteKind, slug: string): string {
  return `${kind === "drafts" ? DRAFT_ROOT : ""}${slug}.tex`;
}

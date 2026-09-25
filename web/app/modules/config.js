/** @type {string | null} the resolved engine base, computed on first use */
let busytexBaseUrl = null;

/**
 * Where the BusyTeX build lives, as a full URL.
 *
 * GitHub Pages serves this project under a path prefix, so a root-absolute
 * path 404s there. The value also crosses into the BusyTeX worker's own
 * script, which resolves it relative to the worker's URL, not this page —
 * resolving to a full URL here sidesteps that difference.
 *
 * A function, not a module-scope constant: `document` is read on first call,
 * so Node can import this module (and everything that depends on it) without
 * a DOM. The resolved value is memoised, so the browser still sees one URL
 * resolved against one `document.baseURI`, exactly as before.
 *
 * @returns {string}
 */
export function busytexBase() {
  if (busytexBaseUrl === null) busytexBaseUrl = new URL("../core/busytex", document.baseURI).href;
  return busytexBaseUrl;
}
// REPO only ever resolves on this page, never inside the worker, so a plain relative path is safe.
export const REPO = "../repo";

// Each template is itself a scenario-shaped .tex file, so structure.tex can
// \include{} it the same way, with no special-casing in planScenarioBuild.
/** @type {Record<"scenario" | "campaign", {path: string, title: string}>} */
export const TEMPLATES = {
  scenario: { path: "templates/default.tex", title: "Blank scenario" },
  campaign: { path: "templates/campaign.tex", title: "Blank Campaign scenario" },
};

// Different grouping than scenarioHeading's "kind" (prose, not a stable category).
/** @type {Record<string, string>} */
export const CATEGORY_LABELS = { coops: "Coop", clash: "Clash", campaigns: "Campaign", alliances: "Alliance" };
/** @type {string[]} */
export const CATEGORY_ORDER = ["Coop", "Clash", "Campaign", "Alliance"];

// README.md links to these: one branch per scenario, built by build-individual-scenarios.yaml.
export const PUBLISHED_PDF_REPO = "https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts";

/**
 * Where the nightly build publishes one scenario's PDF.
 *
 * @param {string} basename the .tex filename without directory or extension
 * @returns {string}
 */
export function publishedPdfUrl(basename) {
  return `${PUBLISHED_PDF_REPO}/en-${basename}-color/${basename}_en.pdf`;
}

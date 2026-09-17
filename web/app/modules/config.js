// GitHub Pages serves this project under a path prefix, so a root-absolute
// path 404s there. BASE also crosses into the BusyTeX worker's own script,
// which resolves it relative to the worker's URL, not this page — resolving
// to a full URL here up front sidesteps that difference.
export const BASE = new URL("../core/busytex", document.baseURI).href;
// REPO only ever resolves on this page, never inside the worker, so a plain relative path is safe.
export const REPO = "../repo";

// Each template is itself a scenario-shaped .tex file, so structure.tex can
// \include{} it the same way, with no special-casing in planScenarioBuild.
export const TEMPLATES = {
  scenario: { path: "templates/default.tex", title: "Blank scenario" },
  campaign: { path: "templates/campaign.tex", title: "Blank campaign scenario" },
};

// Different grouping than scenarioHeading's "kind" (prose, not a stable category).
export const CATEGORY_LABELS = { coops: "Coop", clash: "Clash", campaigns: "Campaign", alliances: "Alliance" };
export const CATEGORY_ORDER = ["Coop", "Clash", "Campaign", "Alliance"];

// README.md links to these: one branch per scenario, built by build-individual-scenarios.yaml.
export const PUBLISHED_PDF_REPO = "https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts";

export function publishedPdfUrl(basename) {
  return `${PUBLISHED_PDF_REPO}/en-${basename}-color/${basename}_en.pdf`;
}

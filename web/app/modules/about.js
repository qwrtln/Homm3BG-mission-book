import { el } from "./dom.js";

/**
 * Fills a license row's text from the file the deploy ships beside the code
 * it covers, the first time the row opens. A failed load says where the file
 * lives, and the next opening tries again.
 *
 * @param {HTMLDetailsElement} row
 * @returns {Promise<void>}
 */
async function loadLicense(row) {
  const text = /** @type {HTMLPreElement} */ (row.querySelector(".license-text"));
  const src = row.dataset.src;
  if (!src || row.dataset.loaded === "true") return;
  const url = new URL(src, document.baseURI);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text.textContent = await response.text();
    row.dataset.loaded = "true";
  } catch {
    text.textContent = `Could not load this license. It is published at ${url.href}`;
  }
}

/**
 * Wires the menu's About item to the dialog that names the app's license,
 * links its source code, and lists each bundled project's license.
 *
 * @returns {void}
 */
export function initAbout() {
  const dialog = el("about-dialog");
  el("about-open").addEventListener("click", () => dialog.showModal());
  const rows = /** @type {NodeListOf<HTMLDetailsElement>} */ (dialog.querySelectorAll("details.license"));
  for (const row of rows) {
    row.addEventListener("toggle", () => {
      if (row.open) loadLicense(row);
    });
  }
}

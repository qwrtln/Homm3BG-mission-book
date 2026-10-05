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
 * One npm package in the bundle, as the build writes it to licenses.json
 * (vite.config.ts).
 *
 * @typedef {object} Notice
 * @property {string} name
 * @property {string} version
 * @property {string} license the SPDX identifier, or a pointer to the text
 * @property {string} homepage
 * @property {string} text
 */

/**
 * Builds the row for one bundled package. Every value is set as text or as a
 * checked attribute, never as markup.
 *
 * @param {Notice} notice
 * @returns {HTMLDetailsElement}
 */
function noticeRow(notice) {
  const row = document.createElement("details");
  row.className = "license";
  const summary = document.createElement("summary");
  const name = document.createElement("span");
  name.className = "license-name";
  name.textContent = notice.name;
  const kind = document.createElement("span");
  kind.className = "license-kind";
  kind.textContent = `${notice.license} · ${notice.version}`;
  summary.append(name, kind);
  row.append(summary);
  if (/^https?:\/\//.test(notice.homepage)) {
    const home = document.createElement("p");
    home.className = "license-home";
    const link = document.createElement("a");
    link.href = notice.homepage;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = notice.homepage.replace(/^https?:\/\//, "");
    home.append(link);
    row.append(home);
  }
  const text = document.createElement("pre");
  text.className = "license-text";
  text.textContent = notice.text || `See ${notice.homepage || "the package"} for its license.`;
  row.append(text);
  return row;
}

// Whether the bundled packages' rows are in the dialog.
let noticesShown = false;

/**
 * Lists the npm packages in the bundle, from the notices file the build
 * writes next to the page. Tries again at the next opening of the dialog when
 * the file cannot be read (the dev server has none).
 *
 * @returns {Promise<void>}
 */
async function loadNotices() {
  if (noticesShown) return;
  try {
    const response = await fetch(new URL("licenses.json", document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const notices = /** @type {Notice[]} */ (await response.json());
    const group = el("license-bundled");
    group.append(...notices.map(noticeRow));
    group.hidden = notices.length === 0;
    noticesShown = true;
  } catch (error) {
    console.warn("The bundled libraries' licenses could not be listed:", error);
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
  el("about-open").addEventListener("click", () => {
    dialog.showModal();
    loadNotices();
  });
  const rows = /** @type {NodeListOf<HTMLDetailsElement>} */ (dialog.querySelectorAll("details.license"));
  for (const row of rows) {
    row.addEventListener("toggle", () => {
      if (row.open) loadLicense(row);
    });
  }
}

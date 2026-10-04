import { keyLabel, matchesKey, SHORTCUTS, shortcutKeys } from "../../shared/keymap.js";
import { el, isMac } from "./dom.js";

/**
 * One keymap row rendered as a table row: its description and every key
 * alternative for the platform, each in its own <kbd>.
 *
 * @param {import("../../shared/keymap.js").ShortcutRow} row
 * @param {boolean} mac
 * @returns {HTMLTableRowElement}
 */
function renderRow(row, mac) {
  const tr = document.createElement("tr");
  tr.dataset.shortcut = row.id;
  const description = document.createElement("td");
  description.textContent = row.description;
  const keys = document.createElement("td");
  for (const key of shortcutKeys(row.id, mac)) {
    const kbd = document.createElement("kbd");
    kbd.textContent = keyLabel(key, mac);
    keys.appendChild(kbd);
  }
  tr.append(description, keys);
  return tr;
}

/**
 * Wires the menu's Help item and the F1 key to a dialog listing every
 * keyboard shortcut from web/shared/keymap.js, one row per SHORTCUTS entry
 * in table order.
 *
 * @returns {void}
 */
export function initHelp() {
  const mac = isMac();
  const dialog = el("help-dialog");
  const tbody = el("help-shortcuts");
  for (const row of SHORTCUTS) tbody.appendChild(renderRow(row, mac));

  const openHelp = () => {
    if (!dialog.open) dialog.showModal();
  };
  el("help-open").addEventListener("click", openHelp);
  document.addEventListener("keydown", (event) => {
    if (!shortcutKeys("help", mac).some((key) => matchesKey(event, key))) return;
    event.preventDefault();
    openHelp();
  });
}

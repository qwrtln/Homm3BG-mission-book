// The "Before you open a pull request" dialog: what still stands between the
// scenario and a pull request, and the contributor's checklist. The rules
// themselves live in shared/submit-checklist.js; this module only shows them
// and collects the answer.

import { CHECKLIST_ITEMS, submitBlockers } from "../../shared/submit-checklist.js";
import { isDirty } from "./dirty.js";
import { el } from "./dom.js";
import { builtFingerprint } from "./pdf-view.js";
import { state } from "./state.js";

/** @type {Record<import("../../shared/submit-checklist.js").Blocker, string>} */
const BLOCKER_TEXT = {
  unsaved: "Save your changes",
  unbuilt: "Build the PDF from your saved text",
  building: "Wait for the build to finish",
};

/**
 * The dialog's open request; null while it is closed.
 *
 * @type {{checklist: boolean, answer: import("../../shared/submit-checklist.js").ChecklistItem[] | null} | null}
 */
let pending = null;

/**
 * What keeps the open scenario from being submitted right now, read fresh
 * from the app's state every time.
 *
 * @returns {import("../../shared/submit-checklist.js").Blocker[]}
 */
export function currentSubmitBlockers() {
  return submitBlockers({
    dirty: isDirty(),
    building: state.building,
    clean: state.clean,
    built: builtFingerprint(),
  });
}

/**
 * Appends `text` to `parent`, with each `*word*` as an <em>. Built from text
 * nodes, never markup.
 *
 * @param {HTMLElement} parent
 * @param {string} text
 * @returns {void}
 */
function appendEmphasized(parent, text) {
  text.split(/\*([^*]+)\*/).forEach((part, index) => {
    if (part === "") return;
    if (index % 2 === 1) {
      const em = document.createElement("em");
      em.textContent = part;
      parent.append(em);
    } else {
      parent.append(part);
    }
  });
}

/** @returns {HTMLInputElement[]} the checklist's boxes, in CHECKLIST_ITEMS order */
function checkboxes() {
  return [...el("submit-checklist").querySelectorAll("input")];
}

/** @returns {import("../../shared/submit-checklist.js").ChecklistItem[]} the ticked items */
function tickedItems() {
  const ticked = new Set(checkboxes().flatMap((box) => (box.checked ? [box.value] : [])));
  return CHECKLIST_ITEMS.filter((item) => ticked.has(item.id));
}

/**
 * Redraws the unmet conditions and enables Confirm only when nothing blocks.
 *
 * @returns {boolean} true when the pull request may be opened as things stand
 */
function render() {
  if (!pending) return false;
  const blockers = currentSubmitBlockers();
  const list = el("submit-blockers");
  list.replaceChildren(
    ...blockers.map((blocker) => {
      const item = document.createElement("li");
      item.textContent = BLOCKER_TEXT[blocker];
      return item;
    }),
  );
  list.hidden = blockers.length === 0;
  // The checklist vouches for the saved, built scenario, so it cannot be
  // ticked until there is one.
  /** @type {HTMLFieldSetElement} */ (el("submit-checklist")).disabled = blockers.length > 0;
  const allTicked = !pending.checklist || checkboxes().every((box) => box.checked);
  const ready = blockers.length === 0 && allTicked;
  el("submit-confirm").disabled = !ready;
  return ready;
}

/**
 * Re-checks the conditions in the open dialog, for when they change under it
 * (a build that was running ends). Does nothing while the dialog is closed.
 *
 * @returns {void}
 */
export function refreshSubmitDialog() {
  render();
}

/**
 * Shows the dialog and waits for the answer. Every opening starts with every
 * box unticked; the ticks are never kept.
 *
 * @param {{checklist: boolean}} options checklist: show the boxes, and require every one ticked
 * @returns {Promise<import("../../shared/submit-checklist.js").ChecklistItem[] | null>}
 *   the ticked items (empty without a checklist) on confirm; null on Cancel or Escape
 */
export function askToSubmit({ checklist }) {
  const dialog = el("submit-dialog");
  for (const box of checkboxes()) box.checked = false;
  el("submit-checklist").hidden = !checklist;
  const opener = document.activeElement;
  return new Promise((resolve) => {
    pending = { checklist, answer: null };
    render();
    dialog.addEventListener(
      "close",
      () => {
        const answer = pending?.answer ?? null;
        pending = null;
        resolve(answer);
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      },
      { once: true },
    );
    dialog.returnValue = "cancel";
    dialog.showModal();
    el("submit-cancel").focus(); // the safe default
  });
}

/** Draws the checklist and wires the dialog's controls. @returns {void} */
export function initSubmit() {
  const fieldset = el("submit-checklist");
  for (const item of CHECKLIST_ITEMS) {
    const label = document.createElement("label");
    label.className = "submit-item";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = item.id;
    const text = document.createElement("span");
    const heading = document.createElement("strong");
    heading.textContent = `${item.label}:`;
    text.append(heading, " ");
    appendEmphasized(text, item.text);
    label.append(box, text);
    fieldset.append(label);
  }
  fieldset.addEventListener("change", () => {
    render();
  });

  el("submit-cancel").addEventListener("click", () => {
    el("submit-dialog").close("cancel");
  });

  // Checked again here, not trusted from when the dialog opened: a build may
  // have ended, or started, since. A blocker keeps the dialog open.
  el("submit-confirm").addEventListener("click", () => {
    if (!pending || !render()) return;
    pending.answer = pending.checklist ? tickedItems() : [];
    el("submit-dialog").close("confirm");
  });
}

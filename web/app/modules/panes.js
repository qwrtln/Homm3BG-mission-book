import { clampSplit, DEFAULT_SPLIT, parseSplit } from "../../shared/split.js";
import { el } from "./dom.js";
import { state } from "./state.js";

export const SPLIT_KEY = "wasm-scenario-builder:split";

/** How far one arrow key moves the divider, in percent. */
const KEY_STEP = 2;

/** The narrowest a pane may get, in rem. Matches .pane's min-width. */
const MIN_PANE_REM = 20;

/**
 * The saved split, or the default when there is none.
 *
 * @returns {number}
 */
function savedSplit() {
  try {
    return parseSplit(localStorage.getItem(SPLIT_KEY));
  } catch {
    return DEFAULT_SPLIT;
  }
}

/**
 * @param {number} percent
 * @returns {void}
 */
function saveSplit(percent) {
  try {
    localStorage.setItem(SPLIT_KEY, String(percent));
  } catch {
    // Private mode or blocked storage: the split just does not persist.
  }
}

/**
 * Clamps a wanted split to the workspace's current width, then applies it to
 * the panes and the divider's ARIA value, and lets CodeMirror re-measure.
 *
 * @param {number} percent the wanted share of the source pane
 * @returns {number} the share actually applied
 */
function setSplit(percent) {
  const main = el("workspace-main");
  const divider = el("pane-divider");
  const minPx = MIN_PANE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
  const shared = main.getBoundingClientRect().width - divider.getBoundingClientRect().width;
  const applied = clampSplit(percent, shared, minPx);
  main.style.setProperty("--split", String(applied));
  divider.setAttribute("aria-valuenow", String(Math.round(applied)));
  if (state.cm) state.cm.refresh();
  return applied;
}

/**
 * Wires the divider between the source and PDF panes: drag, arrow keys,
 * Home/End and double-click to reset. The split is remembered across reloads.
 *
 * @returns {void}
 */
export function initPanes() {
  const main = el("workspace-main");
  const divider = el("pane-divider");

  // The workspace is hidden at start-up, so there is no width to clamp against
  // yet; the CSS min-width holds both panes until the first interaction.
  let split = savedSplit();
  main.style.setProperty("--split", String(split));
  divider.setAttribute("aria-valuenow", String(Math.round(split)));

  /** @param {PointerEvent} event */
  const follow = (event) => {
    const box = main.getBoundingClientRect();
    const half = divider.getBoundingClientRect().width / 2;
    split = setSplit(((event.clientX - box.left - half) / (box.width - 2 * half)) * 100);
  };

  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    // The PDF embed would swallow the pointer while it crosses it.
    main.classList.add("resizing");
    divider.addEventListener("pointermove", follow);
  });
  const release = () => {
    if (!main.classList.contains("resizing")) return;
    main.classList.remove("resizing");
    divider.removeEventListener("pointermove", follow);
    saveSplit(split);
  };
  divider.addEventListener("pointerup", release);
  divider.addEventListener("pointercancel", release);

  divider.addEventListener("dblclick", () => {
    split = setSplit(DEFAULT_SPLIT);
    saveSplit(split);
  });

  divider.addEventListener("keydown", (event) => {
    /** @type {Record<string, number>} */
    const targets = { ArrowLeft: split - KEY_STEP, ArrowRight: split + KEY_STEP, Home: 0, End: 100 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    split = setSplit(targets[event.key]);
    saveSplit(split);
  });
}

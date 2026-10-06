import { el } from "./dom.js";

// Long enough to read a short sentence twice.
const TOAST_MS = 4000;

/** @type {ReturnType<typeof setTimeout> | null} */
let hideTimer = null;

/**
 * Shows a short notice in the page's corner, then hides it. #toast is a
 * popover, so it lands in the top layer above an open modal dialog; showing
 * it again moves it back on top and restarts its timer.
 *
 * @param {string} message plain text
 * @param {"ok" | "bad"} [tone]
 * @returns {void}
 */
export function showToast(message, tone = "ok") {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.toggle("bad", tone === "bad");
  if (toast.matches(":popover-open")) toast.hidePopover();
  toast.showPopover();
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (toast.matches(":popover-open")) toast.hidePopover();
  }, TOAST_MS);
}

import { state } from "./state.js";

export const el = (id) => document.getElementById(id);

// Spinner element is reused, never rebuilt: a fresh node via innerHTML would restart the CSS animation.
export function setStatus(text, { spinning = false, tone = "" } = {}) {
  el("status-spinner").hidden = !spinning;
  const textEl = el("status-text");
  textEl.textContent = text;
  textEl.className = tone;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

export function setBuilding(value) {
  state.building = value;
  el("build").disabled = value || !state.chosenPath;
  el("build-overlay").hidden = !value;
  el("pdf-body").classList.toggle("dimmed", value);
}

export function basenameNoExt(path) {
  const base = path.split("/").pop();
  return base.replace(/\.tex$/, "");
}

// Safe .tex basename: lowercase, underscores for anything else, "untitled" if that leaves nothing.
export function sanitizeFilename(name) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}

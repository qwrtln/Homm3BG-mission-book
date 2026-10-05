// Pure string helpers used by the DOM-touching modules in app/modules/, kept
// here so tier 1 can test them without a DOM. app/modules/dom.js re-exports
// these for its existing callers.

/**
 * Escapes the characters that could break out of an HTML text node or a
 * quoted attribute value.
 *
 * @param text anything; stringified first, as call sites pass element
 *   textContent, which is nullable
 */
export function escapeHtml(text: unknown): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, (c) => replacements[c]);
}

/** The filename part of a path, without its .tex extension. */
export function basenameNoExt(path: string): string {
  // split always yields at least one element, so pop never returns undefined.
  const base = path.split("/").pop() as string;
  return base.replace(/\.tex$/, "");
}

/**
 * Safe .tex basename: lowercase, underscores for anything else, "untitled"
 * if that leaves nothing.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}

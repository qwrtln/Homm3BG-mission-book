// The single source for every keyboard shortcut: its CodeMirror 5 key names
// per platform, its scope and its display label. Handlers, the Help dialog
// and the build hints all derive their keys and labels from this table, so
// they cannot drift apart.
//
// No DOM or navigator access here: tier 1 imports this module in Node.
// Callers read the platform themselves and pass a boolean in.

/**
 * @typedef {object} ShortcutRow
 * @property {string} id unique across the table
 * @property {string} description shown in the Help dialog
 * @property {"app" | "editor"} scope "app" keys work anywhere in the
 *   workspace; "editor" keys are bound inside CodeMirror only
 * @property {{ mac: string[], other: string[] }} keys CodeMirror 5 key-name
 *   alternatives for the shortcut. A space inside one entry is a sequence
 *   ("Esc Tab"), not a chord.
 * @property {string} [command] the CodeMirror command or app action name
 */

/**
 * Every shortcut the app defines, in Help's display order.
 *
 * @type {readonly ShortcutRow[]}
 */
export const SHORTCUTS = Object.freeze([
  Object.freeze({
    id: "build",
    description: "Build the PDF",
    scope: "app",
    keys: Object.freeze({ mac: ["Cmd-Enter", "Cmd-S"], other: ["Ctrl-Enter", "Ctrl-S"] }),
    command: "build",
  }),
  Object.freeze({
    id: "help",
    description: "Open this Help dialog",
    scope: "app",
    keys: Object.freeze({ mac: ["F1"], other: ["F1"] }),
    command: "help",
  }),
  Object.freeze({
    id: "toggle-comment",
    description: "Toggle line comment",
    scope: "editor",
    keys: Object.freeze({ mac: ["Cmd-/"], other: ["Ctrl-/"] }),
    command: "toggleComment",
  }),
  Object.freeze({
    id: "find",
    description: "Find",
    scope: "editor",
    keys: Object.freeze({ mac: ["Cmd-F"], other: ["Ctrl-F"] }),
    command: "find",
  }),
  Object.freeze({
    id: "replace",
    description: "Find and replace",
    scope: "editor",
    keys: Object.freeze({ mac: ["Alt-Cmd-F"], other: ["Ctrl-H"] }),
    command: "replace",
  }),
  Object.freeze({
    id: "delete-line",
    description: "Delete line",
    scope: "editor",
    keys: Object.freeze({ mac: ["Shift-Cmd-K"], other: ["Shift-Ctrl-K"] }),
    command: "deleteLine",
  }),
  Object.freeze({
    id: "indent",
    description: "Indent",
    scope: "editor",
    keys: Object.freeze({ mac: ["Tab"], other: ["Tab"] }),
    command: "indent",
  }),
  Object.freeze({
    id: "outdent",
    description: "Outdent",
    scope: "editor",
    keys: Object.freeze({ mac: ["Shift-Tab"], other: ["Shift-Tab"] }),
    command: "outdent",
  }),
  Object.freeze({
    id: "leave-editor",
    description: "Leave the editor",
    scope: "editor",
    keys: Object.freeze({ mac: ["Esc Tab", "Esc Shift-Tab"], other: ["Esc Tab", "Esc Shift-Tab"] }),
  }),
]);

/** Platform strings (navigator.platform or userAgentData.platform) counted as macOS or iOS. */
const MAC_PLATFORMS = new Set(["MacIntel", "macOS", "iPhone", "iPad"]);

/**
 * Whether a platform string names macOS or iOS.
 *
 * @param {string} platform e.g. navigator.userAgentData?.platform or navigator.platform
 * @returns {boolean}
 */
export function isMacPlatform(platform) {
  return MAC_PLATFORMS.has(platform);
}

/** One key's parts, in Apple modifier order, mapped to their macOS symbols.
 * @type {Readonly<Record<string, string>>} */
const MAC_SYMBOLS = Object.freeze({
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Cmd: "⌘",
});

/** Named keys whose macOS symbol differs from the key name itself.
 * @type {Readonly<Record<string, string>>} */
const MAC_KEY_SYMBOLS = Object.freeze({
  Enter: "↩",
});

/** Modifier order used to join the non-macOS "+"-separated label. */
const MODIFIER_ORDER = Object.freeze(["Ctrl", "Alt", "Shift", "Cmd"]);

/**
 * The display label for one CodeMirror key-name entry (no spaces: a single
 * chord, not a sequence).
 *
 * @param {string} key a CodeMirror 5 key name, e.g. "Shift-Cmd-K"
 * @param {boolean} mac true to render macOS symbols, false for "Ctrl+Alt+Shift+Key"
 * @returns {string}
 */
function chordLabel(key, mac) {
  const parts = key.split("-");
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (mac) {
    const symbols = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
      .map((modifier) => MAC_SYMBOLS[modifier])
      .join("");
    return `${symbols}${MAC_KEY_SYMBOLS[mainKey] ?? mainKey}`;
  }
  const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
  return [...ordered, mainKey].join("+");
}

/**
 * Display text for one key entry from a ShortcutRow's keys list. A space
 * inside the entry is a sequence, joined with ", then ".
 *
 * @param {string} key a CodeMirror 5 key-name entry, chord or sequence
 * @param {boolean} mac true to render macOS symbols
 * @returns {string}
 */
export function keyLabel(key, mac) {
  return key
    .split(" ")
    .map((chord) => chordLabel(chord, mac))
    .join(", then ");
}

/**
 * The keys of one shortcut for the given platform.
 *
 * @param {string} id a SHORTCUTS row id
 * @param {boolean} mac true for the macOS alternatives, false for other
 * @returns {string[]}
 */
export function shortcutKeys(id, mac) {
  const row = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Unknown shortcut id "${id}".`);
  return mac ? row.keys.mac : row.keys.other;
}

/**
 * Whether a DOM KeyboardEvent-shaped object is exactly one CodeMirror key
 * name (a single chord, not a sequence), with exact modifiers. Letters
 * compare case-insensitively.
 *
 * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }} event
 * @param {string} key a CodeMirror 5 key name, e.g. "Shift-Cmd-K"
 * @returns {boolean}
 */
export function matchesKey(event, key) {
  const parts = key.split("-");
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  /** @type {Readonly<Record<string, boolean>>} */
  const checks = Object.freeze({
    Ctrl: event.ctrlKey,
    Alt: event.altKey,
    Shift: event.shiftKey,
    Cmd: event.metaKey,
  });
  for (const modifierName of MODIFIER_ORDER) {
    if (checks[modifierName] !== modifiers.includes(modifierName)) return false;
  }
  if (mainKey.length === 1 && event.key.length === 1) {
    return event.key.toLowerCase() === mainKey.toLowerCase();
  }
  return event.key === mainKey;
}

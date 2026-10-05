// The single source for every keyboard shortcut: its CodeMirror 5 key names
// per platform, its scope and its display label. Handlers, the Help dialog
// and the build hints all derive their keys and labels from this table, so
// they cannot drift apart.
//
// No DOM or navigator access here: tier 1 imports this module in Node.
// Callers read the platform themselves and pass a boolean in.

export interface ShortcutRow {
  /** unique across the table */
  id: string;
  /** shown in the Help dialog */
  description: string;
  /** "app" keys work anywhere in the workspace; "editor" keys are bound inside CodeMirror only */
  scope: "app" | "editor";
  /**
   * CodeMirror 5 key-name alternatives for the shortcut. A space inside one
   * entry is a sequence ("Esc Tab"), not a chord.
   */
  keys: { mac: string[]; other: string[] };
  /** the CodeMirror command or app action name */
  command?: string;
}

/** Every shortcut the app defines, in Help's display order. */
export const SHORTCUTS: readonly ShortcutRow[] = Object.freeze([
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
] satisfies ShortcutRow[]);

/** Platform strings (navigator.platform or userAgentData.platform) counted as macOS or iOS. */
const MAC_PLATFORMS = new Set(["MacIntel", "macOS", "iPhone", "iPad"]);

/**
 * Whether a platform string names macOS or iOS.
 *
 * @param platform e.g. navigator.userAgentData?.platform or navigator.platform
 */
export function isMacPlatform(platform: string): boolean {
  return MAC_PLATFORMS.has(platform);
}

/** One key's parts, in Apple modifier order, mapped to their macOS symbols. */
const MAC_SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Cmd: "⌘",
});

/** Named keys whose macOS symbol differs from the key name itself. */
const MAC_KEY_SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  Enter: "↩",
});

/** Modifier order used to join the non-macOS "+"-separated label. */
const MODIFIER_ORDER = Object.freeze(["Ctrl", "Alt", "Shift", "Cmd"]);

/**
 * The display label for one CodeMirror key-name entry (no spaces: a single
 * chord, not a sequence).
 *
 * @param key a CodeMirror 5 key name, e.g. "Shift-Cmd-K"
 * @param mac true to render macOS symbols, false for "Ctrl+Alt+Shift+Key"
 */
function chordLabel(key: string, mac: boolean): string {
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
 * @param key a CodeMirror 5 key-name entry, chord or sequence
 * @param mac true to render macOS symbols
 */
export function keyLabel(key: string, mac: boolean): string {
  return key
    .split(" ")
    .map((chord) => chordLabel(chord, mac))
    .join(", then ");
}

/**
 * The keys of one shortcut for the given platform.
 *
 * @param id a SHORTCUTS row id
 * @param mac true for the macOS alternatives, false for other
 */
export function shortcutKeys(id: string, mac: boolean): string[] {
  const row = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Unknown shortcut id "${id}".`);
  return mac ? row.keys.mac : row.keys.other;
}

/**
 * Whether a DOM KeyboardEvent-shaped object is exactly one CodeMirror key
 * name (a single chord, not a sequence), with exact modifiers. Letters
 * compare case-insensitively.
 *
 * @param key a CodeMirror 5 key name, e.g. "Shift-Cmd-K"
 */
export function matchesKey(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
  key: string,
): boolean {
  const parts = key.split("-");
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const checks: Readonly<Record<string, boolean>> = Object.freeze({
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

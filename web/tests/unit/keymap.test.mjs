// Tier 1 check of web/shared/keymap.ts: platform detection, labels, key
// matching and table integrity.

import assert from "node:assert/strict";
import test from "node:test";

import { isMacPlatform, keyLabel, matchesKey, SHORTCUTS, shortcutKeys, toEditorKey } from "../../shared/keymap.ts";

test("isMacPlatform recognizes macOS and iOS platform strings", () => {
  for (const platform of ["MacIntel", "macOS", "iPhone", "iPad"]) {
    assert.equal(isMacPlatform(platform), true, platform);
  }
});

test("isMacPlatform rejects other platform strings", () => {
  for (const platform of ["Win32", "Linux x86_64", "", "Android"]) {
    assert.equal(isMacPlatform(platform), false, platform);
  }
});

test("keyLabel renders non-macOS chords with +", () => {
  assert.equal(keyLabel("Ctrl-Enter", false), "Ctrl+Enter");
  assert.equal(keyLabel("Shift-Ctrl-K", false), "Ctrl+Shift+K");
});

test("keyLabel renders macOS chords with symbols in Apple order", () => {
  assert.equal(keyLabel("Cmd-Enter", true), "⌘↩");
  assert.equal(keyLabel("Shift-Cmd-K", true), "⇧⌘K");
  assert.equal(keyLabel("Alt-Cmd-F", true), "⌥⌘F");
});

test("keyLabel joins a sequence with ', then '", () => {
  assert.equal(keyLabel("Esc Tab", false), "Esc, then Tab");
  assert.equal(keyLabel("Esc Tab", true), "Esc, then Tab");
});

test("keyLabel covers every row on both platforms", () => {
  const expected = {
    build: { mac: ["⌘↩", "⌘S"], other: ["Ctrl+Enter", "Ctrl+S"] },
    help: { mac: ["F1"], other: ["F1"] },
    "toggle-comment": { mac: ["⌘/"], other: ["Ctrl+/"] },
    find: { mac: ["⌘F"], other: ["Ctrl+F"] },
    replace: { mac: ["⌥⌘F"], other: ["Ctrl+H"] },
    "delete-line": { mac: ["⇧⌘K"], other: ["Ctrl+Shift+K"] },
    indent: { mac: ["Tab"], other: ["Tab"] },
    outdent: { mac: ["⇧Tab"], other: ["Shift+Tab"] },
    "leave-editor": {
      mac: ["Esc, then Tab", "Esc, then ⇧Tab"],
      other: ["Esc, then Tab", "Esc, then Shift+Tab"],
    },
  };
  assert.deepEqual(
    SHORTCUTS.map((row) => row.id),
    Object.keys(expected),
  );
  for (const row of SHORTCUTS) {
    assert.deepEqual(
      row.keys.mac.map((key) => keyLabel(key, true)),
      expected[row.id].mac,
      `${row.id} mac`,
    );
    assert.deepEqual(
      row.keys.other.map((key) => keyLabel(key, false)),
      expected[row.id].other,
      `${row.id} other`,
    );
  }
});

test("matchesKey accepts exact modifiers", () => {
  assert.equal(
    matchesKey({ key: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, "Ctrl-Enter"),
    true,
  );
});

test("matchesKey rejects extra modifiers", () => {
  assert.equal(
    matchesKey({ key: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, "Ctrl-Enter"),
    false,
  );
});

test("matchesKey rejects missing modifiers", () => {
  assert.equal(
    matchesKey({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, "Ctrl-Enter"),
    false,
  );
});

test("matchesKey compares letters case-insensitively", () => {
  assert.equal(
    matchesKey({ key: "k", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true }, "Shift-Cmd-K"),
    true,
  );
  assert.equal(
    matchesKey({ key: "K", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true }, "Shift-Cmd-K"),
    true,
  );
});

test("shortcutKeys returns the row's keys for the platform", () => {
  assert.deepEqual(shortcutKeys("build", true), ["Cmd-Enter", "Cmd-S"]);
  assert.deepEqual(shortcutKeys("build", false), ["Ctrl-Enter", "Ctrl-S"]);
});

test("shortcutKeys throws on an unknown id", () => {
  assert.throws(() => shortcutKeys("no-such-shortcut", false));
});

test("every row has keys for both mac and other", () => {
  for (const row of SHORTCUTS) {
    assert.ok(Array.isArray(row.keys.mac) && row.keys.mac.length > 0, `${row.id} mac`);
    assert.ok(Array.isArray(row.keys.other) && row.keys.other.length > 0, `${row.id} other`);
  }
});

test("ids are unique", () => {
  const ids = SHORTCUTS.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no two rows in the same scope share a key on one platform", () => {
  for (const platform of ["mac", "other"]) {
    const seen = new Map();
    for (const row of SHORTCUTS) {
      for (const key of row.keys[platform]) {
        const found = seen.get(`${row.scope}:${key}`);
        assert.equal(found, undefined, `${platform}: "${key}" used by both ${found} and ${row.id}`);
        seen.set(`${row.scope}:${key}`, row.id);
      }
    }
  }
});

test("toEditorKey spells every editor key the way the editor's keymap does", () => {
  assert.equal(toEditorKey("Ctrl-/"), "Ctrl-/");
  assert.equal(toEditorKey("Shift-Ctrl-K"), "Shift-Ctrl-k");
  assert.equal(toEditorKey("Alt-Cmd-F"), "Alt-Cmd-f");
  assert.equal(toEditorKey("Shift-Tab"), "Shift-Tab");
  assert.equal(toEditorKey("Esc"), "Escape");
});

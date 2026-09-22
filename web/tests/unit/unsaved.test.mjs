import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUnsavedChanges, uploadsSignature } from "../../shared/unsaved.js";

const bytes = (n) => new Uint8Array(n);

test("an empty upload set has an empty signature", () => {
  assert.equal(uploadsSignature(new Map()), "");
});

test("the signature ignores insertion order and tells files apart by size", () => {
  const a = new Map([
    ["assets/images/a.png", bytes(3)],
    ["assets/maps/b.png", bytes(5)],
  ]);
  const b = new Map([
    ["assets/maps/b.png", bytes(5)],
    ["assets/images/a.png", bytes(3)],
  ]);
  assert.equal(uploadsSignature(a), uploadsSignature(b));
  assert.notEqual(uploadsSignature(a), uploadsSignature(new Map([["assets/images/a.png", bytes(4)]])));
});

test("identical text and uploads are clean", () => {
  assert.equal(hasUnsavedChanges({ text: "x", uploads: "" }, { text: "x", uploads: "" }), false);
});

test("changed text is unsaved", () => {
  assert.equal(hasUnsavedChanges({ text: "x", uploads: "" }, { text: "xy", uploads: "" }), true);
});

test("changed uploads are unsaved", () => {
  assert.equal(hasUnsavedChanges({ text: "x", uploads: "" }, { text: "x", uploads: "a:1" }), true);
});

test("no clean copy counts as unsaved", () => {
  assert.equal(hasUnsavedChanges({ text: null, uploads: "" }, { text: "", uploads: "" }), true);
});

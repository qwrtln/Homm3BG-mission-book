import assert from "node:assert/strict";
import { test } from "node:test";
import { assetsSignature, hasUnsavedChanges, shouldOfferLocalDraft, uploadsSignature } from "../../shared/unsaved.ts";

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

test("shouldOfferLocalDraft: equal text is not offered", () => {
  assert.equal(shouldOfferLocalDraft({ text: "x", uploads: "" }, { text: "x", uploads: null }), false);
});

test("shouldOfferLocalDraft: differing text is offered", () => {
  assert.equal(shouldOfferLocalDraft({ text: "x", uploads: "" }, { text: "y", uploads: null }), true);
});

test("shouldOfferLocalDraft: no stored local text has no opinion", () => {
  assert.equal(shouldOfferLocalDraft({ text: "x", uploads: "" }, { text: null, uploads: null }), false);
});

test("assetsSignature matches uploadsSignature over the same files", () => {
  const assets = [
    { path: "assets/images/a.png", bytes: bytes(3) },
    { path: "assets/maps/b.png", bytes: bytes(5) },
  ];
  const map = new Map(assets.map((a) => [a.path, a.bytes]));
  assert.equal(assetsSignature(assets), uploadsSignature(map));
});

test("assetsSignature of an empty list is the empty signature", () => {
  assert.equal(assetsSignature([]), "");
});

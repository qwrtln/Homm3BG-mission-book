import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKLIST_ITEMS, pullRequestBody, submitBlockers, submitRequirements } from "../../shared/submit-checklist.ts";

// --- the items --------------------------------------------------------------

test("the checklist holds the four items in order, frozen", () => {
  assert.deepEqual(
    CHECKLIST_ITEMS.map((item) => item.id),
    ["playtested", "proofread", "official-terms", "layout-checked"],
  );
  assert.ok(Object.isFrozen(CHECKLIST_ITEMS));
  assert.ok(CHECKLIST_ITEMS.every((item) => Object.isFrozen(item)));
});

// --- submitRequirements -------------------------------------------------------

test("a new scenario needs the checklist and the gates", () => {
  assert.deepEqual(submitRequirements({ mode: "new" }), { checklist: true, gates: true });
});

test("an in-place edit needs neither", () => {
  assert.deepEqual(submitRequirements({ mode: "edit" }), { checklist: false, gates: false });
});

// --- submitBlockers -----------------------------------------------------------

const saved = { text: "\\section{Valley}", uploads: "assets/maps/v.png:3" };

test("a saved scenario built from its saved copy has no blockers", () => {
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: saved, built: { ...saved } }), []);
});

test("unsaved changes block", () => {
  assert.deepEqual(submitBlockers({ dirty: true, building: false, clean: saved, built: { ...saved } }), ["unsaved"]);
});

test("a scenario never built is unbuilt", () => {
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: saved, built: null }), ["unbuilt"]);
});

test("text saved after the last build is unbuilt", () => {
  const built = { ...saved, text: "\\section{Old}" };
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: saved, built }), ["unbuilt"]);
});

test("uploads changed after the last build are unbuilt", () => {
  const built = { ...saved, uploads: "" };
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: saved, built }), ["unbuilt"]);
});

test("no saved copy to compare with is unbuilt", () => {
  const built = { ...saved };
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: { text: null, uploads: "" }, built }), [
    "unbuilt",
  ]);
  assert.deepEqual(submitBlockers({ dirty: false, building: false, clean: null, built }), ["unbuilt"]);
});

test("a build in progress blocks", () => {
  assert.deepEqual(submitBlockers({ dirty: false, building: true, clean: saved, built: { ...saved } }), ["building"]);
});

test("blockers come in the order unsaved, unbuilt, building", () => {
  assert.deepEqual(submitBlockers({ dirty: true, building: true, clean: saved, built: null }), [
    "unsaved",
    "unbuilt",
    "building",
  ]);
});

// --- pullRequestBody ----------------------------------------------------------

test("with no items the body is the fixed line alone", () => {
  assert.equal(pullRequestBody([]), "Edited in the browser mission book editor.");
});

test("with the four items the body lists each ticked, then the fixed line", () => {
  assert.equal(
    pullRequestBody(CHECKLIST_ITEMS),
    [
      "### Pre-submit checklist",
      "",
      "- [x] **Playtested:** I have played this scenario at least once, with the Player Count it lists.",
      "- [x] **Proofread:** I have proofread all the text: flavor text, setup, rules and victory conditions.",
      "- [x] **Official terms:** I use official game terms exactly as the rulebooks write them, e.g. *Quick Combat*, not *Quick Fight*.",
      "- [x] **Layout checked:** I read through the compiled PDF preview. The layout, map and icons look right.",
      "",
      "Edited in the browser mission book editor.",
    ].join("\n"),
  );
});

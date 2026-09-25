// Tier 1 check of what the .tex editor offers inside an image argument.

import assert from "node:assert/strict";
import test from "node:test";

import { completionContext, imageCompletions, macroPath } from "../../shared/image-completion.js";

/**
 * The context at the "|" in `marked`, with the "|" taken out.
 *
 * @param {string} marked
 */
function contextAt(marked) {
  const ch = marked.indexOf("|");
  return completionContext(marked.replace("|", ""), ch);
}

const UPLOADED = [
  "assets/images/my_scenario.png",
  "assets/maps/my_scenario_2p.png",
  "assets/maps/my_scenario_4p.png",
  "assets/map-files/my_scenario_4p.map",
];

test("the last argument of \\addscenariosection is a header image argument", () => {
  assert.deepEqual(contextAt("\\addscenariosection{1}{Clash Scenario}{Chain Link}{|}"), {
    kind: "header",
    typed: "",
    from: 51,
    to: 51,
  });
  assert.deepEqual(contextAt("\\addscenariosection{1}{Clash Scenario}{Chain Link}{\\ima|}")?.typed, "\\ima");
  assert.equal(contextAt("\\addscenariosection{1}{Clash Scenario}{Chain |Link}{}"), null, "the title is not an image");
  assert.equal(contextAt("\\addscenariosection{1}{Clash Scenario}{Chain Link}{x}|"), null, "past the closing brace");
});

test("\\includegraphics is a graphics argument, with or without options", () => {
  assert.equal(contextAt("\\includegraphics{\\maps/|}")?.kind, "graphics");
  const context = contextAt("  \\node {\\includegraphics[width=\\linewidth]{\\maps/my|}};");
  assert.equal(context?.kind, "graphics");
  assert.equal(context?.typed, "\\maps/my");
  assert.equal(contextAt("\\includegraphics[width=|\\linewidth]{}"), null, "the options are not a path");
  assert.equal(contextAt("plain text |"), null);
});

test("a pick replaces the whole path the cursor sits in, up to the closing brace", () => {
  const context = contextAt("\\includegraphics{\\maps/o|ld.png}");
  assert.deepEqual([context?.from, context?.to], [17, 30]);
});

test("macroPath writes an upload the way a scenario references it", () => {
  assert.equal(macroPath("assets/images/my_scenario.png"), "\\images/my_scenario.png");
  assert.equal(macroPath("assets/maps/my_scenario_2p.png"), "\\maps/my_scenario_2p.png");
  assert.equal(macroPath("assets/map-files/my_scenario_4p.map"), null, "a map file is no image");
});

test("a header argument offers header images only", () => {
  const context = contextAt("\\addscenariosection{1}{Clash Scenario}{X}{|}");
  assert.ok(context);
  assert.deepEqual(imageCompletions(UPLOADED, context), ["\\images/my_scenario.png"]);
});

test("\\includegraphics offers maps first, then header images", () => {
  const context = contextAt("\\includegraphics{|}");
  assert.ok(context);
  assert.deepEqual(imageCompletions(UPLOADED, context), [
    "\\maps/my_scenario_2p.png",
    "\\maps/my_scenario_4p.png",
    "\\images/my_scenario.png",
  ]);
});

test("typed text narrows the list, prefix matches first, ignoring case", () => {
  const prefix = contextAt("\\includegraphics{\\MAPS/my_scenario_4|}");
  assert.ok(prefix);
  assert.deepEqual(imageCompletions(UPLOADED, prefix), ["\\maps/my_scenario_4p.png"]);

  const substring = contextAt("\\includegraphics{2p|}");
  assert.ok(substring);
  assert.deepEqual(imageCompletions(UPLOADED, substring), ["\\maps/my_scenario_2p.png"]);

  const mixed = contextAt("\\includegraphics{\\images|}");
  assert.ok(mixed);
  assert.deepEqual(imageCompletions(["assets/maps/images.png", ...UPLOADED], mixed), ["\\images/my_scenario.png"]);
});

test("a path typed out in full is not offered again", () => {
  const context = contextAt("\\includegraphics{\\maps/my_scenario_2p.png|}");
  assert.ok(context);
  assert.deepEqual(imageCompletions(UPLOADED, context), []);
});

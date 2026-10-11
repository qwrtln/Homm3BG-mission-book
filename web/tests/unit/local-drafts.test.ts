import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { classifyEntries, decideOpen, gitBlobSha, type LocalSnapshot } from "../../shared/local-drafts.ts";

function snap(overrides: Partial<LocalSnapshot> = {}): LocalSnapshot {
  return { path: "a.tex", textSha: "T", baseSha: "B", staged: false, updatedAt: null, ...overrides };
}

function branch(overrides: Partial<ResumableDraft> = {}): ResumableDraft {
  return { branch: "b", kind: "new", texPath: "a.tex", texSha: "B", assets: [], ...overrides };
}

const states = (entries: ReturnType<typeof classifyEntries>) => entries.map((e) => [e.path, e.state]);

test("gitBlobSha matches git's known blobs", async () => {
  assert.equal(await gitBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  assert.equal(await gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
});

test("gitBlobSha hashes bytes, not characters", async () => {
  const text = "zażółć gęślą jaźń\n";
  const bytes = Buffer.from(text, "utf8");
  assert.notEqual(bytes.length, text.length);
  const expected = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(await gitBlobSha(text), expected);
});

test("a branch with no local copy is synced", () => {
  assert.deepEqual(states(classifyEntries([], [branch()], "complete")), [["a.tex", "synced"]]);
});

test("a local copy still on the branch's text is synced", () => {
  const entries = classifyEntries([snap({ textSha: "B" })], [branch()], "complete");
  assert.deepEqual(states(entries), [["a.tex", "synced"]]);
});

test("an edited copy on the branch's current text is unsaved", () => {
  const entries = classifyEntries([snap()], [branch()], "complete");
  assert.deepEqual(states(entries), [["a.tex", "unsaved"]]);
});

test("an edited copy whose branch moved is a conflict", () => {
  const entries = classifyEntries([snap()], [branch({ texSha: "NEW" })], "complete");
  assert.deepEqual(states(entries), [["a.tex", "conflict"]]);
});

test("staged uploads count as an edit", () => {
  const entries = classifyEntries([snap({ textSha: "B", staged: true })], [branch()], "complete");
  assert.deepEqual(states(entries), [["a.tex", "unsaved"]]);
});

test("a legacy record that differs from its branch is unsaved, one that matches is synced", () => {
  const differs = classifyEntries([snap({ baseSha: null })], [branch()], "complete");
  assert.deepEqual(states(differs), [["a.tex", "unsaved"]]);
  const same = classifyEntries([snap({ baseSha: null, textSha: "B" })], [branch()], "complete");
  assert.deepEqual(states(same), [["a.tex", "synced"]]);
});

test("an edited local-only copy is only in this browser when signed out or the lookup is complete", () => {
  for (const knowledge of ["signed-out", "complete"] as const) {
    assert.deepEqual(states(classifyEntries([snap()], [], knowledge)), [["a.tex", "local-only"]]);
  }
});

test("an edited local-only copy is merely saved when the lookup is unknown", () => {
  assert.deepEqual(states(classifyEntries([snap()], [], "unknown")), [["a.tex", "local-unknown"]]);
});

test("an untouched local-only copy is hidden", () => {
  assert.deepEqual(classifyEntries([snap({ textSha: "B" })], [], "complete"), []);
});

test("a local-only copy with staged uploads is shown even when its text is untouched", () => {
  assert.deepEqual(states(classifyEntries([snap({ textSha: "B", staged: true })], [], "complete")), [
    ["a.tex", "local-only"],
  ]);
});

test("a legacy local-only record always shows", () => {
  const same = snap({ baseSha: null, textSha: "B" });
  assert.deepEqual(states(classifyEntries([same], [], "complete")), [["a.tex", "local-only"]]);
});

test("a record holding nothing is hidden", () => {
  assert.deepEqual(classifyEntries([snap({ textSha: null, baseSha: null })], [], "complete"), []);
});

test("entries sort newest first by the later of local and branch time, undated last, then by path", () => {
  const local = [
    snap({ path: "old.tex", updatedAt: "2026-01-01T00:00:00Z" }),
    snap({ path: "new.tex", updatedAt: "2026-03-01T00:00:00Z" }),
    snap({ path: "b-undated.tex" }),
    snap({ path: "a-undated.tex" }),
  ];
  const remote = [branch({ branch: "x", texPath: "mid.tex", lastEdit: "2026-02-01T00:00:00Z" })];
  assert.deepEqual(
    classifyEntries(local, remote, "complete").map((e) => e.path),
    ["new.tex", "mid.tex", "old.tex", "a-undated.tex", "b-undated.tex"],
  );
});

test("a paired entry sorts by the later of its two times", () => {
  const local = [
    snap({ path: "p.tex", updatedAt: "2026-05-01T00:00:00Z" }),
    snap({ path: "q.tex", updatedAt: "2026-04-01T00:00:00Z" }),
  ];
  const remote = [branch({ texPath: "q.tex", lastEdit: "2026-06-01T00:00:00Z" })];
  assert.deepEqual(
    classifyEntries(local, remote, "complete").map((e) => e.path),
    ["q.tex", "p.tex"],
  );
});

test("two branches on one path: the newest pairs with the local copy, the other is synced alone", () => {
  const older = branch({ branch: "older", lastEdit: "2026-01-01T00:00:00Z", texSha: "OLD" });
  const newer = branch({ branch: "newer", lastEdit: "2026-02-01T00:00:00Z" });
  const entries = classifyEntries([snap()], [older, newer], "complete");
  assert.equal(entries.length, 2);
  const paired = entries.find((e) => e.remote?.branch === "newer");
  const alone = entries.find((e) => e.remote?.branch === "older");
  assert.equal(paired?.state, "unsaved");
  assert.ok(paired?.local);
  assert.equal(alone?.state, "synced");
  assert.equal(alone?.local, undefined);
});

test("decideOpen loads when there is no local text", () => {
  assert.equal(decideOpen(null, "L"), "loaded");
  assert.equal(decideOpen(snap({ textSha: null }), "L"), "loaded");
});

test("decideOpen loads when the local text is what was loaded and nothing is staged", () => {
  assert.equal(decideOpen(snap({ textSha: "L" }), "L"), "loaded");
});

test("decideOpen loads when the local copy was not edited", () => {
  assert.equal(decideOpen(snap({ textSha: "B", baseSha: "B" }), "L"), "loaded");
});

test("decideOpen keeps a local edit made on the loaded text", () => {
  assert.equal(decideOpen(snap({ baseSha: "L" }), "L"), "local");
  assert.equal(decideOpen(snap({ textSha: "L", baseSha: "L", staged: true }), "L"), "local");
});

test("decideOpen asks when the base moved or is unknown", () => {
  assert.equal(decideOpen(snap({ baseSha: "OTHER" }), "L"), "ask");
  assert.equal(decideOpen(snap({ baseSha: null }), "L"), "ask");
  assert.equal(decideOpen(snap({ textSha: "L", baseSha: null, staged: true }), "L"), "ask");
});

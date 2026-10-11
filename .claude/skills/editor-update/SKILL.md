---
name: editor-update
description: Build a feature or fix a bug in the browser scenario builder under web/ — app, shared parsers, compile/PDF preview, GitHub pull-request flow, picker, search, routes — with tests and every test-web.yaml gate. Use for any add, change, fix or debug request there, even when "web/" isn't named. Not for Mission Book .tex scenarios.
---

# Web scenario editor: feature or bugfix

You are the **manager**. You own the outcome: scope, plan, delegation,
integration, verification and the hand-off to the user. Subagents do slices;
you check their work.

Read `web/CLAUDE.md` first if it is not already in context. Its rules bind
you and every subagent.

Leave all changes unstaged and uncommitted in the working tree for the user.

## 1. Understand the request

Restate the change in one or two sentences and name the acceptance
condition: what the user will see or be able to do when it works. For a bug,
name the observed behavior and the expected behavior.

For a bug, get it **red** before fixing it: a regression test that fails on
the bug (see step 4). A fix without a red test is a guess.

## 2. Decide: foggy, single pass or split

Explore just enough to decide. Find the modules involved, the tests that
cover them, and where new code should live.

**Foggy** — stop and hand off to `/mattpocock-skills:wayfinder` — when you
cannot write the acceptance condition from step 1 without guessing, or the
change is too big for one session. Signs: several open product or design
questions ("how should drafts sync with GitHub?"), a new subsystem with no
obvious home, or answers that hang on facts nobody has checked yet.
Splitting does not cure fog: subagents need fixed interfaces, and fog means
you cannot fix them.

Wayfinder only runs when the user types it; you cannot invoke it. So:

1. Tell the user why the request is foggy, naming the open questions you
   found.
2. Suggest they run `/mattpocock-skills:wayfinder` with the request. It
   charts decisions as tickets on the issue tracker and plans only — no code.
3. Stop. Once the map is clear, each buildable piece comes back here as its
   own request.

If the fog is only one or two questions, ask them instead and carry on.

**Single pass** — do it yourself — when most of these hold:

- the change touches roughly five files or fewer, tests included;
- it sits in one concern (one module plus its wiring and tests);
- the design is clear once you have read the code;
- slices would depend on each other so tightly that briefing costs more
  than doing.

Most bugfixes are single pass.

**Split** when the work has independent slices that can proceed in parallel,
each owning its own files — for example a new `web/shared/` parser, a new UI
module that consumes it, and a new integration test suite. The point of
splitting is cheaper tokens and parallel progress. Split only when every
slice owns its files.

Tell the user which path you chose and why, in one line, then proceed.

## 3. Build

- **Single pass:** implement it, write the tests (step 4), then go to
  step 5.
- **Split:** read `references/split.md` and follow it. It covers the map,
  the briefs, launching Sonnet subagents in Herdr panes, and integration.

## 4. Tests

Every change ships with tests, where a test can observe it. Read
`web/tests/README.md` before writing one. Tier 1 (unit, `node:test`) covers
DOM-free logic; tier 2 (Playwright) covers what the user sees.

A bugfix's regression test goes **red** before the fix and green after.
Run it before the fix to prove it is red. A pure CSS or copy change may have
nothing a test can observe; say so rather than writing a hollow test.

## 5. Verify: every CI gate

When the feature is complete, run:

```bash
.claude/skills/editor-update/scripts/verify.sh
```

It runs every gate of `test-web.yaml` plus the repository lint checks, and
reports every failure in one pass. `--fix` applies Biome's safe fixes first.

Done means the script prints `ALL GATES PASSED`. Fix every failure and
rerun until it does. A failure in a test you did not touch still counts —
find out whether your change caused it. Keep every test at full strength; if
a gate cannot pass for a reason outside the change, stop and tell the user
with the decisive output line.

## 6. Hand off

Report briefly: what changed (files), which tests cover it, and that
`verify.sh` passed.

Then offer to serve the app for inspection. If the user accepts:

```bash
web/serve.sh        # run in the background, or in a Herdr pane
```

Wait for the line `Open http://127.0.0.1:8000/web/app/`, then open
`http://127.0.0.1:8000/web/app/` with `xdg-open`. First run fetches the
BusyTeX engine (a few hundred MB) — warn the user. If port 8000 is taken,
pass another port as the first argument and open that one instead.

Tell the user how to stop the server when they are done.

# Split: map, briefs, Herdr panes

The split path of `editor-update`. You stay the manager: you write the map and
the briefs, launch the subagents, and integrate their work.

## Chart the map

Write `map.md` in the session scratchpad directory (from the system prompt;
fall back to `mktemp -d` if none). It holds:

- the goal and acceptance condition from step 1;
- the relevant existing code, as `path:line` pointers with one line each on
  what it does;
- the design decisions you made: new exports and their JSDoc signatures,
  new DOM ids, new routes, data shapes crossing module boundaries;
- the slices, each with an **exclusive file list**. A file belongs to
  exactly one slice. Shared seams (`web/app/app.js` wiring, `web/types/*.d.ts`,
  `web/app/index.html`) usually stay with you — you do them after slices
  land, so no subagent edits them.

Fix the interfaces between slices in the map before any subagent starts.
Subagents work in parallel and cannot negotiate a signature with each other.

## Write one brief per slice

`brief-<slice>.md` next to the map. A subagent starts cold, so the brief
must stand alone:

```markdown
# Brief: <slice name>

Read first: web/CLAUDE.md, web/tests/README.md, <scratchpad>/map.md.

## Task
<what to build or fix, and why it matters to the whole change>

## You own these files (edit only these)
- <path> (new|edit)

## Interfaces
<exact exports/signatures you must provide, and those you may consume
from other slices — they may not exist yet; code against the signature>

## Tests
<which tier, which file, which behaviors to cover>

## Done when
- the type-check and Biome commands in
  .claude/skills/editor-update/scripts/verify.sh pass for your files
  (run Biome from web/ on your files only);
- your own tests pass: node --test <file> / (from web/tests) npx playwright test <file>;
- you wrote a short report to <scratchpad>/report-<slice>.md: files changed,
  decisions not in the brief, anything left undone. Then stop.

Leave changes unstaged and uncommitted. Run only your own test files — the
manager runs the whole Playwright suite.
```

Type-check covers the whole project, so a slice may see errors from another
slice still in progress. Tell subagents to judge only errors in their own
files.

## Launch in Herdr

Check `test "${HERDR_ENV:-}" = 1`. If not in Herdr, fall back to the Agent
tool with `model: "sonnet"`, one agent per brief, same brief text — and tell
the user you fell back.

In Herdr, load the `herdr` skill for CLI details, then for each slice:

```bash
herdr pane layout --pane "$HERDR_PANE_ID"      # pick right vs down
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start web-<slice> --kind claude --pane <pane_id> -- --model sonnet
herdr agent prompt web-<slice> "Read <scratchpad>/brief-<slice>.md and do what it says."
```

Alternate split directions so panes stay usable; three or four subagents
is the practical limit on one tab. Start them all, then wait:

```bash
herdr agent wait web-<slice> --timeout 1800000
```

If an agent reports `blocked`, read it (`herdr agent read web-<slice>
--source recent-unwrapped --lines 80`). It is usually a permission prompt.
Show the user what it asks, and let the user answer it.

## Integrate

When every slice is done:

1. Read each `report-<slice>.md` and review the diff of its files. You are
   accountable for subagent code — read it, don't trust the report.
2. Check with `git status` that each slice changed only its own files.
3. Do the shared seams you kept: wiring in `app.js`, types, HTML.
4. Fix mismatches yourself, or send a follow-up with `herdr agent prompt`
   to the same agent if the fix is large and within its files.
5. Close the panes you created once you no longer need them.

Then check the slices' tests against step 4 of `SKILL.md` and go to step 5.

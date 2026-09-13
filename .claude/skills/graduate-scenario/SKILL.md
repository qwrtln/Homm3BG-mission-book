---
name: graduate-scenario
description: Move a finished scenario out of the Draft Scenarios book (draft-scenarios/) into the real Mission Book (clash/, coops/, campaigns/, or alliances/) — repositions the .tex file, updates both main.tex files, adds the po4a.cfg entry, runs po4a, and updates README.md. Use when the user says "graduate <scenario>" or asks to promote/move a draft scenario into the mission book.
---

# Graduate a draft scenario

Reference commit for the exact mechanics: `67f6f08` ("Graduate Wandering Dragons, The Ambushed Accord, Astral Run"), and simpler ones `e14326b`, `5d1d83e`, `af2bfbe`, `ce45ad7`.

Don't stage any files (no `git add` or `git commit`).

Given a scenario name/slug, do all of this:

## 1. Identify scenario + category
Find the file under `draft-scenarios/{clash,coops,campaigns,alliances}/<slug>.tex`. The category (clash/coops/campaigns/alliances) is whatever dir it's already in — same category in the real book. If slug is ambiguous, ask.

## 2. Move the file
Use `git mv` (preserves history, matches past graduation commits' rename diffs):
```
git mv draft-scenarios/<cat>/<slug>.tex <cat>/<slug>.tex
```
Note: map images are already shared via symlinks in `draft-scenarios/<cat>/` pointing at `assets/maps` — nothing to move there.

## 3. Remove from draft book
In `draft-scenarios/<cat>/main.tex`, delete the `\input{<cat>/<slug>.tex}` line plus its surrounding `\clearpage` blank-line pattern (matches the block being removed, don't leave a double blank line).

## 4. Add to real book — ask where
Ask the user where in `<cat>/main.tex` to insert it (which existing scenario to place it before/after — default suggestion: append at the end). Insert following the existing pattern exactly:
```

\clearpage

\input{<cat>/<slug>.tex}
```

## 5. Sweep drafts/ for leftover references
```
grep -rn "<slug>\|<Scenario Title>" draft-scenarios/ README.md
```
Any hit left in `draft-scenarios/` (or anywhere else, e.g. cross-references in campaign/credits text) must be fixed or removed. There is no other scenario registry to update (`metadata.tex` holds no per-scenario list) — this grep is the safety net.

## 6. po4a.cfg entry
Add a line to `po4a.cfg`, grouped with its category's block (coops block, clash block, etc.), same format as neighboring lines:
```
[type: latex] <cat>/<slug>.tex $lang:<cat>/translated/$lang/<slug>.tex
```

## 7. Run po4a — ask which way
Ask the user: local po4a or containerized (`run.sh`)? **Default to local if they're unsure** — it's simpler and sufficient here.
- Local: `po4a po4a.cfg` (needs po4a installed; see `docs/index.md` for setup)
- Container: `./run.sh po4a po4a.cfg`

Verify afterward: `translations/<slug>.tex/` now has a `.pot` and one `.po` per language, and `<cat>/translated/<lang>/<slug>.tex` files exist for each language.

## 8. Update README.md
Two tables, `#### Draft Scenarios` and `#### Mission Book Scenarios`:
- Remove the scenario's `<tr>` row from the Draft Scenarios table (2-column: English only).
- Add a new `<tr>` row to the Mission Book Scenarios table (10-column: en/pl/cs/fr/de × color/mono), same emoji prefix and player-count format as the removed row, links following the existing `.../en-<slug>-color/<slug>_en.pdf` etc. pattern per language, `-` for any language not yet translated (shouldn't apply once po4a ran, but check ru is not in README's language set — it lists en/pl/cs/fr/de only, ru is a real language file but not in README table, keep it that way for consistency).
- Ask the user where in the table to insert the new row if not obvious (mirror step 4's placement).

## Sanity check at the end
- `git status` — expect: rename in `<cat>/` + `draft-scenarios/<cat>/`, edits to both `main.tex` files, `po4a.cfg`, `README.md`, new files under `translations/<slug>.tex/` and `<cat>/translated/*/<slug>.tex`.
- Offer to build the scenario using either local tooling (tools/build.sh -s <slug>) or the container (./run.sh tools/build.sh -s <slug>)

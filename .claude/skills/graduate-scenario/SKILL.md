---
name: graduate-scenario
description: Graduate a draft scenario — move it from draft-scenarios/ into the Mission Book (clash/, coops/, campaigns/, alliances/). Use when the user says "graduate <scenario>" or asks to promote a draft scenario into the mission book.
---

# Graduate a draft scenario

Reference graduation: commit `accc072` ("Graduate arcane artillery"). Mirror its diff shape.

Leave changes unstaged for the user to commit. The one exception is the rename that `git mv` stages in step 2.

Throughout, copy the **neighbor** line: every file you edit already holds entries in the exact format you need. Duplicate the nearest one and swap in the slug or title rather than writing a line from memory.

## 1. Identify the scenario and ask up front

Find `draft-scenarios/<cat>/<slug>.tex`, where `<cat>` is one of clash, coops, campaigns, alliances. The category stays the same in the Mission Book. Read the title from the file's `\addscenariosection{..}{..}{<Title>}{..}` line.

Then ask both questions in one `AskUserQuestion` call, so the rest runs uninterrupted:

- **Placement:** which scenario in `<cat>/main.tex` to insert it after (default: last). The README row uses the same placement.
- **po4a:** local `po4a po4a.cfg` (default) or container `./run.sh po4a po4a.cfg`.

If the slug matches more than one file, resolve that in the same call.

## 2. Move the file

```
git mv draft-scenarios/<cat>/<slug>.tex <cat>/<slug>.tex
```

Map images live in the shared `assets/` (`draft-scenarios/assets` is a symlink), so the `.tex` file is the only thing to move.

## 3. Update both main.tex files

- `draft-scenarios/<cat>/main.tex`: remove the scenario's `\input{...}` line and one adjacent `\clearpage` with its blank line. Done when the file shows no double `\clearpage` and no double blank line.
- `<cat>/main.tex`: insert at the chosen placement a `\clearpage` + `\input{...}` block that copies its neighbor, including the path macro (`\clashpath`, `\coopspath`, ...).

## 4. Add the po4a.cfg entry

Add one line inside the category's block of `po4a.cfg`, in the same order as `<cat>/main.tex`, copying its neighbor.

## 5. Run po4a

Run the command chosen in step 1 (local setup: `docs/index.md`). Done when these exist:

- `translations/<slug>.tex/<slug>.tex.pot` and one `.po` per language in `po4a.cfg`'s `[po4a_langs]`.
- `<cat>/translated/<lang>/<slug>.tex` for each of those languages.

po4a also rewrites `.pot`/`.po` files of other scenarios. That churn is normal; keep it.

## 6. Update README.md

- Delete the scenario's `<tr>` row from the `#### Draft Scenarios` table.
- Add a row to the `#### Mission Book Scenarios` table at the chosen placement. Copy a neighbor row, swap slug and title in every link, and keep the removed row's emoji prefix and player count. The table covers en/pl/cs/fr/de only; ru stays out.

## 7. Verify

- `grep -rn "<slug>\|<Title>" draft-scenarios/ README.md sections/` — done when every hit is a Mission Book reference. Fix or remove any leftover draft reference (credits, cross-links, campaign text). No other scenario registry exists.
- `git status` — expect exactly: the staged rename, both `main.tex` files, `po4a.cfg`, `README.md`, new `translations/<slug>.tex/` and `<cat>/translated/*/<slug>.tex`, plus po4a churn in `translations/`. Report anything else.
- Offer to build: `tools/build.sh -s <slug>` locally, or `./run.sh tools/build.sh -s <slug>` in the container.

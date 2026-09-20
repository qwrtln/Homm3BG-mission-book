# Homm3BG Mission Book

Two projects share this repository. They share no tooling, no language and no
build. Work on one at a time.

1. **The Mission Book** — a fan-made LaTeX book of scenarios for *Heroes of
   Might & Magic III: The Board Game*, built at the repository root. This file
   covers it.
2. **The scenario builder** — a browser app under `web/` that lets a
   contributor write a scenario, compile it in-browser and open a pull request
   without a local LaTeX toolchain. See `web/CLAUDE.md`; nothing below applies
   to it except the repository-wide lint rules.

## The book

Community-driven, styled after "The Rewritten Rule Book", assembled from
community-submitted scenarios.

### Vocabulary

- **Mission Book** — the finished, community-vetted, playtested document
  (`main_<lang>.tex`, assembled from `structure.tex`).
- **Draft Scenarios** — the companion booklet (`draft-scenarios/`), where a
  scenario incubates before it graduates into the Mission Book. Use the
  `graduate-scenario` skill to promote one; it moves the file, updates both
  `structure.tex` files, adds the `po4a.cfg` entry and runs po4a.
- **Scenario categories** — three top-level modes, each a directory and a book
  section:
  - **Clash** (`clash/`) — competitive, player-vs-player.
  - **Cooperative** / **Coop** (`coops/`) — players against the scenario.
  - **Campaign** (`campaigns/`) — linked multi-scenario stories, grouped into
    Castle-named subsections (e.g. "The Queen's Gambit").
  `draft-scenarios/` mirrors these and adds `alliances/`.
- **Random Scenario** (`sections/random_scenario.tex`) — guidelines for
  generating an ad-hoc scenario instead of playing a fixed one. Every type it
  generates (Free-for-All, Grail, King of the Hill) is Clash-style; it has no
  Coop or Campaign equivalent.
- **Recommendations** (`sections/recommendations.tex`) — custom rules and best
  practices for *fair competitive play*: Magic Arrows, Guaranteed Settlement,
  Round One Mulligan, Tier V–VII Combat difficulty, Trading Post, Victory
  Points, Combat with Neutral Units.

### Structure

`structure.tex` fixes the assembly order: title page → intro/ToC → What to Play
→ Coop → Clash → Random Scenario → Campaign → Recommendations → Credits → back
cover. Each category's `main.tex` `\input`s its scenarios in book order, so a
new scenario is two edits: the file, and its category's `main.tex`.

A scenario file opens with `\addscenariosection{...}` and carries an Author, a
Source link, an italic flavor-text blurb, and Player Setup (including Player
Count). That header block is the source for a scenario's "hook" elsewhere in
the book — do not invent a second one.

Icons come from `\svg{<name>}`, resolved against `assets/glyphs*` and
precompiled into `svg-inkscape/`.

### Building

Never run LaTeX directly. `./run.sh` mounts the repository into
`ghcr.io/qwrtln/homm3bg:latest` (podman, else docker) — the same image CI uses,
built from `tools/container/Containerfile` — and runs a script inside it:

```sh
./run.sh tools/build.sh                     # English Mission Book
./run.sh tools/build.sh pl                  # a translation
./run.sh tools/build.sh -d                  # the Draft Scenarios booklet
./run.sh tools/build.sh -s "bloody grail"   # one scenario, by fuzzy search
./run.sh tools/compare_pages.sh -l en -r 5-9
```

`latexmkrc` turns `HOMM3_*` environment variables into LaTeX toggles
(`printable`, `noartbackground`, `githubbuild`, `individualscenario`); the
build flags set them. Build artifacts (`*.aux`, `*.fls`, `*.pdf`, …) litter the
repository root and are ignored — do not commit them, and do not mistake them
for sources.

### Translations

English is the only source. `po4a.cfg` maps each `.tex` file to
`translations/<file>.tex/<lang>.po`, and po4a generates
`<dir>/translated/<lang>/`. Languages: pl, fr, cs, de, ru.

- Never hand-edit a file under a `translated/` directory. It is generated.
- Adding a `.tex` file to the book means adding its `po4a.cfg` entry too;
  `check-po4a-entries.yaml` fails the pull request otherwise.

## Repository-wide lint rules

`.github/workflows/lint-files.yaml` runs on every pull request and fails on:

- A tab character in any tracked file. Indent with spaces.
- A file that does not end with a newline.
- Trailing whitespace on any line.
- In `.tex` files, an uncapitalized book term: Card, Cube, Deck, Faction,
  Field, Grail, Hero, Level, Round, Scenario, Tile, Unit. Append
  `% no-check-caps` to exempt a line.

`.editorconfig` sets 2-space indent everywhere, 4 for `*.py`.

## Skills

- `graduate-scenario` — promote a draft into the Mission Book.
- `review-scenario` — review a draft `.tex` for language, terminology and
  rules-section structure.

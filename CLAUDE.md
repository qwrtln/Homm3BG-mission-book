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

### Vocabulary

- **Mission Book** — the finished, community-vetted, playtested document
  (`main_<lang>.tex`, assembled from `structure.tex`).
- **Draft Scenarios** — the companion booklet (`draft-scenarios/`), where a
  scenario incubates before it graduates into the Mission Book. Use the
  `graduate-scenario` skill to promote one.
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
- **Recommendations** (@sections/recommendations.tex) — custom rules for *fair
  competitive play*. That file lists them; do not restate them here.

### Structure

`structure.tex` fixes the assembly order: title page → intro/ToC → What to Play
→ Coop → Clash → Random Scenario → Campaign → Recommendations → Credits → back
cover. Each category's `main.tex` `\input`s its scenarios in book order. For
adding a scenario (templates, registration, campaign `[subsection]` quirk) see
`docs/scenarios.md`.

A scenario file opens with `\addscenariosection{...}` and carries an Author, a
Source link, an italic flavor-text blurb, and Player Setup (including Player
Count). That header block is the source for a scenario's "hook" elsewhere in
the book — do not invent a second one.

Icons come from `\svg{<name>}`, resolved against `assets/glyphs*` and
precompiled into `svg-inkscape/`.

### Building

Never run LaTeX directly. Run every `tools/` script through the container
wrapper: `./run.sh tools/build.sh [args]` (see `docs/container.md`). Script
flags and examples are in `docs/scripts.md`.

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

- Whitespace @.editorconfig already fixes: a tab character, a missing final
  newline, trailing whitespace. Applies to every tracked file.
- In `.tex` files, an uncapitalized book term: Card, Cube, Deck, Faction,
  Field, Grail, Hero, Level, Round, Scenario, Tile, Unit. Append
  `% no-check-caps` to exempt a line.

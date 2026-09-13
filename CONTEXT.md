# Project Context

Fan-made LaTeX mission book for Heroes of Might & Magic III: The Board Game.
Community-driven, styled after "The Rewritten Rule Book", compiled from community-submitted scenarios.

## Vocabulary

- **Mission Book** — the finished, community-vetted, well-playtested document (`main_*.tex`, built from `structure.tex`).
- **Draft Scenarios** — companion booklet (`draft-scenarios/`), the incubation phase before a scenario graduates into the Mission Book. See the `graduate-scenario` skill.
- **Scenario categories** — three top-level modes, each its own directory and book section:
  - **Clash** (`clash/`) — competitive, player-vs-player.
  - **Cooperative** / **Coop** (`coops/`) — players vs the scenario.
  - **Campaign** (`campaigns/`) — linked multi-scenario stories, grouped by Castle-name subsections (e.g. "The Queen's Gambit").
- **Random Scenario** — a standalone book section (`sections/random_scenario.tex`) with guidelines for generating an ad-hoc scenario instead of playing a fixed one. Its generated types (Free-for-All, Grail, King of the Hill) are all Clash-style — it has no Coop or Campaign equivalent.
- **Recommendations** (`sections/recommendations.tex`) — custom rules and best practices for *fair competitive play* (Magic Arrows, Guaranteed Settlement, Round One Mulligan, Tier V–VII Combat difficulty, Trading Post, Victory Points, Combat with Neutral Units).

## Structure

Book assembly order lives in `structure.tex`. Current order: title page → intro/ToC → Introduction → Coop → Clash → Random Scenario → Campaign → Recommendations → Credits → back cover.

Each scenario file uses `\addscenariosection{...}` and carries: Author, Source, an italic flavor-text blurb, and Player Setup (incl. Player Count) — this is the existing source for writing a scenario's "hook" line elsewhere in the book.

Translations (`sections/translated/<lang>/`, `po4a.cfg`) are generated via po4a from the English source.

## Container

`tools/container/Containerfile` builds `ghcr.io/qwrtln/homm3bg:latest`, the one image used both in CI and for local dev. It bundles everything needed to build and compare PDFs, so nothing extra needs installing on your machine.

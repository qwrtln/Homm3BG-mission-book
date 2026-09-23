---
name: review-scenario
description: Review a draft scenario .tex file for grammar/language issues, terminology consistency with the rest of the book, and structure of its rules sections. Use for PRs with new scenario contributions to the project.
---

# Review a scenario

Report the findings as `file:line — problem — fix`. Group them by the sections below. After the report, offer to post the findings as PR review comments with `gh`.

## Mode

Post every finding as a PR review comment with the `gh` binary. Never fix the file for the author. Local edits have one purpose. They render a colored diff for the user.

Before any local edit, check out the branch of the PR, or fetch its head commit. The local file must match the content of the PR. An edit to an unrelated local copy renders a meaningless diff.

Walk through the findings one at a time. Put each finding in one message, in this order:

1. Words for the user, not for the PR. Write one or two sentences. Most findings need nothing here, so skip this part.
2. The complete GitHub comment body, as one blockquote. Put the prose and the suggestion block together. If the change deletes or moves lines, write one or two sentences above the suggestion block that say why. The reviewer cannot judge the change without them. If you name another scenario as precedent, quote that scenario here.
3. An Edit against the real file, last, because the diff then renders in color. Never edit a copy in the scratchpad directory, because such an edit renders no diff.

Build the blockquote like this. Prefix every line with `> `. Write a blank line inside the body as `>` alone. Quote the ` ```suggestion ` fence too, so the line reads `> ```suggestion `. Start the blockquote with a `> **Comment body:**` line.

The blockquote separates the two readers. Every word for the user stays outside it. Every word for the PR stays inside it. The text inside is the comment. Never hold back a second version of the prose for post time.

An approved Edit is a yes. Post the comment at once, then move to the next finding. Never ask "yes or no" after an approved Edit, because the approval already answered it. If the user rejects the Edit, skip the finding. If the user asks for a different fix, show that fix instead. Never put text after the Edit call, because a rejection discards everything in that message.

The posted `body` is the blockquote text from step 2, character for character. Strip the `> ` prefixes and the `**Comment body:**` line. Escape the rest for JSON and change nothing else. Any added, dropped, or reworded sentence is a defect. This rule covers better wording too. To use better wording, show the comment again and get a new approval.

After the last finding, offer to revert every local edit (`git checkout -- <file>`). Do not commit and do not push.

Post with:

```sh
gh pr view <n> --json headRefOid -q .headRefOid   # commit_id
gh api repos/<owner>/<repo>/pulls/<n>/comments --input <json>
```

JSON body fields: `commit_id`, `path`, `line`, `side: RIGHT`, `body`.

## 1. Language and grammar

Read the new and changed `.tex` prose, both the flavor text and the rule text. Look for these problems:

- Run-on sentences, missing punctuation, and subject-verb mismatches.
- Awkward phrasing that a native reader does not write.
- Flavor text that does not match the tone of the other scenarios. The other scenarios are short, vivid, and in the third person. Flag a scenario that reads as a short story next to the one-liner of everyone else.
- Straight quotes (`"..."`) or Unicode smart quotes in dialogue. The book uses LaTeX typographic quotes (` ``...'' ` and `` `...' ``).
- Several sentences on one line. One sentence per line is deliberate, because it makes the file easier to diff and to translate. Split the line.
- "Defeat" used with a fight or a combat as its object. "Defeat" needs a concrete opponent, such as an army or a hero, not the fight itself. Write "win the combat" or "defeat the Neutral Army", not "defeat the combat".

## 2. Terminology consistency

Before you decide that a term needs a capital letter or a specific phrasing, grep the rest of the book: `clash/`, `coops/`, `campaigns/`, `alliances/`, and the other `draft-scenarios/`. Match the dominant convention.

A scenario can define its own named term, as long as the file defines it once. Do not treat that term as book-wide until grep shows other scenarios that use it too.

Before you reword a rule, make sure that no other scenario states the equivalent rule better. Reuse the better phrasing.

Do not invent a flavor name for a game element that has no official name. The rulebook sometimes defines only a generic term, for example "Faction-specific building". Use that term or its glyph. Do not write a made-up name such as "Camp" or "Workshop".

Make sure that the title in `\addscenariosection` matches the intended name of the scenario and the file name.

## 3. Rule structure

Order the additional-rules `\subsection*` blocks:

1. Core additional rules (first).
2. Field rewards (further down).
3. Map constraints (near the map layout, last).

Keep Victory Conditions and Defeat Conditions as separate subsections. Do not merge the win conditions and the lose conditions into one block.

Do not mix unrelated rule types in one subsection. If the scenario has several distinct mechanics, such as spawn logic, combat exceptions, and a boss mechanic, give each one its own named `\subsection*`. Do not write one large Additional Rules dump.

A caveat about the mode or the player count, such as Alliance-only or FFA-only, needs no subsection of its own. Put it in italics inside the rule that it modifies.

## 4. Rules precision

- Never conflate Round and Turn. A Round is the shared game clock. A Turn is the own turn of one player inside a Round. "At the start of the Round" and "at the start of each player's Turn" are different rules. Make sure that the text uses the one it means.
- Flag vague wording before it ships. Look for a pronoun with no clear referent, such as "these pieces" or "covered ones". Look for a new term the file never explains. Look for a rule the reader must ask about to understand. Propose a concrete restatement that stands on its own.
- Flag a term used before the rule that defines it. Add a pointer such as "(explained below)" at the first use, as Wandering Dragons does for dragon movement.
- Flag a reward or effect that assumes rules knowledge the text never states. For example, "gain a Level" hides the real amount. Write the change to the game state in full, such as "gain 1 \svg{experience}".

## 5. Typography, tables, and map images

- Use a hard space (`~`) between a number and the glyph or unit that follows it, such as `+1~\svg{movement}`. A plain space lets LaTeX break the line between the two.
- Write a Player Count range with a spaced en-dash, such as `2 -- 4`, not with a hyphen, such as `2-4`.
- Order a table by the axis that has an order. A Round number has one. A variant label, such as Solo, 1v1, or 2v2, has none. Put the ordered axis in the rows.
- Use the canonical glyph for a concept. Look in the asset library first. If the glyph you need is missing, ask the user. Do not improvise a substitute.
- The difficulty table must list every tier, including a tier that changes nothing, for example "Normal: no changes". A missing tier reads as ambiguous.
- Text drawn into a map image, for example a letter that labels a Tile, cannot be translated. Add the labels with a `tikzpicture` overlay instead.

## Output

List the findings as `file:line — problem — suggested fix`, in the order of sections 1 to 5. Skip formatting nits that do not change the meaning. Collect the typography hits of section 5 into one comment that lists every line, instead of one comment per line. If you compare the finding to the pattern of another scenario, name that scenario and quote the line. Every fix must be copy-pasteable.

## Cross-references to other scenarios

Wherever you write the `file:line` of another scenario, write it as a Markdown link instead. Change nothing else: no extra sentence, no "for reference" text.

`coops/titans_stronghold.tex:45` becomes:

```
[coops/titans_stronghold.tex:45](https://github.com/qwrtln/Homm3BG-mission-book/blob/main/coops/titans_stronghold.tex#L45)
```

The branch is `main`. A line range is `#L45-L52`. This rule applies to the report and to the PR comment body.

---
name: review-scenario
description: Review a draft scenario .tex file for grammar/language issues, terminology consistency with the rest of the book, and structure of its rules sections. Use for PRs with new scenario contributions to the project.
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: >-
            jq -e '(.tool_input.file_path // "") | endswith(".tex")' >/dev/null &&
            echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"review-scenario: approve the fix; posting the comment is asked separately"}}'
            || true
---

# Review a scenario

Report the findings in the format under Output. After the report, offer to post them as PR review comments (see Mode).

## Mode

Post each finding as a PR review comment with `gh`, one at a time. The author fixes their own file. A local edit exists only to render a colored diff for the user.

Before the first edit, check out the PR branch, or fetch its head commit, so the local file matches the PR. A diff against any other copy means nothing.

The `hooks` block in the frontmatter forces a permission prompt on every `.tex` Edit, even in auto mode. That prompt approves the fix only. The comment body gets its own approval in step 2.

Walk the findings one at a time. Each finding takes three steps:

1. **Fix.** Optionally write one or two sentences for the user. Then Edit the real file in the PR checkout, so the diff renders in color; a scratchpad copy renders no diff. End the message with the Edit call, because a rejection discards any text after it. If the user rejects the Edit:
   - "Next", or a reason to drop the finding: skip to the next finding.
   - A different fix: make a new Edit with that fix.
2. **Body.** Call `AskUserQuestion`. The dialog hides message text, so the body lives in the option `preview` fields:
   - "With comment body": the full body, the prose and then the suggestion block.
   - "Suggestion only": the suggestion block alone.
   - "Skip": post nothing.

   Write the prose like this. When the change deletes or moves lines, say why in one or two sentences above the suggestion block; the reader cannot judge the change without them. When you name another scenario as precedent, quote its line.

   If the user answers with notes instead of an option, for example new wording, build the new body and ask again with it in a new preview.
3. **Post.** Post the chosen preview text as `body`, character for character, escaped for JSON. Any added, dropped, or reworded word is a defect, better wording and typo fixes included; send those back through step 2 as a new preview. The step is done when `gh api` returns the comment's `html_url`.

   ```sh
   gh pr view <n> --json headRefOid -q .headRefOid   # commit_id
   gh api repos/<owner>/<repo>/pulls/<n>/comments --input <json>
   ```

   JSON fields: `commit_id`, `path`, `line`, `side: RIGHT`, `body`. For a suggestion that spans several lines, also set `start_line` and `start_side: RIGHT`.

After the last finding, offer to revert every local edit with `git checkout -- <file>`. Leave commits and pushes to the author.

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

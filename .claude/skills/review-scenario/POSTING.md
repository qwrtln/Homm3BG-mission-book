# Posting findings to the PR

Findings reach the author only as PR review comments, posted with `gh`. Local edits have one purpose: they render a colored diff for the user. Do not commit and do not push.

The local file must match the PR head (step 1 of the skill). Edit that checked-out file itself. Only an edit to the real file renders a diff.

## One finding per message

Walk through the findings one at a time. Put each finding in one message, in this order:

1. Words for the user, not for the PR: one or two sentences. Most findings need none, so skip this part.
2. The complete GitHub comment body, as one blockquote. Put the prose and the suggestion block together. If the change deletes or moves lines, write one or two sentences above the suggestion block that say why; the reviewer cannot judge the change without them. If you name another scenario as precedent, quote its line here.
3. An Edit against the real file. End the message with this Edit call: a rejection discards the whole message, so any text after the call is lost.

Build the blockquote like this:

- Start it with a `> **Comment body:**` line.
- Prefix every line with `> `. Write a blank line inside the body as `>` alone.
- Quote the suggestion fence too, so the line reads `> ```suggestion `.

The blockquote separates the two readers. Words for the user stay outside it; words for the PR stay inside it. The blockquote is the final comment text.

## Approval

- Edit approved: that is the yes. Post the comment at once, then show the next finding.
- Edit rejected: skip the finding.
- User asks for a different fix: show the new finding (blockquote and Edit) and wait for a new approval.

The posted `body` is the step 2 blockquote, character for character. Strip the `> ` prefixes and the `**Comment body:**` line, escape the rest for JSON, and change nothing else. Any added, dropped or reworded sentence is a defect, better wording included. To change the wording, show the comment again and get a new approval.

## Command

```sh
gh pr view <n> --json headRefOid -q .headRefOid   # commit_id
gh api repos/<owner>/<repo>/pulls/<n>/comments --input <json>
```

JSON body fields: `commit_id`, `path`, `line`, `side: RIGHT`, `body`.

## Finish

After the last finding, offer to revert every local edit (`git checkout -- <file>`).

# web/shared/ — DOM-free logic

## What deploys

`web/shared/*.ts` is bundled into the app by `npm run build`, so a new module
the app imports needs no deploy allow-list entry. The run-time files that do
(`texmf/carried-texmf.bin`, `vendor/texlyre-busytex.js`) are listed in
"Out-of-bundle runtime assets" in `web/CLAUDE.md`.

`carry-texmf.ts` and `fetch-missing-texmf.sh` are hand-run tools that neither
the app nor the site loads; `carry-texmf.ts` imports its pure logic from
`texmf-carry.ts`, which the app also imports.

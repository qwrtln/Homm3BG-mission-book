# web/shared/ — DOM-free logic

## What deploys

`web/shared/*.ts` is bundled into the app by `npm run build`, so it does not
deploy as separate files. The deploy allow-list in
`.github/workflows/publish-docs.yaml` copies only the files the browser fetches
at run time, by URL:

- `shared/texmf/carried-texmf.bin`
- `shared/vendor/texlyre-busytex.js` and its `LICENSE`

A new module the app imports needs no allow-list entry. Extension no longer
marks a local tool apart from importable logic — both are `.ts` now, run by
Node on its native type stripping. `carry-texmf.ts` and
`fetch-missing-texmf.sh` are hand-run tools that neither the app nor the site
loads; `carry-texmf.ts` imports its pure logic from `texmf-carry.ts`, which the
app also imports. To ship a new kind of runtime file, add it to the
allow-list.

## github-contrib.ts

`app/github/` imports `github-contrib.ts` by its `.ts` specifier, so
`tsc` resolves its exports directly. There is no cache-buster and no
hand-written `declare module`: the build hashes the bundle's file name.

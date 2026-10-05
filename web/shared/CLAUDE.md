# web/shared/ — DOM-free logic

## What deploys

`web/shared/*.js` is bundled into the app by `npm run build`, so it does not
deploy as separate files. The deploy allow-list in
`.github/workflows/publish-docs.yaml` copies only the files the browser fetches
at run time, by URL:

- `shared/texmf/carried-texmf.bin`
- `shared/vendor/texlyre-busytex.js` and its `LICENSE`

A new module the app imports needs no allow-list entry. The `.mjs` extension
still marks a local tool (`carry-texmf.mjs`, `fetch-missing-texmf.sh`) that
neither the app nor the site loads. To ship a new kind of runtime file, add it
to the allow-list.

## github-contrib.js

`app/modules/github.js` imports `github-contrib.js` by its plain path, so `tsc`
resolves its exports directly. There is no cache-buster and no hand-written
`declare module`: the build hashes the bundle's file name.

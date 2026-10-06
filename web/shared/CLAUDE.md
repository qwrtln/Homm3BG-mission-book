# web/shared/ — DOM-free logic

## What deploys

The deploy allow-list in `.github/workflows/publish-docs.yaml` copies only:

- `shared/*.js`, top level only
- `shared/texmf/carried-texmf.bin`
- `shared/vendor/texlyre-busytex.js` and its `LICENSE`

So a module the browser imports is a `.js` file directly in `shared/`. A
subdirectory, or an `.mjs` extension, keeps a file out of the site: that is how
`carry-texmf.mjs` and `fetch-missing-texmf.sh` stay local tools. To ship a new
kind of file, add it to the allow-list.

## github-contrib.js and its cache-buster

`app/modules/github.js` imports `github-contrib.js?v=N`. `tsc` cannot resolve
that specifier, so `web/types/module-queries.d.ts` re-declares every export by
hand under `declare module "*/github-contrib.js?v=N"`.

- A new export here needs a line in `module-queries.d.ts`, or it imports as
  `any`. `tests/unit/module-queries.test.mjs` catches a missing one.
- Bump `N` in `github.js` and in the `declare module` pattern together.

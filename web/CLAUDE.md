# web/ — the scenario builder

Browser app: write a Mission Book scenario in LaTeX, compile it to PDF in the
browser (BusyTeX/WASM), open a pull request. No local LaTeX toolchain.

Static and unbuilt. `web/index.html` redirects to `web/app/index.html`, which
loads `web/app/app.js` as an ES module. No bundler, transpiler or framework.

## No dependencies in the application

No `package.json`, no lockfile, no build step — `web/app/` must open off a
static server with nothing installed. Never add one. The only exception is
`web/tests/package.json` (Playwright only); never let it reach application code.

## Layout

| Path | Holds |
| --- | --- |
| `web/shared/` | DOM-free logic, importable by Node, testable in tier 1 |
| `web/app/modules/` | App concerns, wired by `app.js`; DOM allowed |
| `web/types/` | Ambient `.d.ts` shared across the app |
| `web/core/`, `web/*/vendor/` | Vendored. Do not edit. |
| `oauth-relay/` (repo root) | Cloudflare Pages function for GitHub OAuth |

- Logic that does not need the DOM goes in `web/shared/`.
- Touch the DOM only inside a function body, never at import time — tier 1
  imports these modules in Node.

## Module wiring

`web/app/app.js` is the only wiring point. A module exports `init<Name>()`;
nothing self-registers. Order is load-bearing:

1. `initTheme()` before `applyTheme(initialTheme())`.
2. Synchronous: editor, search, picker, uploads, build.
3. `initGithub()` and `loadEntries()` return promises. Anything needing both
   waits on `Promise.allSettled([githubReady, entriesReady])` — see `openRoute`.
4. `ensureEngine()` and `preloadCommonFiles()` fire eagerly, rejections
   swallowed on purpose. Errors surface later at the call site.

## Types at boundaries

JSDoc only, checked by `tsc` against `web/jsconfig.json` (`checkJs`, `strict`,
no `@types/node` — browser code). From the repository root, as CI runs it:

```sh
npx -y -p typescript@5.9.2 tsc --noEmit --project web/jsconfig.json
```

- Every exported function in `web/shared/` and `web/app/modules/` carries
  `@param {...}` and `@returns {...}`.
- Declare an injected dependency with `@typedef`, naming every method the
  injection site calls. Never accept an unnamed object.
- Validate external payloads (GitHub responses, parsed `.tex`) at entry. No
  unchecked shape reaches `web/app/modules/`.

## Running locally

@web/serve.sh — its header comment holds the URL, the prerequisites and the
usage.

The deploy copies `web/` through an allow-list in
`.github/workflows/publish-docs.yaml`, so tooling like this script stays out of
the site without an exclude. Anything the browser must load goes on that list.

## Lint and format

Biome, pinned, no install. Config is `web/biome.json`, so run from `web/`:

```sh
npx -y @biomejs/biome@2.5.14 check .          # lint + format check
npx -y @biomejs/biome@2.5.14 check --write .  # apply safe fixes
```

- Running from the repository root fails: Biome 2.x treats the invocation
  directory as an implicit root and refuses a nested config. CI uses
  `working-directory: web`.
- Formatting settings live in @web/biome.json. Indent style is explicit there —
  Biome defaults to tabs, which the root lint rules reject.
- Two recommended rules are off, both firing on correct code here:
  `suspicious/noAssignInExpressions` (the `while ((m = re.exec(s)))` loop in
  `shared/build-plan.js`) and `suspicious/useIterableCallbackReturn` (concise
  arrow bodies in `forEach`).
- CSS and HTML are out of scope deliberately.

## Tests

Two tiers. Read `web/tests/README.md` before writing a test — it holds the
conventions (file naming, `.mjs`, imports, fixtures, stubs, first-run setup).

```sh
node --test "web/tests/unit/**/*.test.mjs"   # tier 1, from the repository root
cd web/tests && npx playwright test          # tier 2
```

- Keep tier 1's quotes and glob: the directory form fails on Node 22 and 24.
  Never gate tier 1 behind tier 2.
- Never load the LaTeX engine; `web/tests/stubs/` stubs it.
- **Install the stubs before `page.goto`, never after** — navigate first and the
  real wrapper is already in flight.

CI is `.github/workflows/test-web.yaml`, on pull requests touching `web/**`:
type-check, lint and format, tier 1, tier 2.

## Vendored versions

`web/vendor.env` is the single source for every vendored or fetched version —
never hardcode one elsewhere. Not a manifest; nothing installs from it.
`.github/workflows/publish-docs.yaml` reads it into `$GITHUB_ENV`, so every line
stays `KEY=value` with no comments.

## Editor library — CodeMirror 5, not 6

`web/app/vendor/codemirror/` is CodeMirror 5 (`CODEMIRROR_VERSION`), loaded by
`web/app/index.html` as classic `<script>` tags defining a global `CodeMirror`.
LaTeX mode: `mode/stex/stex.min.js`.

- Use the CM5 API: `CodeMirror(element, options)`, `cm.getValue()`,
  `cm.setValue()`, `cm.on("change", ...)`, `cm.setOption()`.
- Never import `@codemirror/state`, `@codemirror/view`, `EditorState` or
  `EditorView`. That is CodeMirror 6 — not vendored, uninstallable here.
- Docs: https://codemirror.net/5/doc/manual.html
- Re-vendor from https://cdnjs.com/libraries/codemirror/

## LaTeX engine (BusyTeX) — do not test, do not touch

- Release `assets-v<BUSYTEX_ENGINE_VERSION>` of `TeXlyre/texlyre-busytex`.
- WASM build in `web/core/busytex/`, wrapper in
  `web/shared/vendor/texlyre-busytex.js`. Both vendored and trusted.
- `web/core/` is gitignored, fetched at deploy time — a fresh clone has no
  engine.
- No upstream documentation exists. Do not infer the API: read
  `texlyre-busytex.d.ts` for the allowed surface, then the wrapper for behavior.
  `BusytexPipeline` takes eleven positional arguments; never call it from
  application code.
- `web/app/modules/build.js` is the only module importing the wrapper.
  Everything else goes through `ensureEngine()`.
- `web/app/app.js` calls `ensureEngine()` eagerly on page load, so every
  browser-driven test is affected.
- No test compiles a real PDF or downloads `texlive-*.data`. Stub it.

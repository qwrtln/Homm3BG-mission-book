# web/ — the scenario builder

Browser app: write a Mission Book scenario in LaTeX, compile it to PDF in the
browser (BusyTeX/WASM), open a pull request. No local LaTeX toolchain.

Built with Vite. `web/index.html` redirects to `web/app/index.html`, which
loads `web/app/main.tsx` as an ES module; `npm run build` bundles it into
`web/dist/`. The UI is React (one root, `App.tsx`), the shared state is Zustand
and the styling is Tailwind; see `web/app/CLAUDE.md`. All source is TypeScript.

## Dependencies and build

One manifest, `web/package.json`, with its lockfile, holds everything: the
app's libraries (`pdfjs-dist`, `client-zip`), the tools (Vite, TypeScript,
Biome) and the tests (Playwright). Node is pinned in `web/.nvmrc` (`engines.node`
matches). Run `npm ci` in `web/` once; `npx -y` is gone.

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server at `/web/app/` |
| `npm run build` | writes `web/dist/`, which the deploy copies to `site/builder/` |
| `npm run preview` | serves `web/dist/` |
| `npm run typecheck` | `tsc` over `tsconfig.json`, `tsconfig.node.json`, then `tests/tsconfig.json` |
| `npm run lint` | Biome `check .` |
| `npm run test:unit` | tier 1 |
| `npm run test:e2e` | tier 2, against the build |

- Add a browser library with `npm install`, import it, and let the bundler
  place it. Lazy `import()` keeps a rarely used one (pdf.js, client-zip) out of
  the first load. Do not vendor it by hand.
- `web/vite.config.ts` has four plugins, `react` and `tailwindcss` plus two of its own: `out-of-bundle-assets` (dev only,
  serves the paths below from disk) and `license-notices` (writes
  `dist/licenses.json`, the name, version and license text of every npm package
  in the bundle; the About dialog lists them). A new bundled dependency needs no
  license edit.
- `vite.config.ts` is checked by `tsconfig.node.json`, with `@types/node`. That
  stays out of `tsconfig.json`: Node's types would leak into browser code
  (`setTimeout` would return `Timeout`). The other Node-only tools —
  `glyph-usage.ts` at the top level and `shared/carry-texmf.ts` — are checked
  by `tsconfig.node.json` too, for the same reason: importing `node:fs` or
  `node:process` anywhere in `tsconfig.json`'s program would pull Node's
  global augmentations into every browser module in it.
- No hashed-name bookkeeping: file names carry content hashes, so there is no
  `?v=N` cache-buster. Never add one.

**Why we moved.** The app used to have no manifest and no build, so it opened
off a static server with nothing installed. Only the maintainer and CI run it
locally, so zero install is no longer valued, and the rule had costs: each
library needed a hand-written fetch, a SHA pin, a type shim and a license row;
no styling or UI library could be adopted. Do not restore the old rule. The
plan is in `context/changes/web-framework-migration/` (`frame.md`, `plan.md`).

## Out-of-bundle runtime assets

Four things stay out of the bundle, at the `../` URLs relative to the page,
because the engine's worker resolves paths itself and the files are large:

| URL (from the page) | Deployed at | Why it stays out |
| --- | --- | --- |
| `../core/busytex/` | site root `core/` | WASM engine and data package, fetched at deploy time; the worker takes an absolute URL |
| `../shared/vendor/texlyre-busytex.js` | site root | the engine wrapper, loaded by `import(/* @vite-ignore */ url)` in `modules/build.ts`; the tier 2 stub matches the path suffix `/shared/vendor/texlyre-busytex.js` |
| `../shared/texmf/carried-texmf.bin` | site root | the carried TeX Live bundle |
| `../repo/` | site root `repo/` | the book's own sources, copied at deploy time |

- `busytexBase()` must stay an absolute URL (`modules/config.ts`).
- The license files in the About dialog (`../LICENSE`, `../LATEX-ENGINE-NOTICE`,
  the wrapper's `LICENSE`) are static rows read from the site root.
- Dev: `out-of-bundle-assets` serves `/web/repo/*` from the repository root and
  `/web/shared/vendor/*`, `/web/shared/texmf/*`, `/web/core/*` from `web/`,
  with COOP/COEP headers. Tier 2: `tests/driver/static-server.ts` does the same
  and serves `/web/app/` from `web/dist/`.
- Anything else the browser fetches by URL must go on the allow-list in
  `.github/workflows/publish-docs.yaml`. `shared/*.ts` is not on it: shared
  code is bundled.

## Layout

| Path | Holds |
| --- | --- |
| `web/shared/` | DOM-free logic, importable by Node, testable in tier 1 |
| `web/app/modules/` | App concerns, wired by `main.tsx`; DOM allowed |
| `web/app/github/` | The GitHub flow (sign-in, save, pull request, resume, `openRoute`); writes the store, wired by `initGithub()` |
| `web/types/` | Ambient `.d.ts` shared across the app |
| `web/tests/` | Both test tiers, in TypeScript; see `web/tests/README.md` |
| `web/core/` | Fetched and gitignored (`serve.sh`). Do not edit. |
| `web/shared/vendor/` | Committed, loaded at run time, not bundled. Do not edit. |
| `web/dist/`, `web/node_modules/` | Generated and gitignored. |
| `web/oauth-relay/` | Cloudflare Pages function for GitHub OAuth; deployed by `deploy-oauth-relay.yaml` |

- Logic that does not need the DOM goes in `web/shared/`.
- Touch the DOM only inside a function body, never at import time — tier 1
  imports these modules in Node.

## Module wiring

`web/app/main.tsx` is the only wiring point. A module exports `init<Name>()`;
nothing self-registers. Order is load-bearing:

1. `initCategory()`, then the one React render of `<App/>`, made synchronous
   with `flushSync`: the `init*()` calls after it find the page's DOM and its
   components' effects. `applyTheme(initialTheme())` comes after the render:
   the menu renders the theme from the store.
2. Synchronous: wizard, uploads, shortcuts.
3. `initGithub()` and `loadEntries()` return promises. Anything needing both
   waits on `Promise.allSettled([githubReady, entriesReady])` — see `openRoute`.
4. `ensureEngine()` and `preloadCommonFiles()` fire eagerly, rejections
   swallowed on purpose. Errors surface later at the call site.

## Types at boundaries

All of `web/` is TypeScript, checked by `tsc` (TypeScript 7, the `tsgo` binary)
in three projects: `web/tsconfig.json` (`strict`, browser code, no
`@types/node`), `tsconfig.node.json` (the Node-only tools) and
`tests/tsconfig.json` (the tests: Node and DOM types, extends the first).
From `web/`, as CI runs it:

```sh
npm run typecheck
```

- Tier 1 runs `.ts` modules and tests directly on Node's native type stripping, with no
  loader flag, so `tsconfig.json` sets `erasableSyntaxOnly` (no `enum`,
  `namespace` or constructor parameter properties), `verbatimModuleSyntax`
  (a type-only import spells out `import type`) and
  `allowImportingTsExtensions` (an import specifier names the real `.ts`
  file, e.g. `"../../shared/build-plan.ts"`, never a bare `.js` guess).
- `tests/globals.d.ts` declares the test-only globals the page-side tests use
  (`__stubEngineCalls` and the rest); `types/globals.d.ts` declares the app's
  own probe hooks.
- Every exported function in `web/shared/` and `web/app/modules/` carries a
  typed signature (parameter types and a return type). A doc comment says what
  it does, without repeating the type.
- Declare an injected dependency as an exported `interface`, naming every
  method the injection site calls. Never accept an unnamed object.
- Validate external payloads (GitHub responses, parsed `.tex`) at entry. No
  unchecked shape reaches `web/app/modules/`.
- A Node-only tool (`web/glyph-usage.ts`, `web/shared/carry-texmf.ts`) imports
  `process` from `node:process` explicitly rather than using it as a global,
  since `tsconfig.json` carries no Node globals.

## Running locally

@web/serve.sh — its header comment holds the URL, the prerequisites and the
usage. It fetches the engine, runs `npm ci` when `node_modules/` is missing,
then `npm run dev`.

The deploy builds, copies `web/dist/` to `site/builder/` (served at `/builder/`)
and the rest of `web/` through an allow-list to the site root, in
`.github/workflows/publish-docs.yaml`. Tooling like this script stays out of the
site without an exclude. Anything else the browser must load goes on that list.
In the built `index.html` keep the `<!-- stats placeholder -->` comment: the
deploy inlines the analytics script there.

## Lint and format

Biome, a pinned devDependency. Config is `web/biome.json`, so run from `web/`:

```sh
npm run lint                  # lint + format check
npx biome check --write .     # apply safe fixes
```

- Running from the repository root fails: Biome 2.x treats the invocation
  directory as an implicit root and refuses a nested config. CI uses
  `working-directory: web`.
- It covers `*.js`, `*.ts` and `*.tsx`. `dist/`, `node_modules/`,
  `core/` and `shared/vendor/` are excluded.
- Formatting settings live in @web/biome.json. Indent style is explicit there —
  Biome defaults to tabs, which the root lint rules reject.
- Two recommended rules are off, both firing on correct code here:
  `suspicious/noAssignInExpressions` (the `while ((m = re.exec(s)))` loop in
  `shared/build-plan.ts`) and `suspicious/useIterableCallbackReturn` (concise
  arrow bodies in `forEach`).
- CSS and HTML are out of scope deliberately.

## Tests

Two tiers. Read `web/tests/README.md` before writing a test — it holds the
conventions (file naming, `.ts`, imports, fixtures, stubs, first-run setup).

```sh
npm run test:unit   # tier 1
npm run test:e2e    # tier 2: builds, then serves web/dist/
```

- Keep tier 1's quotes and glob in the script: the directory form fails on
  Node 22 and 24. Never gate tier 1 behind tier 2.
- Tier 2 runs against the production build, so the page's modules are bundled.
  A test cannot `import()` an app module from the page: it reads the hooks
  `window.__state` (a getter for `store.getState()`) and `window.__localStore`
  (installed in `app/main.tsx`), like `window.__lastSaveTarget`.
- Never load the LaTeX engine; `web/tests/stubs/` stubs it.
- **Install the stubs before `page.goto`, never after** — navigate first and the
  real wrapper is already in flight.

CI is `.github/workflows/test-web.yaml`, on pull requests touching `web/**`:
`npm ci`, then type-check, lint and format, tier 1, tier 2.

## Vendored versions

npm libraries are pinned by `web/package.json` and `web/package-lock.json`;
bump one with `npm install <pkg>@<version>`.

`web/vendor.env` is the single source for what is still fetched or committed
outside npm: `BUSYTEX_*` and `TEXLYRE_*`. Never hardcode one of these versions
elsewhere. Not a manifest; nothing installs from it.
`.github/workflows/publish-docs.yaml` reads it into `$GITHUB_ENV`, so every line
stays `KEY=value` with no comments.

## Editor library — CodeMirror 6

`@codemirror/{state,view,language,commands,search,autocomplete}` and
`@codemirror/legacy-modes` (npm), plus `@lezer/highlight` for the token tags.
LaTeX is the `stex` mode, through `StreamLanguage`. The editor is
`components/editor/Editor.tsx`: one `EditorView`, made when the component
mounts and held in a ref.

- The rest of the app reaches it only through `modules/editor-api.ts`:
  `getEditor()` / `requireEditor()` return an `EditorApi` (`getText`,
  `setText`, `focus`, `revealLine`, `replaceRange`, `markErrorLine`). Never
  import `@codemirror/*` outside `components/editor/` and `modules/shortcuts.ts`.
- Tier 2 reads it through `window.__editor` (an `EditorProbe`: the same API plus
  cursor, selection and line reads) and `tests/helpers/editor.ts`. A test never
  touches `.cm-*` markup to read the text: CodeMirror draws only the lines in
  view.
- Look: `components/editor/theme.ts`, a light and a dark `EditorView.theme` plus
  a `HighlightStyle`, swapped through a `Compartment` when `store.theme`
  changes. The find bar and the suggestion list use the app's custom
  properties, so they follow the theme attribute on their own.
- Keys: `shared/keymap.ts` stays the one table, which the Help dialog also
  reads. `modules/shortcuts.ts` maps each editor row to a command and
  `toEditorKey()` spells its key for CodeMirror. Do not add a binding in
  `Editor.tsx` that the table lacks. The editor takes no `defaultKeymap`: it
  binds Ctrl-Enter to a blank line, which would swallow the build key.
- Suggestions: `components/editor/completions.ts` hands the ranked lists from
  `shared/glyph-completion.ts` and `shared/image-completion.ts` to
  `@codemirror/autocomplete`. Keep `filter: false`: the order is `shared/`'s.
  `interactionDelay` stays 0, or Enter pressed within 75 ms of the list opening
  inserts a newline instead of picking.
- Docs: https://codemirror.net/docs/

## PDF viewer — pdf.js

`pdfjs-dist` (npm, version in `package.json`). `app/pdf/pdfjs.ts` is the
only module that loads it, by lazy `import("pdfjs-dist")`, so a session that
never shows a PDF never fetches it. The worker comes from
`pdfjs-dist/build/pdf.worker.min.mjs?url` (a Vite asset). Types are the
package's own.

- A `PDFDocumentProxy` has no `destroy()`. Destroy the loading task instead.
- Fonts, CMaps and WASM decoders are not shipped. LaTeX embeds its fonts, so
  the book's PDFs do not need them.

## Zip writer — client-zip

`client-zip` (npm). Only the PNG export loads it, by lazy `import("client-zip")`
in `app/modules/build.ts`, so a session that never exports PNGs never fetches
the chunk. Types are the package's own.

## LaTeX engine (BusyTeX) — do not test, do not touch

- Release `assets-v<BUSYTEX_ENGINE_VERSION>` of `TeXlyre/texlyre-busytex`.
- WASM build in `web/core/busytex/`, wrapper in
  `web/shared/vendor/texlyre-busytex.js`. Both trusted. The wrapper stays
  committed: no published file matches it.
- `web/core/` is gitignored, fetched at deploy time — a fresh clone has no
  engine.
- No upstream documentation exists. Do not infer the API: read
  `texlyre-busytex.d.ts` for the allowed surface, then the wrapper for behavior.
  `BusytexPipeline` takes eleven positional arguments; never call it from
  application code.
- `web/app/modules/build.ts` is the only module loading the wrapper, by runtime
  URL (see "Out-of-bundle runtime assets"). Everything else goes through
  `ensureEngine()`.
- `web/app/main.tsx` calls `ensureEngine()` eagerly on page load, so every
  browser-driven test is affected.
- No test compiles a real PDF or downloads `texlive-*.data`. Stub it.

### Carried TeX Live files

The app preloads `texlive-basic` only (`DATA_PACKAGE` in
`web/shared/build-plan.ts`). The ~170 files the book needs beyond it ship in
one bundle, `web/shared/texmf/carried-texmf.bin`, built from
`web/shared/texmf/carried.txt` — the manifest, which says why each file is
carried. `web/shared/carry-texmf.ts` has the full procedure in its header.

- After bumping `BUSYTEX_ENGINE_VERSION` or editing `carried.txt`, run
  `node web/shared/carry-texmf.ts build`. Tier 1 fails until you do.
- Review a rebuild through `carried.lock.json`: one line per file with its
  SHA-256. The bundle itself is binary.
- Check a rebuild on the real engine with
  `node web/tests/tools/probe-carried-texmf.ts`. It prints any `carried.txt`
  lines still missing. It is a hand-run tool, not a test.

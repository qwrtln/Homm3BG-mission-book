# web/ — the scenario builder

A browser app that lets a contributor write a Mission Book scenario in LaTeX,
compile it to a PDF in the browser (BusyTeX/WASM), and open a pull request
against this repository — with no local LaTeX toolchain.

It is a separate project from the book at the repository root and shares no
tooling with it. The root `CLAUDE.md` covers the book; only its
repository-wide lint rules also apply here.

**A static, unbuilt single-page app.** `web/index.html` redirects to
`web/app/index.html`, which loads `web/app/app.js` as an ES module. No bundler,
no transpiler, no framework.

## No dependencies in the application

The application has no `package.json`, no lockfile and no build step, and must
never acquire one: opening `web/app/` off a static server may not depend on
anything installed. `web/tests/package.json` is the one permitted exception —
it holds Playwright for tier 2 and nothing else.

Do not add a `package.json` anywhere else under `web/`, and do not let a test
dependency reach application code.

## Layout

- `web/shared/` — logic with no DOM access, importable by Node and therefore
  testable in tier 1: `build-plan.js`, `github-contrib.js`, `github-auth.js`,
  `errors.js`.
- `web/app/modules/` — application concerns, wired by `web/app/app.js`. May
  touch the DOM, but only *inside* a function body — never at import time, or
  tier 1 can no longer import the module.
- `web/types/` — ambient `.d.ts` declarations shared across the app.
- `web/core/`, `web/*/vendor/` — vendored third-party code. Do not edit.
- `oauth-relay/` (repository root, not under `web/`) — the Cloudflare Pages
  function that completes the GitHub OAuth flow for the app.

**Placement rule:** if new logic does not need the DOM, it goes in
`web/shared/`, not in `web/app/modules/`.

## Types at boundaries

No TypeScript and no build step, so types are JSDoc, checked by `tsc` against
`web/jsconfig.json` (`checkJs`, `strict`, no `@types/node` — this is browser
code). Run the check exactly as CI does, from the repository root:

```sh
npx -y -p typescript@5.9.2 tsc --noEmit --project web/jsconfig.json
```

- Every exported function in `web/shared/` and `web/app/modules/` carries
  `@param {...}` and `@returns {...}`.
- An injected dependency is declared with `@typedef` before use, naming every
  method the injection site calls. Do not accept an unnamed object.
- Validate external payloads (GitHub API responses, parsed `.tex`) at the point
  of entry. Do not let an unchecked shape travel into `web/app/modules/`.

## Tests

Two tiers. Read `web/tests/README.md` before adding one.

**Tier 1 — unit.** From the repository root:

```sh
node --test "web/tests/unit/**/*.test.mjs"
```

`node:test` and `node:assert`, no config file, no install step, no npm. This
command must keep working exactly as written, and must never be gated behind
tier 2. Keep the quotes and the glob: only Node 25 and later expand a bare
`web/tests/unit/` directory argument, so the directory form fails on Node 22
and 24.

**Tier 2 — integration.** The real app in headless Chromium. From `web/tests/`:

```sh
npx playwright test
```

Once, before the first run: `npm install` in `web/tests/` (not in `web/`), then
`npx playwright install chromium`. Playwright serves the app with
`web/tests/driver/static-server.mjs`, a dependency-free port of
`web/prototype-engine-check/serve.py` — the app needs that server's
`/web/repo/` alias and its COOP/COEP headers, so a stock static server will not
do.

**Both tiers.**

- Test files are `<subject>.test.mjs`. The `.mjs` extension is mandatory for
  tier 1: it sits outside any `package.json`, so a `.js` file there is parsed
  as CommonJS and cannot use `import`.
- Tests import application modules by relative path, exactly as the browser
  does. No loader, no transform, no import map.
- Fixtures are inline strings. The exception is `real-book.test.mjs`, which
  reads the repository's own `.tex` files and asserts invariants only — never a
  specific scenario title.
- The LaTeX engine is never loaded in a test. `web/tests/stubs/` intercepts the
  request for `web/shared/vendor/texlyre-busytex.js` and fulfills it with a
  stub, so no production code is changed, branched, or aware of the test.
  **Install the stubs before `page.goto`, never after** — navigate first and
  the real engine wrapper is already in flight.

CI runs all of it in `.github/workflows/test-web.yaml`, on pull requests that
touch `web/**`: type-check, then tier 1, then tier 2.

## LaTeX engine (BusyTeX) — do not test, do not touch

- The WASM build lives in `web/core/busytex/`; the wrapper is
  `web/shared/vendor/texlyre-busytex.js`. Both are vendored and trusted.
- `web/app/app.js` calls `ensureEngine()` eagerly on page load, so any
  browser-driven test is affected by it.
- No test compiles a real PDF or downloads `texlive-*.data`. If a test needs
  the engine absent, stub it — do not let a real compile run.
- There is no official upstream documentation to consult. Do not infer its API;
  read the wrapper.

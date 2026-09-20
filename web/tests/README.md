# Tests for the web scenario builder

Two tiers, both dependency-free. `web/` has no `package.json`, no lockfile and
no build step, and this suite does not add one. Everything here runs on Node's
built-in test runner (`node:test`) and `node:assert`.

## Tier 1: unit tests

Pure logic, no DOM and no network. Run them from the repository root:

```sh
node --test "web/tests/unit/**/*.test.mjs"
```

Node expands that pattern itself, so quote it and let it through the shell
unexpanded. There is no configuration file, and no `npm` step before it.

The pattern is spelled out rather than passed as the directory
(`node --test web/tests/unit/`) because only Node 25 and later expand a
directory argument. On Node 22 and 24 the directory is taken for a test file
and the run fails with `Cannot find module`.

## Tier 2: integration tests

The real `web/app/index.html`, loaded in headless Chromium and driven by
Playwright. Real DOM, real modules, real event wiring. Run them from this
directory:

```sh
cd web/tests
npx playwright test
```

Once, before the first run:

```sh
npm install                        # in web/tests, not in web/
npx playwright install chromium    # Playwright's own browser build
```

This is the only `package.json` under `web/`, and it is the one permitted
exception to the no-dependency rule. It holds Playwright and nothing else. The
application keeps no `package.json`, no lockfile and no build step, and opening
`web/app/` off a static server must never depend on anything installed here.
Tier 1 does not use it either, and is never gated behind tier 2.

### The pieces

- `playwright.config.mjs` — `testDir: ./integration`, `testMatch:
  **/*.test.mjs`, Chromium only. Its `webServer` starts the static server and
  waits on `/web/app/`, not on `/`: the server 404s at the root, so a
  health-check against `baseURL` alone times out.
- `driver/static-server.mjs` and `driver/serve.mjs` — a dependency-free
  `node:http` port of `web/prototype-engine-check/serve.py`, kept because the
  app needs its `/web/repo/` alias and its COOP/COEP headers. A stock static
  server will not do. `serve.mjs` is the entry point `webServer` runs; `PORT`
  overrides the default 8322.
- `stubs/` — `installEngineStub(page)` and `installGithubStub(page, routes)`,
  both built on `page.route`.

### The engine is stubbed, never loaded

No test compiles a real PDF, and no test downloads `texlive-*.data`.
`installEngineStub` routes the request for
`web/shared/vendor/texlyre-busytex.js` and fulfills it with
`stubs/texlyre-busytex-stub.js`. The app's own code is not changed, not
branched, and not aware of it. The stub records every call on
`globalThis.__stubEngineCalls`, so a test can assert the app asked the engine to
compile without a compile happening.

**Install the stubs before `page.goto`.** Navigate first and the real engine
wrapper is already in flight, and a large engine payload starts downloading.

`installGithubStub` works the same way for `api.github.com`. An unstubbed call
is fulfilled with a 599 naming the method and URL, so it fails loudly instead of
reaching the real API.

## Conventions

- **File name**: `<subject>.test.mjs`, named after the module or the area under
  test, in `web/tests/unit/`.
- **Extension**: `.mjs`, always. The repository has no `package.json`, so a
  `.js` test file would be treated as CommonJS and could not use `import`.
- **Imports**: tests import the application's modules by relative path, exactly
  as the browser does — `import { pageCount } from "../../shared/build-plan.js";`.
  No loader, no transform, no import map. Node reads the application's `.js`
  modules as ES modules through its own module-syntax detection.
- **What belongs in tier 1**: a module Node can import without a DOM. Today that
  means `web/shared/build-plan.js`, plus helpers in `web/app/modules/` that only
  touch the DOM *inside* a function body, never at import time.
- **Fixtures**: inline strings for logic tests, so an assertion states exactly
  what it tests. `real-book.test.mjs` is the exception: it reads the
  repository's own `.tex` files through `helpers/repo.mjs`, and asserts only
  invariants — never a specific scenario title — so writing a new scenario does
  not break it, while a parser regression does.

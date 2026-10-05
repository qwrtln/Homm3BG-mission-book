# Tests for the web scenario builder

Two tiers. Dependencies come from `web/package.json` (Playwright for tier 2);
tier 1 needs none beyond Node. Tier 1 runs on Node's built-in test runner
(`node:test`) and `node:assert`.

## Tier 1: unit tests

Pure logic, no DOM and no network. Run them from `web/`:

```sh
npm run test:unit
```

The script is `node --test "tests/unit/**/*.test.mjs"`. Node expands that
pattern itself, so keep the quotes. There is no configuration file.

The pattern is spelled out rather than passed as the directory
(`node --test web/tests/unit/`) because only Node 25 and later expand a
directory argument. On Node 22 and 24 the directory is taken for a test file
and the run fails with `Cannot find module`.

## Tier 2: integration tests

The real app, built and loaded in headless Chromium and driven by Playwright.
Real DOM, real bundle, real event wiring. Run them from `web/`:

```sh
npm run test:e2e
```

Once, before the first run:

```sh
npm ci                             # in web/
npx playwright install chromium    # Playwright's own browser build
```

The Playwright `webServer` fetches CodeMirror 5, runs `npm run build` and then
serves `web/dist/`, so the tests run against the production output. Tier 1 is
never gated behind tier 2.

### The pieces

- `playwright.config.mjs` — `testDir: ./integration`, `testMatch:
  **/*.test.mjs`, Chromium only. Its `webServer` builds the app, starts the
  static server and waits on `/web/app/`, not on `/`: the server 404s at the
  root, so a health-check against `baseURL` alone times out.
- `driver/static-server.mjs` and `driver/serve.mjs` — a dependency-free
  `node:http` server. It maps `/web/app/` to `web/dist/`, serves `/web/repo/`
  from the repository root and the rest of `web/` (`shared/`, `core/`) where it
  sits, with the COOP/COEP headers the engine needs. `serve.mjs` is the entry
  point `webServer` runs; `PORT` overrides the default 8322.
- `stubs/` — `installEngineStub(page)`, `installGithubStub(page, routes)` and
  `installPublishedPdfStub(page)`, all built on `page.route`.

### The engine is stubbed, never loaded

No test compiles a real PDF, and no test downloads `texlive-*.data`.
`installEngineStub` routes the request for
`web/shared/vendor/texlyre-busytex.js` and fulfills it with
`stubs/texlyre-busytex-stub.js`. The app's own code is not changed, not
branched, and not aware of it. The stub records every call on
`globalThis.__stubEngineCalls`, so a test can assert the app asked the engine to
compile without a compile happening. A test that needs a compile in flight,
to press Stop on, sets `globalThis.__stubCompileHold` to a promise, and every
compile waits on it. A compile answers with a real three-page PDF that pdf.js
can draw; its bytes are on `globalThis.__stubPdfBytes`.

**Install the stubs before `page.goto`.** Navigate first and the real engine
wrapper is already in flight, and a large engine payload starts downloading.

`installGithubStub` works the same way for `api.github.com`. An unstubbed call
is fulfilled with a 599 naming the method and URL, so it fails loudly instead of
reaching the real API.

`installPublishedPdfStub` answers every `raw.githubusercontent.com` request
(the published-PDF CDN) with a 404, so a pick opens with no preview. A test
that needs a published PDF registers its own `page.route` for that host;
Playwright runs the newest route first, so it overrides the default.

## Conventions

- **File name**: `<subject>.test.mjs`, named after the module or the area under
  test, in `web/tests/unit/`.
- **Extension**: `.mjs`, always, for tests and tools alike.
- **Imports**: tier 1 imports the application's modules by relative path —
  `import { pageCount } from "../../shared/build-plan.ts";`. No loader, no
  transform, no import map. Node reads `.ts` modules on its native type
  stripping, and `.js` ones as plain ES modules (`web/package.json` has
  `"type": "module"`).
- **App internals in tier 2**: the page is bundled, so a test cannot `import()`
  a module from it. Read `globalThis.__state` and `globalThis.__localStore`
  (installed by `app/app.js`) inside `page.evaluate`.
- **What belongs in tier 1**: a module Node can import without a DOM. Today that
  means `web/shared/build-plan.ts`, plus helpers in `web/app/modules/` that only
  touch the DOM *inside* a function body, never at import time.
- **Fixtures**: inline strings for logic tests, so an assertion states exactly
  what it tests. `real-book.test.mjs` is the exception: it reads the
  repository's own `.tex` files through `helpers/repo.mjs`, and asserts only
  invariants — never a specific scenario title — so writing a new scenario does
  not break it, while a parser regression does.

# Tests for the web scenario builder

Two tiers, both dependency-free. `web/` has no `package.json`, no lockfile and
no build step, and this suite does not add one. Everything here runs on Node's
built-in test runner (`node:test`) and `node:assert`.

## Tier 1: unit tests

Pure logic, no DOM and no network. Run them from the repository root:

```sh
node --test web/tests/unit/
```

Node discovers every `*.test.mjs` file under that directory. There is no
configuration file, and no `npm` step before it.

## Tier 2: integration tests

Not here yet. Ticket 04 of `.scratch/scenario-builder-tests/map.md` adds
`web/tests/integration/` and the headless-Chromium driver it uses. Keeping the
two tiers in separate directories lets the pull-request workflow run tier 1 on
its own, for a fast signal that does not need a browser.

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

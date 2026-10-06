# web/app/ — page, modules, styles

`web/app/` is the Vite root. `npm run build` bundles it into `web/dist/`, which
deploys as `site/builder/`, served at `/builder/`
(`.github/workflows/publish-docs.yaml`). A file Vite does not reach (a classic
`<script>`, a runtime `fetch`) does not ship unless `vite.config.ts` copies it
or the deploy allow-list names it.

## index.html

- Every `id` in `index.html` has an entry in `web/types/dom-ids.d.ts`, typed as
  the element the markup produces. Add, rename or remove both together.
  `el()` in `modules/dom.js` is keyed on that map; `tests/unit/dom-ids.test.mjs`
  fails when the two drift.
- Keep the `<!-- stats placeholder -->` comment in `<head>`. The deploy
  `grep -q`s for it in the built `index.html` and inlines the analytics script
  there; without it the deploy fails.
- The inline pre-paint `<script>` in `<body>` reads the literal
  `"wasm-scenario-builder:pending-route"`, which is `ROUTE_KEY` in
  `github/context.ts`. Rename both together. It is classic script, outside
  `tsc` and Biome.
- The script entry is plain `main.tsx`. The build gives the bundle a hashed name,
  so no `?v=N` cache-buster exists. Never add one.
- A license row with a `data-src` is for a file outside npm. Bundled npm
  packages are listed from `licenses.json`, which the build writes.

## Modules

- Shared mutable state lives in one Zustand store, `app/store.ts`. `AppState`
  (the app's fields) and `SaveState` (the GitHub save fields) are declared
  there, with the UI fields components read (open dialogs, the pending
  confirmation, the toast). Add a field to its interface and to
  `initialState()`.
- A React component reads it with `useAppStore((s) => s.field)`. A
  module not yet migrated reads and writes through the `state` facade in
  `modules/state.ts` and `githubSaveState` in `modules/github-save-state.js`,
  which proxy to `store.getState()` / `store.setState()`. A change made inside
  a field (`map.set(...)`) does not notify subscribers; assign a new value.
  `store.subscribe` replaces a single-slot listener.
- `main.tsx` is the wiring point (order in `web/CLAUDE.md`). `mountRegion(id,
  element)` in `mount.tsx` renders a React subtree into an `index.html` region
  synchronously. The `overlays` region holds the dialogs and the toast.
- Reach elements through `el("id")`, which throws on a missing id and returns
  a non-null typed element. Reserve `document.querySelector` for class or
  structural selectors. A component renders its own ids; they are not in
  `index.html` or `dom-ids.d.ts`, so a component never reads them through `el()`.
- Tests reach `state` and the local store through `window.__state` and
  `window.__localStore`, installed at the top of `main.tsx` (typed in
  `web/types/globals.d.ts`). Keep them in step with what the tests read.
- `localStorage` keys carry the `wasm-scenario-builder:` prefix. The one
  exception, `github_token` in `web/shared/github-auth.js`, stays as it is:
  renaming it signs every contributor out.
- A module tier 1 imports stays `.ts` or `.js`: Node cannot load `.tsx`. That
  is why `showToast()` lives in `modules/toast.ts`, not in a component.

## Components

- `components/ui/` holds the primitives (`Button`, `Checkbox`, `RadioGroup`,
  `Dialog`, `Link`, `Toast`): generic, no store, no app text.
- `components/` holds one file per region or dialog (`AboutDialog.tsx`,
  `Toaster.tsx`), which reads the store and composes primitives. A region with
  several parts has a folder: `components/header/` renders the page header.
- A region's logic stays out of its components. The header buttons call
  functions in `github/` (sign in, save, open PR) and `modules/`, which write
  the store; the components render from it.
- A component keeps the ids, `data-testid`s and accessible names tier 2 uses.
- `components/wizard/` renders the start wizard from `store.wizard`; every pane
  stays in the page (the shown one aside is `hidden`), so each keeps its ids.
  `modules/wizard.ts` holds its actions and the rules for a pane being answered
  or valid. `components/uploads/` renders one `UploadPanel` in the Upload images
  dialog and in the wizard's panes, from `store.uploadPanels`; its actions stage
  files at once, in `modules/upload-panel.ts`.
- A new dialog or region goes in `components/` and mounts through
  `mountRegion`. Delete its static markup and old module in the same change.

## Styles

- `styles/app.css` is the one stylesheet `index.html` links. It imports
  Tailwind's theme and utilities (no preflight, which would restyle the
  legacy regions) and puts the legacy sheets and CodeMirror 5's in a `legacy`
  layer, which the utilities layer beats. Delete a sheet's import there when
  its last region migrates.
- Colors come from custom properties in `styles/tokens.css` (GitHub Primer
  values). A new color goes in `tokens.css`, once under `:root` and once under
  `html[data-theme="dark"]`, plus a `--color-*` line in the `@theme inline`
  block of `app.css`. Dark mode is that attribute, set by `modules/theme.ts`:
  Tailwind's `dark:` variant follows it. Never use a `prefers-color-scheme`
  query.
- Radius, type and shadow come from the `@theme` scales in `app.css`
  (`rounded-sm|md|lg`, `text-small|ui|body|heading`). No raw px or rem
  in a component when a scale step fits.
- Tailwind orders utilities by property, not by class order: two classes
  for one property on one element conflict. Pick one per variant.

## Controls match the app

Every control a contributor sees is dressed in the app's GitHub Primer look,
in both themes. The browser's default rendering of a control never reaches the
page. Reuse the primitive:

| Control | Use |
| --- | --- |
| Button | `<Button variant=...>` in `components/ui/Button.tsx`: `primary`, `link`, `withIcon`, `icon`, `danger`, `attention`, `stop`, or none; `size="compact"` is the header row, `iconed` lays an icon and label out on one line |
| Checkbox | `<Checkbox label=...>` in `components/ui/Checkbox.tsx` |
| Radio group | `<RadioGroup>` in `components/ui/RadioGroup.tsx`: joined buttons over hidden radios |
| Hyperlink | `<Link>` in `components/ui/Link.tsx`: accent color, visible focus ring, `external` for a new tab |
| Drop-down | `<Select>` in `components/ui/Select.tsx` |
| Menu | `<MenuList>`, `<MenuItem>` and `useMenu()` in `components/ui/Menu.tsx` and `useMenu.ts`: the ARIA menu behavior |
| Dialog | `<Dialog>` in `components/ui/Dialog.tsx`, a native `<dialog>` |
| Confirmation | `confirmAction()` / `confirmDelete()` in `modules/dom.js`, shown by `ConfirmDialog` |
| Notice | `showToast()` in `modules/toast.ts`, or `setStatus()` in `modules/dom.js` |

- Markup in `index.html` not yet migrated still uses the legacy classes
  (`button.primary`, `input.check`); they move to the
  primitives with their region.
- A control with no primitive here gets one first, built from the theme. Check
  it in light and dark mode before it ships.
- `alert()`, `confirm()` and `prompt()` stay out of the app. They are the
  browser's own UI and ignore the theme.

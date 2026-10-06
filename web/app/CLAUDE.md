# web/app/ — page, components, modules, styles

`web/app/` is the Vite root. `npm run build` bundles it into `web/dist/`, which
deploys as `site/builder/`, served at `/builder/`
(`.github/workflows/publish-docs.yaml`). A file Vite does not reach (a classic
`<script>`, a runtime `fetch`) does not ship unless `vite.config.ts` copies it
or the deploy allow-list names it.

## index.html

- It holds the `<head>`, the `<!-- stats placeholder -->` comment, the pre-paint
  `<script>`, one `<div id="root">` and the `main.tsx` module script. All markup
  is React, rendered from `App.tsx`. Never add static markup to it.
- Keep the `<!-- stats placeholder -->` comment in `<head>`. The deploy
  `grep -q`s for it in the built `index.html` and inlines the analytics script
  there; without it the deploy fails.
- The inline pre-paint `<script>` in `<body>` reads the literal
  `"wasm-scenario-builder:pending-route"`, which is `ROUTE_KEY` in
  `github/context.ts`. Rename both together. It is classic script, outside
  `tsc` and Biome.
- The script entry is plain `main.tsx`. The build gives the bundle a hashed name,
  so no `?v=N` cache-buster exists. Never add one. No `<link rel="stylesheet">`
  either: `main.tsx` imports `styles/app.css` and Vite injects it.
- `#root` is `display: contents` (in `app.css`), so `App`'s children are the
  body's flex items.

## App and modules

- `App.tsx` is the single root. It renders `#header`, then `.content` (the
  route-loading screen, the welcome screen and `#workspace`), then `#overlays`
  (the dialogs and the toast). A new region or dialog is a component rendered
  there. Never mount a second React root.
- Shared mutable state lives in one Zustand store, `app/store.ts`. There is no
  facade. A module reads and writes it with `store.getState()` and
  `store.setState()`; a component reads it with `useAppStore((s) => s.field)`.
  The store type is `AppState & SaveState & UiState & PickerState & ViewState &
  WizardUiState & WorkspaceState`. Add a field to its interface and to
  `initialState()`.
- View state is in the store too: `workspaceShown`, `welcomeLeaving`,
  `workspaceEntrance`, `resume` (the welcome screen's resume block) and
  `editBranch` (the edit-branch prompt). A module changes what shows by writing
  these, never by touching the DOM. `showWorkspace()` in `modules/workspace.ts`
  renders with `flushSync`, so a caller sees the final DOM when it returns.
- `githubSaveState` in `modules/github-save-state.ts` is a proxy over the save
  fields of the store, kept for the GitHub modules. A change made inside a field
  (`map.set(...)`) does not notify subscribers; assign a new value.
  `store.subscribe` replaces a single-slot listener.
- `main.tsx` is the wiring point (order in `web/CLAUDE.md`).
- Reach an element with a ref in a component. Reserve `document.querySelector`
  for class or structural selectors in a module. Modules touch only DOM that
  React gives no children.
- Tests reach the store and the local store through `window.__state` and
  `window.__localStore`, installed at the top of `main.tsx`, and the editor
  through `window.__editor`, installed by the editor on mount (all typed in
  `web/types/globals.d.ts`). Keep them in step with what the tests read.
- `localStorage` keys carry the `wasm-scenario-builder:` prefix. The one
  exception, `github_token` in `web/shared/github-auth.ts`, stays as it is:
  renaming it signs every contributor out.
- A module tier 1 imports stays `.ts`: Node cannot load `.tsx`. That
  is why `showToast()` lives in `modules/toast.ts`, not in a component.

## Components

- `components/ui/` holds the primitives (`Button`, `Checkbox`, `RadioGroup`,
  `Dialog`, `Link`, `Toast`): generic, no store, no app text.
- `components/` holds one file per dialog (`AboutDialog.tsx`, `Toaster.tsx`),
  which reads the store and composes primitives. A region with several parts has
  a folder: `components/header/` renders the page header and
  `components/welcome/` the welcome screen (`Welcome.tsx`, the picker, the
  resume list, the edit-branch prompt, the route-loading screen).
- A region's logic stays out of its components. The header buttons call
  functions in `github/` (sign in, save, open PR) and `modules/`, which write
  the store; the components render from it.
- A component keeps the ids, `data-testid`s and accessible names tier 2 uses.
- `components/editor/` is the source editor: `Editor.tsx` (one CodeMirror 6 view
  in a ref), `theme.ts`, `completions.ts` and `error-line.ts`. Other code reaches
  it through `modules/editor-api.ts`, never the view (see "Editor library" in
  `web/CLAUDE.md`).
- `components/wizard/` renders the start wizard from `store.wizard`; every pane
  stays in the page (the shown one aside is `hidden`), so each keeps its ids.
  `modules/wizard.ts` holds its actions and the rules for a pane being answered
  or valid. `components/uploads/` renders one `UploadPanel` in the Upload images
  dialog and in the wizard's panes, from `store.uploadPanels`; its actions stage
  files at once, in `modules/upload-panel.ts`.
- `components/workspace/` renders the workspace, which `App.tsx` puts in
  `#workspace` (shown or hidden from `store.workspaceShown`): `Workspace.tsx`,
  `Panes.tsx` (the divider, `SPLIT_KEY`), `PdfView.tsx`, `ErrorPanel.tsx`, `StatusBar.tsx` and
  `SubmitDialog.tsx`. The status bar, the build's step, the error panel, the
  pane's content and its zoom render from the store; `modules/status.ts`,
  `modules/build.ts` and `pdf/view.ts` write them. `pdf/` holds the pdf.js side:
  `pdfjs.ts` (lazy load), `pages.ts` (canvas drawing, change marks, PNG export)
  and `view.ts` (which document the pane shows, redraws, zoom). The pages are
  drawn into a host element React never gives children. The stale-PDF notice
  derives from `store.editorText` in `initStaleStatus()`.
- A new dialog or region goes in `components/` and is rendered by `App.tsx`.

## Styles

- `styles/app.css` is the one stylesheet. `main.tsx` imports it. It orders the
  layers `theme, components, utilities`. The `components` layer holds
  `tokens.css` and the page's component rules, one commented section per region
  (base, welcome, wizard, upload fields, workspace, dialogs). The utilities
  layer comes after it, so a Tailwind utility on an element beats a rule there.
  Tailwind's preflight is not imported: the base section does the reset.
- Style a component with utilities. A rule goes in the `components` layer only
  for what utilities cannot say (pseudo-elements, descendant rules, animations).
- Colors come from custom properties in `styles/tokens.css` (GitHub Primer
  values), the single color source. A new color goes in `tokens.css`, once under
  `:root` and once under `html[data-theme="dark"]`, plus a `--color-*` line in
  the `@theme inline` block of `app.css`. Dark mode is that attribute, set by
  `modules/theme.ts`: Tailwind's `dark:` variant follows it. Never use a
  `prefers-color-scheme` query.
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
| Confirmation | `confirmAction()` / `confirmDelete()` in `modules/dom.ts`, shown by `ConfirmDialog` |
| Notice | `showToast()` in `modules/toast.ts`, or `setStatus()` in `modules/status.ts` |

- A control with no primitive here gets one first, built from the theme. Check
  it in light and dark mode before it ships.
- `alert()`, `confirm()` and `prompt()` stay out of the app. They are the
  browser's own UI and ignore the theme.

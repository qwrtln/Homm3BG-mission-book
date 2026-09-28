# web/app/ — page, modules, styles

Everything under `web/app/` deploys (`--include='/app/***'` in
`.github/workflows/publish-docs.yaml`), so a file added here ships.

## index.html

- Every `id` in `index.html` has an entry in `web/types/dom-ids.d.ts`, typed as
  the element the markup produces. Add, rename or remove both together.
  `el()` in `modules/dom.js` is keyed on that map; `tests/unit/dom-ids.test.mjs`
  fails when the two drift.
- Keep the `<!-- stats placeholder -->` comment in `<head>`. The deploy
  `grep -q`s for it and inlines the analytics script there; without it the
  deploy fails.
- The inline pre-paint `<script>` in `<body>` reads the literal
  `"wasm-scenario-builder:pending-route"`, which is `ROUTE_KEY` in
  `modules/github.js`. Rename both together. It is classic script, outside
  `tsc` and Biome.
- `app.js?v=N` is a cache-buster for GitHub Pages. Bump `N` when a change to
  the module graph must reach returning visitors at once.

## Modules

- Shared mutable state lives in the one `state` object in `modules/state.js`;
  its shape is `AppState` in `web/types/app.d.ts`. Add a field in both.
- Reach elements through `el("id")`, which throws on a missing id and returns
  a non-null typed element. Reserve `document.querySelector` for class or
  structural selectors.
- `localStorage` keys carry the `wasm-scenario-builder:` prefix. The one
  exception, `github_token` in `web/shared/github-auth.js`, stays as it is:
  renaming it signs every contributor out.

## Styles

- Colors come from custom properties in `styles/tokens.css` (GitHub Primer
  values). Define a new color there, once under `:root` and once under
  `html[data-theme="dark"]`. Dark mode is that attribute, set by
  `modules/theme.js` — not a `prefers-color-scheme` query in each sheet.
- A new stylesheet needs its own `<link>` in `index.html`; nothing bundles or
  imports them.

## Controls match the app

Every control a contributor sees is dressed in the app's GitHub Primer look,
in both themes. The browser's default rendering of a control never reaches the
page. Reuse the existing pattern:

| Control | Use |
| --- | --- |
| Button | `button` plus `primary`, `link`, `with-icon`, `icon`, `danger` or `attention` (`styles/base.css`, `header-actions.css`, `dialog.css`) |
| Checkbox | `class="check"` on the `<input>`, inside its `<label>` (`styles/base.css`) |
| Radio group | Joined buttons over hidden radios: `.wizard-radios` in `styles/wizard.css` |
| Hyperlink | `color: var(--accent)` plus a `:focus-visible` outline, set by the container's rule (`.about-dialog a`, `.welcome-intro a`). No global `a` rule exists. |
| Confirmation | `confirmAction()` / `confirmDelete()` in `modules/dom.js`, the page's own `<dialog>` |
| Notice | `showToast()` in `modules/toast.js`, or `setStatus()` in `modules/dom.js` |

- Several of these rules are scoped to one screen. When a second screen needs
  one, widen its selector into a shared class; keep the one definition.
- A control with no pattern here gets new rules first, built from
  `tokens.css`. Check it in light and dark mode before it ships.
- `alert()`, `confirm()` and `prompt()` stay out of the app. They are the
  browser's own UI and ignore the theme.

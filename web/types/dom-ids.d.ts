// Every element id app/index.html declares, mapped to the element type the
// markup actually produces. `el()` in app/modules/dom.js is keyed on this, so
// a mistyped id is a type error rather than a null dereference at run time,
// and `el("build").disabled` resolves without a cast at the call site.
//
// Keep this in step with app/index.html: adding an element without adding its
// id here makes `el("new-id")` fail to compile.

interface ElementIdMap {
  build: HTMLButtonElement;
  "build-label": HTMLSpanElement;
  "build-overlay": HTMLDivElement;
  download: HTMLButtonElement;
  "draft-note": HTMLSpanElement;
  "unsaved-note": HTMLSpanElement;
  "back-to-welcome": HTMLButtonElement;
  "route-loading": HTMLDivElement;
  "confirm-warning": HTMLParagraphElement;
  editor: HTMLTextAreaElement;
  "editor-pane": HTMLElement;
  "workspace-main": HTMLElement;
  "error-panel": HTMLDivElement;
  "first-error": HTMLDivElement;
  "full-log": HTMLPreElement;
  "full-log-details": HTMLDetailsElement;
  "github-open-pr": HTMLButtonElement;
  "github-pr-link": HTMLAnchorElement;
  "github-save": HTMLButtonElement;
  "github-signin": HTMLButtonElement;
  "github-signout": HTMLButtonElement;
  "github-status": HTMLSpanElement;
  "edit-branch-prompt": HTMLDivElement;
  "edit-continue": HTMLButtonElement;
  "edit-start-over": HTMLButtonElement;
  "confirm-cancel": HTMLButtonElement;
  "confirm-dialog": HTMLDialogElement;
  "confirm-message": HTMLParagraphElement;
  "confirm-title": HTMLHeadingElement;
  "confirm-ok": HTMLButtonElement;
  go: HTMLButtonElement;
  "mode-choice": HTMLDivElement;
  "mode-edit": HTMLButtonElement;
  "mode-new": HTMLButtonElement;
  "name-slide": HTMLDivElement;
  "header-actions": HTMLDivElement;
  "header-menu": HTMLDivElement;
  "header-menu-separator": HTMLDivElement;
  "header-menu-toggle": HTMLButtonElement;
  "header-scenario": HTMLDivElement;
  "header-titles": HTMLDivElement;
  "scenario-title": HTMLSpanElement;
  "pdf-body": HTMLDivElement;
  "pdf-empty": HTMLDivElement;
  "pdf-pane": HTMLElement;
  "pane-divider": HTMLDivElement;
  "pdf-wrap": HTMLDivElement;
  "resume-drafts": HTMLDivElement;
  "resume-hint": HTMLParagraphElement;
  "resume-list": HTMLDivElement;
  "resume-loading": HTMLParagraphElement;
  "scenario-name": HTMLInputElement;
  "scratch-row": HTMLDivElement;
  "scratch-alliance": HTMLButtonElement;
  "scratch-campaign": HTMLButtonElement;
  "scratch-clash": HTMLButtonElement;
  "scratch-coop": HTMLButtonElement;
  search: HTMLInputElement;
  "search-results": HTMLDivElement;
  "editor-autocomplete": HTMLUListElement;
  "name-error": HTMLParagraphElement;
  "go-hint": HTMLParagraphElement;
  "status-bar": HTMLDivElement;
  "status-spinner": HTMLSpanElement;
  "status-text": HTMLSpanElement;
  "theme-toggle": HTMLButtonElement;
  toast: HTMLDivElement;
  "upload-header": HTMLInputElement;
  "upload-header-add": HTMLButtonElement;
  "upload-header-card": HTMLDivElement;
  "upload-header-name": HTMLInputElement;
  "upload-header-orig": HTMLSpanElement;
  "upload-header-preview": HTMLImageElement;
  "upload-header-remove": HTMLButtonElement;
  "upload-header-status": HTMLSpanElement;
  "upload-maps": HTMLInputElement;
  "upload-maps-add": HTMLButtonElement;
  "upload-maps-names": HTMLDivElement;
  "upload-maps-status": HTMLSpanElement;
  "upload-dialog": HTMLDialogElement;
  "upload-done": HTMLButtonElement;
  "upload-open": HTMLButtonElement;
  "upload-title": HTMLHeadingElement;
  welcome: HTMLElement;
  "welcome-picker": HTMLDivElement;
  workspace: HTMLDivElement;
}

// Every element id app/index.html declares, mapped to the element type the
// markup actually produces. `el()` in app/modules/dom.js is keyed on this, so
// a mistyped id is a type error rather than a null dereference at run time,
// and `el("build").disabled` resolves without a cast at the call site.
//
// Keep this in step with app/index.html: adding an element without adding its
// id here makes `el("new-id")` fail to compile.

interface ElementIdMap {
  header: HTMLElement;
  overlays: HTMLDivElement;
  "build-progress": HTMLDivElement;
  "build-phase": HTMLDivElement;
  "build-phase-text": HTMLSpanElement;
  "route-loading": HTMLDivElement;
  "editor-region": HTMLDivElement;
  "editor-pane": HTMLElement;
  "workspace-main": HTMLElement;
  "error-panel": HTMLDivElement;
  "first-error": HTMLDivElement;
  "full-log": HTMLPreElement;
  "full-log-details": HTMLDetailsElement;
  "edit-branch-prompt": HTMLDivElement;
  "edit-continue": HTMLButtonElement;
  "edit-start-over": HTMLButtonElement;
  "submit-blockers": HTMLUListElement;
  "submit-cancel": HTMLButtonElement;
  "submit-checklist": HTMLFieldSetElement;
  "submit-confirm": HTMLButtonElement;
  "submit-dialog": HTMLDialogElement;
  "submit-title": HTMLHeadingElement;
  "pdf-body": HTMLDivElement;
  "pdf-empty": HTMLDivElement;
  "pdf-pane": HTMLElement;
  "pdf-controls": HTMLDivElement;
  "pdf-page-count": HTMLSpanElement;
  "pdf-zoom-in": HTMLButtonElement;
  "pdf-zoom-level": HTMLButtonElement;
  "pdf-zoom-out": HTMLButtonElement;
  "pane-divider": HTMLDivElement;
  "pdf-wrap": HTMLDivElement;
  "resume-drafts": HTMLDivElement;
  "resume-hint": HTMLParagraphElement;
  "resume-list": HTMLDivElement;
  "resume-loading": HTMLParagraphElement;
  "status-bar": HTMLElement;
  "status-spinner": HTMLSpanElement;
  "status-text": HTMLSpanElement;
  welcome: HTMLElement;
  "welcome-picker": HTMLDivElement;
  "welcome-mode": HTMLDivElement;
  "welcome-pick": HTMLDivElement;
  "welcome-start": HTMLDivElement;
  "welcome-wizard": HTMLDivElement;
  workspace: HTMLDivElement;
}

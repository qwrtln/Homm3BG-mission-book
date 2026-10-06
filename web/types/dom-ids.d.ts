// Every element id app/index.html declares, mapped to the element type the
// markup actually produces. `el()` in app/modules/dom.ts is keyed on this, so
// a mistyped id is a type error rather than a null dereference at run time,
// and `el("build").disabled` resolves without a cast at the call site.
//
// Keep this in step with app/index.html: adding an element without adding its
// id here makes `el("new-id")` fail to compile.

interface ElementIdMap {
  header: HTMLElement;
  overlays: HTMLDivElement;
  "route-loading": HTMLDivElement;
  "edit-branch-prompt": HTMLDivElement;
  "edit-continue": HTMLButtonElement;
  "edit-start-over": HTMLButtonElement;
  "resume-drafts": HTMLDivElement;
  "resume-hint": HTMLParagraphElement;
  "resume-list": HTMLDivElement;
  "resume-loading": HTMLParagraphElement;
  welcome: HTMLElement;
  "welcome-picker": HTMLDivElement;
  "welcome-mode": HTMLDivElement;
  "welcome-pick": HTMLDivElement;
  "welcome-start": HTMLDivElement;
  "welcome-wizard": HTMLDivElement;
  workspace: HTMLDivElement;
}

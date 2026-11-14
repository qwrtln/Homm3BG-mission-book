import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { FLASH_LINE_CLASS } from "./flash-line.ts";

/**
 * The editor's chrome: page colors, gutter, cursor, selection, the line and
 * bracket cues, the build error's diagnostic, the find bar, the go-to-line box
 * and the completion list. Every color is a custom property from tokens.css,
 * which follows the theme attribute by itself.
 */
function chrome(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
        font: "var(--text-editor)/1.5 var(--font-mono)",
      },
      // A click and a key both show the ring, as TextInput does. It is an overlay, not an
      // outline: the sticky gutter (z-index 200) and panels (300) would paint over an inset
      // outline. Inside the editor, so the pane does not clip it; below tooltips (500).
      "&.cm-focused": { outline: "none" },
      "&.cm-focused::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        border: "2px solid var(--accent)",
        pointerEvents: "none",
        zIndex: "400",
      },
      ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit" },
      ".cm-content": { caretColor: "var(--ink)" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
        { background: "var(--selection)" },
      ".cm-gutters": {
        backgroundColor: "var(--panel)",
        color: "var(--gutter-ink)",
        borderRight: "1px solid var(--line)",
      },
      // Before the error tint and the flash: on the cursor's line, those win.
      ".cm-activeLine": { backgroundColor: "var(--active-line)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--active-line)" },
      "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--bracket-match)" },
      "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--bracket-mismatch)" },
      ".cm-selectionMatch": { backgroundColor: "var(--selection-match)" },
      ".build-error-line": { backgroundColor: "var(--error-bg)" },
      // The tint is not the only cue: a wavy underline under the failing token and a dot
      // in the lint gutter. Lint draws both as SVG data URIs with literal colours, which
      // cannot read a token, so CSS draws them instead.
      ".cm-lintRange-error": {
        backgroundImage: "none",
        textDecoration: "underline wavy var(--bad)",
        textDecorationSkipInk: "none",
        textUnderlineOffset: "3px",
      },
      ".cm-gutter-lint": { width: "1.2em" },
      ".cm-lint-marker-error": {
        content: "normal",
        width: "0.7em",
        height: "0.7em",
        margin: "0.15em",
        borderRadius: "50%",
        backgroundColor: "var(--bad)",
      },
      // The fade is the editor-flash-fade keyframes in styles/app.css, which read --line-flash.
      [`.${FLASH_LINE_CLASS}`]: {
        backgroundColor: "var(--line-flash)",
        animation: "editor-flash-fade 1.8s ease-in forwards",
      },
      "@media (prefers-reduced-motion: reduce)": {
        // Shown whole, then gone, with no fade between.
        [`.${FLASH_LINE_CLASS}`]: { animationTimingFunction: "steps(1, end)" },
      },

      ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--ink)" },
      ".cm-panels-top": { borderBottom: "1px solid var(--line)" },
      ".cm-panels-bottom": { borderTop: "1px solid var(--line)" },
      // The find bar and the go-to-line box (a .cm-dialog panel) look alike.
      ".cm-search, .cm-goto-line": { font: "var(--text-editor)/1.5 var(--font-mono)" },
      ".cm-search input, .cm-search button, .cm-goto-line input, .cm-goto-line button": { font: "inherit" },
      ".cm-search .cm-textfield, .cm-goto-line .cm-textfield": {
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
      },
      ".cm-search .cm-button, .cm-goto-line .cm-button": {
        backgroundImage: "none",
        backgroundColor: "var(--paper)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
      },
      ".cm-search label, .cm-goto-line label": { color: "var(--muted)" },
      ".cm-searchMatch": { backgroundColor: "var(--selection)" },
      ".cm-searchMatch-selected": { backgroundColor: "var(--selection)", outline: "1px solid var(--syntax-constant)" },

      ".cm-tooltip": {
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "0 8px 20px var(--shadow)",
      },
      ".cm-tooltip-lint": { maxWidth: "min(36rem, calc(100vw - 1rem))" },
      ".cm-diagnostic": { fontFamily: "var(--font-mono)", fontSize: "var(--text-editor)" },
      ".cm-diagnostic-error": { borderLeft: "4px solid var(--bad)" },
      ".cm-tooltip.cm-tooltip-autocomplete": { minWidth: "14rem", maxWidth: "min(32rem, calc(100vw - 1rem))" },
      ".cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-editor)",
        maxHeight: "14rem",
      },
      ".cm-tooltip-autocomplete > ul > li": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.25rem 0.7rem",
        lineHeight: "1.5",
        color: "var(--ink)",
        cursor: "pointer",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--on-emphasis)",
      },
      ".cm-tooltip-autocomplete .cm-completionLabel": { overflow: "hidden", textOverflow: "ellipsis" },
      ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700" },
    },
    { dark },
  );
}

/** The colors of the tokens the LaTeX mode names, from the syntax tokens. */
function tokens(): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: "var(--syntax-comment)" },
      { tag: [tags.tagName, tags.standard(tags.variableName)], color: "var(--syntax-command)" },
      { tag: tags.keyword, color: "var(--syntax-keyword)" },
      {
        tag: [
          tags.atom,
          tags.number,
          tags.definition(tags.variableName),
          tags.attributeName,
          tags.propertyName,
          tags.meta,
        ],
        color: "var(--syntax-constant)",
      },
      { tag: [tags.variableName, tags.special(tags.variableName), tags.typeName], color: "var(--syntax-variable)" },
      { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
      { tag: tags.bracket, color: "var(--ink)" },
      { tag: tags.invalid, color: "var(--syntax-invalid-fg)", backgroundColor: "var(--syntax-invalid-bg)" },
    ]),
  );
}

/**
 * The editor's look for one theme. Swapped as a whole through a Compartment
 * when the app's theme changes. The class on the editor root names the theme,
 * which the tests read.
 */
export function editorTheme(dark: boolean): Extension {
  return [
    chrome(dark),
    tokens(),
    EditorView.editorAttributes.of({ class: dark ? "cm-github-dark" : "cm-github-light" }),
  ];
}

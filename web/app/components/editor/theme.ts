import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { FLASH_LINE_CLASS } from "./flash-line.ts";

/** The GitHub colors of one theme, for the editor's chrome and for the tokens stex finds. */
interface Palette {
  background: string;
  ink: string;
  gutterInk: string;
  gutterLine: string;
  selection: string;
  comment: string;
  /** \commands and builtins */
  command: string;
  keyword: string;
  /** numbers, atoms, definitions, attributes, meta */
  constant: string;
  /** variables and types */
  variable: string;
  string: string;
  errorInk: string;
  errorBackground: string;
  /** the line a jump from the PDF lands on */
  flash: string;
}

const LIGHT: Palette = {
  background: "#fff",
  ink: "#1f2328",
  gutterInk: "#8c959f",
  gutterLine: "#d1d9e0",
  selection: "rgba(84, 174, 255, .25)",
  comment: "#6e7781",
  command: "#8250df",
  keyword: "#cf222e",
  constant: "#0550ae",
  variable: "#953800",
  string: "#0a3069",
  errorInk: "#f6f8fa",
  errorBackground: "#82071e",
  flash: "rgba(255, 200, 0, .5)",
};

const DARK: Palette = {
  background: "#0d1117",
  ink: "#c9d1d9",
  gutterInk: "#6e7681",
  gutterLine: "#30363d",
  selection: "rgba(56, 139, 253, .35)",
  comment: "#8b949e",
  command: "#d2a8ff",
  keyword: "#ff7b72",
  constant: "#79c0ff",
  variable: "#ffa657",
  string: "#a5d6ff",
  errorInk: "#f0f6fc",
  errorBackground: "#8e1519",
  flash: "rgba(187, 128, 9, .5)",
};

const MONO = 'ui-monospace, "Liberation Mono", monospace';

/**
 * The editor's chrome: page colors, gutter, cursor, selection, the find bar
 * and the completion list. The bars and the list draw from the app's own
 * custom properties, which follow the theme attribute by themselves.
 */
function chrome(palette: Palette, dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": { height: "100%", backgroundColor: palette.background, color: palette.ink, font: `13px/1.5 ${MONO}` },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit" },
      ".cm-content": { caretColor: palette.ink },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: palette.ink },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
        { background: palette.selection },
      ".cm-gutters": {
        backgroundColor: palette.background,
        color: palette.gutterInk,
        borderRight: `1px solid ${palette.gutterLine}`,
      },
      ".build-error-line": { backgroundColor: "var(--error-bg)" },
      // The fade is the editor-flash-fade keyframes in styles/app.css, which read --flash.
      [`.${FLASH_LINE_CLASS}`]: {
        "--flash": palette.flash,
        backgroundColor: "var(--flash)",
        animation: "editor-flash-fade 1.8s ease-in forwards",
      },
      "@media (prefers-reduced-motion: reduce)": {
        // Shown whole, then gone, with no fade between.
        [`.${FLASH_LINE_CLASS}`]: { animationTimingFunction: "steps(1, end)" },
      },

      ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--ink)" },
      ".cm-panels-top": { borderBottom: "1px solid var(--line)" },
      ".cm-search": { font: `13px/1.5 ${MONO}` },
      ".cm-search input, .cm-search button": { font: "inherit" },
      ".cm-search .cm-textfield": {
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "4px",
      },
      ".cm-search .cm-button": {
        backgroundImage: "none",
        backgroundColor: "var(--paper)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "4px",
        cursor: "pointer",
      },
      ".cm-search label": { color: "var(--muted)" },
      ".cm-searchMatch": { backgroundColor: palette.selection },
      ".cm-searchMatch-selected": { backgroundColor: palette.selection, outline: `1px solid ${palette.constant}` },

      ".cm-tooltip": {
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "4px",
        boxShadow: "0 8px 20px var(--shadow)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete": { minWidth: "14rem", maxWidth: "min(32rem, calc(100vw - 1rem))" },
      ".cm-tooltip-autocomplete > ul": { fontFamily: MONO, fontSize: "12.5px", maxHeight: "14rem" },
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

/** The colors of the tokens the LaTeX mode names, as the editor's previous theme gave them. */
function tokens(palette: Palette): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: palette.comment },
      { tag: [tags.tagName, tags.standard(tags.variableName)], color: palette.command },
      { tag: tags.keyword, color: palette.keyword },
      {
        tag: [
          tags.atom,
          tags.number,
          tags.definition(tags.variableName),
          tags.attributeName,
          tags.propertyName,
          tags.meta,
        ],
        color: palette.constant,
      },
      { tag: [tags.variableName, tags.special(tags.variableName), tags.typeName], color: palette.variable },
      { tag: [tags.string, tags.special(tags.string)], color: palette.string },
      { tag: tags.bracket, color: palette.ink },
      { tag: tags.invalid, color: palette.errorInk, backgroundColor: palette.errorBackground },
    ]),
  );
}

/**
 * The editor's look for one theme. Swapped as a whole through a Compartment
 * when the app's theme changes. The class on the editor root names the theme,
 * which the tests read.
 */
export function editorTheme(dark: boolean): Extension {
  const palette = dark ? DARK : LIGHT;
  return [
    chrome(palette, dark),
    tokens(palette),
    EditorView.editorAttributes.of({ class: dark ? "cm-github-dark" : "cm-github-light" }),
  ];
}

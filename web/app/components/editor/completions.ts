import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import { isolateHistory } from "@codemirror/commands";
import { type Extension, Prec } from "@codemirror/state";
import { type EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { GLYPH_MANIFEST_PATH } from "../../../shared/build-plan.ts";
import {
  GLYPH_USAGE_PATH,
  glyphCompletions,
  glyphContext,
  missingBrace,
  parseGlyphManifest,
  parseGlyphUsage,
} from "../../../shared/glyph-completion.ts";
import { completionContext, imageCompletions } from "../../../shared/image-completion.ts";
import { REPO } from "../../modules/config.ts";
import { state as appState } from "../../modules/state.ts";

// Suggests what the cursor's argument in the .tex editor can hold, the way an
// IDE offers completions: uploaded image paths inside an image argument, and
// glyph names, with their pictures, right after \svg or inside \svg{...}.
// Which names, and in what order, is decided in shared/glyph-completion.ts and
// shared/image-completion.ts; this file only hands them to CodeMirror's list.
// The list opens a moment after the contributor types, deletes or pastes there
// (or at once on Ctrl-Space), narrows as they edit on, and takes arrows, Page
// Up/Down, Enter or Tab, Escape, or a click.

// Pause before a deletion or a paste opens the list, so fast editing does not
// flash it. Typing uses the library's own delay, which is the same.
const OPEN_DELAY_MS = 100;
// The most rows the list draws; CodeMirror's default of 100 would cut the glyph list short.
const MAX_ROWS = 1000;

/** What one suggestion draws besides its label. */
interface Decoration {
  /** the label's characters to mark */
  marked: number[];
  /** picture URL, or null for none */
  icon: string | null;
  /** picture URL for the dark theme, or null to draw `icon` there too */
  darkIcon: string | null;
}

// Keyed by the Completion the list holds, so the rows can be drawn from them.
const decorations = new WeakMap<Completion, Decoration>();

/** The glyph names and their use counts. */
interface GlyphCatalog {
  manifest: string[];
  usage: Record<string, number>;
}

/** Fetched on the first \svg the contributor types; shared by every request after it. */
let glyphsLoading: Promise<GlyphCatalog | null> | null = null;

/**
 * The glyph catalog, fetched once. Missing use counts leave every count at
 * zero; a missing manifest leaves glyph names unoffered, for good.
 */
function loadGlyphs(): Promise<GlyphCatalog | null> {
  if (glyphsLoading) return glyphsLoading;
  const fetchJson = async (path: string): Promise<unknown> => {
    const response = await fetch(`${REPO}/${path}`);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  };
  glyphsLoading = Promise.all([
    fetchJson(GLYPH_MANIFEST_PATH).then(parseGlyphManifest),
    fetchJson(GLYPH_USAGE_PATH)
      .then(parseGlyphUsage)
      .catch(() => ({})),
  ])
    .then(([manifest, usage]): GlyphCatalog => ({ manifest, usage }))
    .catch((error) => {
      console.warn("Glyph names are not available:", error);
      return null;
    });
  return glyphsLoading;
}

/** One list row: the label, and what a pick writes over the context's range. */
function suggestion(label: string, insert: string, decoration: Decoration): Completion {
  const completion: Completion = { label, apply: insert };
  decorations.set(completion, decoration);
  return completion;
}

/**
 * The offer for the cursor, or null when there is nothing to offer.
 *
 * @param context where completion was asked
 */
async function offerAt(context: CompletionContext): Promise<CompletionResult | null> {
  const { state, pos } = context;
  if (state.selection.ranges.some((range) => !range.empty)) return null;
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;

  const glyph = glyphContext(line.text, ch);
  if (glyph) {
    const catalog = await loadGlyphs();
    if (!catalog || context.aborted) return null;
    const glyphUrl = (name: string): string => `${REPO}/assets/glyphs/${encodeURIComponent(name)}.svg`;
    const options = glyphCompletions(catalog.manifest, catalog.usage, glyph.typed).map(({ name, indices, dark }) =>
      suggestion(name, `${glyph.open}${name}${glyph.close}`, {
        marked: indices,
        icon: glyphUrl(name),
        darkIcon: dark ? glyphUrl(dark) : null,
      }),
    );
    return result(line.from + glyph.from, line.from + glyph.to, options);
  }

  const image = completionContext(line.text, ch);
  if (image) {
    const typed = image.typed.toLowerCase();
    const options = imageCompletions(appState.uploadedFiles.keys(), image).map((path) => {
      const at = typed ? path.toLowerCase().indexOf(typed) : -1;
      return suggestion(path, path, {
        marked: at < 0 ? [] : Array.from(typed, (_, i) => at + i),
        icon: null,
        darkIcon: null,
      });
    });
    return result(line.from + image.from, line.from + image.to, options);
  }
  return null;
}

/** The list for a range. Not filtered: shared/ already ranked and narrowed it. */
function result(from: number, to: number, options: Completion[]): CompletionResult | null {
  if (!options.length) return null;
  return { from, to, options, filter: false, getMatch: (completion) => decorations.get(completion)?.marked ?? [] };
}

/** The picture or pictures a row draws: both, when there are two; app.css shows the theme's one. */
function renderIcons(completion: Completion): Node | null {
  const decoration = decorations.get(completion);
  if (!decoration?.icon) return null;
  const wrap = document.createElement("span");
  wrap.style.display = "contents";
  for (const [src, extra] of [
    [decoration.icon, ""],
    [decoration.darkIcon, " dark"],
  ] as const) {
    if (!src) continue;
    const image = document.createElement("img");
    image.className = `autocomplete-icon${extra}`;
    image.src = src;
    image.alt = "";
    image.loading = "lazy";
    wrap.append(image);
  }
  return wrap;
}

/**
 * Writes the braces around a name character typed straight after `\svg`,
 * so the list goes on narrowing as the contributor types the name. Its own
 * edit, isolated in the history, so one Ctrl-Z takes the braces back out.
 */
function addMissingBrace(view: EditorView): void {
  const { selection, doc } = view.state;
  if (selection.ranges.length !== 1 || !selection.main.empty) return;
  const line = doc.lineAt(selection.main.head);
  const brace = missingBrace(line.text, selection.main.head - line.from);
  if (!brace) return;
  view.dispatch({
    changes: { from: line.from + brace.from, to: line.from + brace.to, insert: brace.text },
    selection: { anchor: line.from + brace.cursor },
    // Still typing, so the list follows it.
    userEvent: "input.type.brace",
    annotations: isolateHistory.of("full"),
  });
}

/**
 * The editing the library does not cover: braces after `\svg`, and the list
 * opening on a deletion or a paste. Typing opens it by itself.
 */
const editHooks = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
    }

    update(update: ViewUpdate): void {
      const view = this.view;
      if (update.transactions.some((tr) => tr.isUserEvent("input.type") && !tr.isUserEvent("input.type.brace"))) {
        // After this edit's update, so the braces are an edit of their own.
        queueMicrotask(() => {
          if (view.dom.isConnected) addMissingBrace(view);
        });
      }
      if (update.transactions.some((tr) => tr.isUserEvent("delete") || tr.isUserEvent("input.paste"))) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          if (view.hasFocus && completionStatus(view.state) === null) startCompletion(view);
        }, OPEN_DELAY_MS);
      }
    }

    destroy(): void {
      clearTimeout(this.timer);
    }
  },
);

/** @returns the completion list, its sources and the edits that open it */
export function completions(): Extension {
  return [
    autocompletion({
      override: [offerAt],
      icons: false,
      maxRenderedOptions: MAX_ROWS,
      // A pick takes effect at once, as it did before; the library holds one back for 75 ms.
      interactionDelay: 0,
      addToOptions: [{ render: renderIcons, position: 20 }],
    }),
    // Only while the list is open: acceptCompletion declines otherwise, and Tab moves on to indent.
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
    editHooks,
  ];
}

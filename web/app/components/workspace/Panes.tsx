import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";
import { clampSplit, DEFAULT_SPLIT, parseSplit } from "../../../shared/split.ts";

export const SPLIT_KEY = "wasm-scenario-builder:split";

/** How far one arrow key moves the divider, in percent. */
const KEY_STEP = 2;

/** The narrowest a pane may get, in rem. Matches .pane's min-width. */
const MIN_PANE_REM = 20;

/** The saved split, or the default when there is none. */
function savedSplit(): number {
  try {
    return parseSplit(localStorage.getItem(SPLIT_KEY));
  } catch {
    return DEFAULT_SPLIT;
  }
}

function saveSplit(percent: number): void {
  try {
    localStorage.setItem(SPLIT_KEY, String(percent));
  } catch {
    // Private mode or blocked storage: the split just does not persist.
  }
}

/**
 * The source and PDF panes with the divider between them: drag, arrow keys,
 * Home/End and double-click to reset. The split is remembered across reloads.
 * The workspace is hidden at start-up, so there is no width to clamp against
 * yet; the CSS min-width holds both panes until the first interaction.
 */
export function Panes({ source, pdf }: { source: ReactNode; pdf: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(savedSplit);
  const current = useRef(split);
  const [resizing, setResizing] = useState(false);
  const dragging = useRef(false);

  /** Clamps a wanted split to the workspace's current width, then applies it. Returns the share applied. */
  const apply = (percent: number): number => {
    const box = main.current;
    const bar = divider.current;
    if (!box || !bar) return current.current;
    const minPx = MIN_PANE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const shared = box.getBoundingClientRect().width - bar.getBoundingClientRect().width;
    const applied = clampSplit(percent, shared, minPx);
    current.current = applied;
    setSplit(applied);
    return applied;
  };

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !main.current || !divider.current) return;
    const box = main.current.getBoundingClientRect();
    const half = divider.current.getBoundingClientRect().width / 2;
    apply(((event.clientX - box.left - half) / (box.width - 2 * half)) * 100);
  };

  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setResizing(false);
    saveSplit(current.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: current.current - KEY_STEP,
      ArrowRight: current.current + KEY_STEP,
      Home: 0,
      End: 100,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    apply(targets[event.key]);
    saveSplit(current.current);
  };

  return (
    <main
      ref={main}
      id="workspace-main"
      className={resizing ? "resizing" : undefined}
      style={{ "--split": split } as CSSProperties}
    >
      <section className="pane" id="editor-pane" aria-label="Source">
        <div className="editor-wrap">{source}</div>
      </section>

      {/* biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable separator, which <hr> is not */}
      <div
        ref={divider}
        className="pane-divider"
        id="pane-divider"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-controls="editor-pane"
        aria-label="Resize the source and PDF panes"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        title="Drag to resize. Double-click to reset."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          // The PDF embed would swallow the pointer while it crosses it.
          dragging.current = true;
          setResizing(true);
        }}
        onPointerMove={follow}
        onPointerUp={release}
        onPointerCancel={release}
        onDoubleClick={() => {
          apply(DEFAULT_SPLIT);
          saveSplit(current.current);
        }}
        onKeyDown={onKeyDown}
      />

      {pdf}
    </main>
  );
}

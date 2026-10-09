import { useEffect, useRef } from "react";
import { attachPdfPane, emptyMessage } from "../../pdf/view.ts";
import { type PdfPaneContent, useAppStore } from "../../store.ts";
import { ErrorPanel } from "./ErrorPanel.tsx";

/** What the pane says in place of the pages: nothing built yet, a message, or the loading spinner with its caption. */
function Placeholder({ content }: { content: PdfPaneContent }) {
  if (content.kind === "pages") return null;
  if (content.kind === "loading") {
    return (
      <div className="empty-pdf loading">
        <span className="spinner big" />
        <p>{content.text}</p>
      </div>
    );
  }
  return (
    <div className="empty-pdf" id="pdf-empty">
      {content.kind === "empty" ? emptyMessage() : content.text}
    </div>
  );
}

/**
 * The PDF pane: the build's progress bar and step over the pages, the pages
 * themselves, and the error panel under them. pdf/view.ts draws the pages
 * into the host element, which React never gives children, so a re-render
 * leaves the canvases (and the reader's place on them) alone.
 */
export function PdfView() {
  const content = useAppStore((s) => s.pdfPane);
  const building = useAppStore((s) => s.building);
  const phase = useAppStore((s) => s.buildPhase);
  const body = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!body.current || !pages.current) return;
    return attachPdfPane(body.current, pages.current);
  }, []);

  return (
    <section className="pane" id="pdf-pane" aria-label="PDF">
      <div className="pdf-pane-body-wrap" id="pdf-wrap">
        <div
          className="build-progress"
          id="build-progress"
          role="progressbar"
          aria-label="Building the PDF"
          hidden={!building}
        />
        {/* The build's current step, short, where the reader is looking. The status
            bar carries the full text, so screen readers skip this copy. */}
        <div className="build-phase" id="build-phase" aria-hidden="true" hidden={!building}>
          <span className="spinner" />
          <span id="build-phase-text">{phase}</span>
        </div>
        <div className="pdf-pane-body" id="pdf-body" ref={body}>
          <Placeholder content={content} />
          <div ref={pages} className="contents" />
        </div>
      </div>
      <ErrorPanel />
    </section>
  );
}

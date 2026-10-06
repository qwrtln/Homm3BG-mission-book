import { showsStale, staleMessage } from "../../modules/status.ts";
import { setZoom, stepZoom, zoomLimits } from "../../pdf/view.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";

/**
 * One bar under both panes: the status on the left, the shown PDF's page
 * count and zoom on the right.
 */
export function StatusBar() {
  const status = useAppStore((s) => s.status);
  const stale = useAppStore(showsStale);
  const showing = useAppStore((s) => s.pdfPane.kind === "pages");
  const pageCount = useAppStore((s) => s.pdfPageCount);
  const zoom = useAppStore((s) => s.pdfZoom);
  const limits = zoomLimits(zoom);

  return (
    <footer className="status-bar" id="status-bar">
      <span className="spinner" id="status-spinner" hidden={!status.spinning} />
      <span id="status-text" className={stale ? "" : status.tone}>
        {stale ? staleMessage() : status.text}
      </span>
      <div className="pdf-controls" id="pdf-controls" hidden={!showing}>
        <span className="pdf-page-count" id="pdf-page-count">
          {pageCount === 1 ? "1 page" : `${pageCount} pages`}
        </span>
        <div className="pdf-zoom-controls" role="toolbar" aria-label="Zoom">
          <Button
            id="pdf-zoom-out"
            size="compact"
            className="min-w-8 tabular-nums"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={limits.min}
            onClick={() => stepZoom(-1)}
          >
            −
          </Button>
          <Button
            id="pdf-zoom-level"
            size="compact"
            className="min-w-15 tabular-nums"
            title="Fit to width"
            onClick={() => setZoom(1)}
          >
            {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </Button>
          <Button
            id="pdf-zoom-in"
            size="compact"
            className="min-w-8 tabular-nums"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={limits.max}
            onClick={() => stepZoom(1)}
          >
            +
          </Button>
        </div>
      </div>
    </footer>
  );
}

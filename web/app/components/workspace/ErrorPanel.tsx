import { jumpToLine } from "../../pdf/view.ts";
import { useAppStore } from "../../store.ts";

/**
 * The failed build's first error, and its full log. With an error line the
 * message is a button that jumps the editor there.
 */
export function ErrorPanel() {
  const error = useAppStore((s) => s.buildError);
  const line = error?.errorLine ?? null;

  return (
    <div className="error-panel" id="error-panel" hidden={error === null}>
      <div className="first-error" id="first-error">
        {error !== null &&
          (line === null ? (
            error.firstError
          ) : (
            <button
              type="button"
              className="error-jump"
              title={`Go to line ${line} in the editor`}
              onClick={() => jumpToLine(line)}
            >
              <span className="error-jump-line">Line {line}</span>
              {error.firstError}
            </button>
          ))}
      </div>
      {/* Keyed by the error, so every new error's log folds shut again. */}
      <details className="full-log" id="full-log-details" key={error?.id}>
        <summary>Show the full log</summary>
        <pre id="full-log">{error?.log}</pre>
      </details>
    </div>
  );
}

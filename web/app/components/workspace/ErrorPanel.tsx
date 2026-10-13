import { useState } from "react";
import { jumpToLine } from "../../pdf/view.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";

/** The failed build's full log, folded shut until the reader opens it. */
function FullLog({ log }: { log: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure id="full-log-details" className="mt-2.5" summary="Show the full log" open={open} onToggle={setOpen}>
      <pre
        id="full-log"
        className="mx-0 mt-2 mb-0 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-code-bg p-[0.7rem] font-mono text-code leading-normal"
      >
        {log}
      </pre>
    </Disclosure>
  );
}

/**
 * The failed build's first error, and its full log. With an error line the
 * message is a button that jumps the editor there.
 */
export function ErrorPanel() {
  const error = useAppStore((s) => s.buildError);
  const line = error?.errorLine ?? null;

  return (
    <div className="error-panel" id="error-panel" hidden={error === null}>
      <div className="break-words whitespace-pre-wrap font-mono text-bad text-editor leading-normal" id="first-error">
        {error !== null &&
          (line === null ? (
            error.firstError
          ) : (
            <Button
              variant="plain"
              className="error-jump block w-full whitespace-pre-wrap text-left font-mono text-editor leading-normal"
              title={`Go to line ${line} in the editor`}
              onClick={() => jumpToLine(line)}
            >
              <span className="error-jump-line mr-2.5 inline-block rounded-sm border border-bad px-1.5 font-semibold">
                Line {line}
              </span>
              {error.firstError}
            </Button>
          ))}
      </div>
      {/* Keyed by the error, so every new error's log folds shut again. */}
      <FullLog key={error?.id} log={error?.log} />
    </div>
  );
}

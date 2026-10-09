import type { ReactNode } from "react";

/** What every pane component takes: whether it is the one shown. */
export interface PaneProps {
  hidden: boolean;
}

/** One pane's frame. Every pane stays in the page, the shown one aside hidden, so each keeps its ids. */
export function Pane({ id, hidden, children }: { id: string; hidden: boolean; children: ReactNode }) {
  return (
    <div className="wizard-pane" id={`wizard-pane-${id}`} hidden={hidden}>
      {children}
    </div>
  );
}

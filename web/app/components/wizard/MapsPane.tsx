import { MAX_MAP_FILES } from "../../../shared/upload-names.ts";
import { MAP_EDITOR_URL } from "../../modules/upload-panel.ts";
import { Link } from "../ui/Link.tsx";
import { UploadPanel } from "../uploads/UploadPanel.tsx";
import { Pane, type PaneProps } from "./Pane.tsx";

const MAPS_HINT = `PNG only, up to ${MAX_MAP_FILES}. Drop them here, or add them.`;

/** Pane 12: the map layouts. */
export function MapsPane({ hidden }: PaneProps) {
  return (
    <Pane id="maps" hidden={hidden}>
      <h3>Map images</h3>
      <p className="hint">
        PNG exported from the{" "}
        <Link href={MAP_EDITOR_URL} external>
          map editor
        </Link>
        , up to {MAX_MAP_FILES}. Add one image for the whole Scenario, or one per player-count layout and tick the
        counts it is for.
      </p>
      <UploadPanel panel="wizard" show="maps" headerHint={null} mapsHint={MAPS_HINT} />
    </Pane>
  );
}

import { type ReactNode, useRef } from "react";
import { MAX_PLAYERS, normalizeMapCode } from "../../../shared/upload-names.ts";
import {
  addHeaderFile,
  addMapFiles,
  commitHeaderName,
  commitMapCode,
  commitMapName,
  mapRenameValue,
  removeHeader,
  removeMap,
  renameHeader,
  renameMap,
  setMapCode,
  toggleMapCount,
} from "../../modules/upload-panel.ts";
import { type MapUpload, type UploadPanelId, type UploadStatus, useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Checkbox } from "../ui/Checkbox.tsx";
import { useFileDrops } from "./useFileDrops.ts";

/** The element ids, field classes and labelling each place that draws a panel gives it. */
const LOOK: Record<UploadPanelId, { prefix: string; field: string; status: string }> = {
  dialog: { prefix: "upload", field: "upload-field", status: "upload-status" },
  wizard: { prefix: "wizard", field: "wizard-field wizard-upload", status: "wizard-status" },
};

export interface UploadPanelProps {
  panel: UploadPanelId;
  /** Which fields to draw: the dialog draws both, the wizard one in each of two panes. */
  show?: "header" | "maps" | "both";
  headerHint: ReactNode;
  mapsHint: ReactNode;
  /** Whether a layout offers the map editor's save string. */
  mapCodes?: boolean;
}

/** A field's status line: its hint, or why the last pick was refused. */
function Status({
  id,
  className,
  status,
  hint,
}: {
  id: string;
  className: string;
  status: UploadStatus;
  hint: ReactNode;
}) {
  return (
    <span id={id} className={`${className}${status.kind === "hint" ? "" : " bad"}`}>
      {status.kind === "hint" && hint}
      {status.kind === "text" && status.text}
      {status.kind === "mapCode" && (
        <>
          A map editor save string is one line of letters, digits, <code>+</code>, <code>/</code> and <code>=</code>.
          Paste it again.
        </>
      )}
    </span>
  );
}

function HeaderField({ panel, headerHint }: { panel: UploadPanelId; headerHint: ReactNode }) {
  const { prefix, field, status } = LOOK[panel];
  const header = useAppStore((s) => s.uploadPanels[panel].header);
  const headerName = useAppStore((s) => s.uploadPanels[panel].headerName);
  const headerStatus = useAppStore((s) => s.uploadPanels[panel].headerStatus);
  const input = useRef<HTMLInputElement>(null);
  const drops = useFileDrops((files) => void addHeaderFile(panel, files[0]));

  return (
    <div className={`${field}${drops.over ? " drop-target" : ""}`} id={`${prefix}-header-field`} {...drops.handlers}>
      {panel === "dialog" && <label htmlFor={`${prefix}-header`}>Header image</label>}
      <input
        ref={input}
        type="file"
        id={`${prefix}-header`}
        {...(panel === "wizard" ? { "aria-labelledby": "wizard-header-label" } : {})}
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        hidden
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          event.target.value = ""; // so the same picker can add the next file
          void addHeaderFile(panel, file);
        }}
      />
      <div className="upload-card" id={`${prefix}-header-card`} hidden={header === null}>
        <div className="upload-card-body">
          <div className="upload-card-head">
            <span className="upload-card-title">Header</span>
            <span className="orig-name" id={`${prefix}-header-orig`}>
              {header?.originalName ?? ""}
            </span>
            <button
              type="button"
              id={`${prefix}-header-remove`}
              className="upload-remove"
              aria-label="Remove header image"
              title="Remove the header image"
              onClick={() => removeHeader(panel)}
            >
              ×
            </button>
          </div>
          <input
            type="text"
            id={`${prefix}-header-name`}
            className="upload-rename"
            placeholder="target filename"
            aria-label="Header image target filename"
            value={headerName}
            onChange={(event) => renameHeader(panel, event.target.value)}
            onBlur={() => commitHeaderName(panel)}
          />
        </div>
        <img
          className="upload-preview"
          id={`${prefix}-header-preview`}
          // biome-ignore lint/a11y/noRedundantAlt: the preview has always carried this name
          alt="Header image preview"
          src={header?.preview}
        />
      </div>
      <Button id={`${prefix}-header-add`} onClick={() => input.current?.click()}>
        {header ? "Replace header image" : "+ Add header image"}
      </Button>
      <Status id={`${prefix}-header-status`} className={status} status={headerStatus} hint={headerHint} />
    </div>
  );
}

/** One layout's card: its name, the player counts it is for and, in the dialog, the map editor's save string. */
function MapRow({
  panel,
  item,
  index,
  mapCodes,
}: {
  panel: UploadPanelId;
  item: MapUpload;
  index: number;
  mapCodes: boolean;
}) {
  const n = index + 1;
  const badCode = normalizeMapCode(item.mapCode) === null;

  return (
    <div className="upload-card upload-map" data-index={index}>
      <div className="upload-card-body">
        <div className="upload-card-head">
          <span className="upload-card-title">Layout {n}</span>
          <span className="orig-name">{item.originalName}</span>
          <button
            type="button"
            className="upload-remove"
            aria-label={`Remove layout ${n}`}
            title="Remove this layout"
            onClick={() => removeMap(panel, index)}
          >
            ×
          </button>
        </div>
        <input
          type="text"
          className="upload-rename"
          aria-label={`Target filename for layout ${n}`}
          value={mapRenameValue(panel, item)}
          onChange={(event) => renameMap(panel, index, event.target.value)}
          onBlur={() => commitMapName(panel, index)}
        />
        <fieldset className="upload-players">
          <legend>Players</legend>
          {Array.from({ length: MAX_PLAYERS }, (_, k) => k + 1).map((count) => (
            <Checkbox
              key={count}
              className="upload-player"
              align="center"
              value={count}
              label={String(count)}
              checked={item.counts.includes(count)}
              onChange={(event) => toggleMapCount(panel, index, count, event.target.checked)}
            />
          ))}
        </fieldset>
        {mapCodes && (
          <label className="upload-mapfile">
            <span>
              Map editor string <span className="optional">(optional)</span>
            </span>
            <input
              type="text"
              className="upload-mapfile-input"
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste the string the map editor exports"
              aria-label={`Map editor string for layout ${n}`}
              value={item.mapCode}
              aria-invalid={badCode ? "true" : undefined}
              onChange={(event) => setMapCode(panel, index, event.target.value)}
              onBlur={() => commitMapCode(panel, index)}
            />
          </label>
        )}
      </div>
      <img className="upload-preview" src={item.preview} alt={`Layout ${n} preview`} />
    </div>
  );
}

function MapsField({ panel, mapsHint, mapCodes }: { panel: UploadPanelId; mapsHint: ReactNode; mapCodes: boolean }) {
  const { prefix, field, status } = LOOK[panel];
  const maps = useAppStore((s) => s.uploadPanels[panel].maps);
  const mapsStatus = useAppStore((s) => s.uploadPanels[panel].mapsStatus);
  const input = useRef<HTMLInputElement>(null);
  const drops = useFileDrops((files) => void addMapFiles(panel, files));

  return (
    <div className={`${field}${drops.over ? " drop-target" : ""}`} id={`${prefix}-maps-field`} {...drops.handlers}>
      {panel === "dialog" && <label htmlFor={`${prefix}-maps`}>Map images</label>}
      <input
        ref={input}
        type="file"
        id={`${prefix}-maps`}
        {...(panel === "wizard" ? { "aria-label": "Map images" } : {})}
        accept=".png,image/png"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = ""; // so the same picker adds the next layout
          void addMapFiles(panel, files);
        }}
      />
      <div className="upload-rename-list" id={`${prefix}-maps-names`} hidden={maps.length === 0}>
        {maps.map((item, index) => (
          <MapRow key={item.preview} panel={panel} item={item} index={index} mapCodes={mapCodes} />
        ))}
      </div>
      <Button id={`${prefix}-maps-add`} onClick={() => input.current?.click()}>
        {maps.length ? "+ Add another map image" : "+ Add map image"}
      </Button>
      <Status id={`${prefix}-maps-status`} className={status} status={mapsStatus} hint={mapsHint} />
    </div>
  );
}

/**
 * One header image and up to six map layouts, each a card with its preview,
 * the name it is staged under and, for a map, the player counts it is for.
 * Files come from the Add button's file picker or are dropped on the field.
 * The header's dialog draws both fields; the wizard draws one in each of two
 * panes. Every action is in modules/upload-panel.ts.
 */
export function UploadPanel({ panel, show = "both", headerHint, mapsHint, mapCodes = false }: UploadPanelProps) {
  return (
    <>
      {show !== "maps" && <HeaderField panel={panel} headerHint={headerHint} />}
      {show !== "header" && <MapsField panel={panel} mapsHint={mapsHint} mapCodes={mapCodes} />}
    </>
  );
}

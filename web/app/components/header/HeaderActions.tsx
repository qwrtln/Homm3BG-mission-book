import { downloadPdf, downloadPng, toggleBuild } from "../../modules/build.js";
import { registerBuildButton } from "../../modules/build-button.ts";
import { openUploadDialog } from "../../modules/uploads.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { MenuItem, MenuList } from "../ui/Menu.tsx";
import { useMenu } from "../ui/useMenu.ts";
import { DownloadIcon, ImageIcon, PlayIcon, StopIcon } from "./icons.tsx";
import { LABEL, NARROW, SEGMENT } from "./narrow.ts";

/** Build, which turns into Stop while a build runs. */
function BuildButton() {
  const building = useAppStore((s) => s.building);
  const disabled = useAppStore((s) => s.buildDisabled);
  const idleTitle = useAppStore((s) => s.buildIdleTitle);
  const minWidth = useAppStore((s) => s.buildMinWidth);

  return (
    <Button
      ref={registerBuildButton}
      id="build"
      variant={building ? "stop" : "primary"}
      size="compact"
      iconed
      className={`rounded-r-none ${SEGMENT} ${NARROW} ${building ? "stop" : ""}`}
      disabled={disabled}
      title={building ? "Stop the build" : idleTitle}
      style={minWidth === null ? undefined : { minWidth }}
      onClick={toggleBuild}
    >
      {building ? <StopIcon className="stop-icon" /> : <PlayIcon className="build-icon" />}
      <span id="build-label" className={LABEL}>
        {building ? "Stop" : "Build PDF"}
      </span>
    </Button>
  );
}

/** Download, with its menu of formats. It goes icon-only first, below 1024px. */
function DownloadMenu() {
  const disabled = useAppStore((s) => s.downloadDisabled);
  const menu = useMenu();

  return (
    <span className="relative -ml-px inline-flex items-stretch">
      <Button
        id="download"
        variant="withIcon"
        size="compact"
        className={`rounded-l-none ${SEGMENT} max-[1023px]:px-2`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-controls="download-menu"
        {...menu.toggleProps}
      >
        <DownloadIcon />
        <span className="label max-[1023px]:sr-only">Download</span>
      </Button>
      <MenuList id="download-menu" label="Download" open={menu.open} {...menu.menuProps}>
        <MenuItem id="download-pdf" onClick={downloadPdf}>
          PDF
        </MenuItem>
        <MenuItem id="download-png" onClick={downloadPng}>
          PNG
        </MenuItem>
      </MenuList>
    </span>
  );
}

/**
 * Build and Download as one group, then Upload images. Shown once a
 * scenario's workspace is up; before that the group stays in the page,
 * hidden, with Build and Download disabled.
 */
export function HeaderActions() {
  const visible = useAppStore((s) => s.actionsVisible);

  return (
    <div id="header-actions" hidden={!visible} className={`items-center gap-3 ${visible ? "flex" : ""}`}>
      <span className="inline-flex items-stretch">
        <BuildButton />
        <DownloadMenu />
      </span>
      <Button id="upload-open" variant="withIcon" size="compact" className={NARROW} onClick={openUploadDialog}>
        <ImageIcon />
        <span className={LABEL}>Upload images</span>
      </Button>
    </div>
  );
}

// Ambient declarations for what the app hangs off the global scope: the probe
// hooks app/main.tsx and the editor install for the integration tests.

interface Window {
  /** Reads back where the last save landed. Used by the integration tests. */
  __lastSaveTarget?: () => SaveTarget | null;
  /** The store's current state. Installed by app/main.tsx for the integration tests. */
  __state?: import("../app/store.ts").StoreState;
  /** The source editor, with the reads tier 2 needs. Installed by the editor on mount. */
  __editor?: import("../app/modules/editor-api.ts").EditorProbe;
  /** The local-store functions the integration tests seed and read. Installed by app/main.tsx. */
  __localStore?: Pick<
    typeof import("../app/modules/local-store.ts"),
    "listRecords" | "loadRecord" | "saveText" | "saveUploads" | "setBaseSha"
  >;
}

interface Navigator {
  /** Not in lib.dom.d.ts yet; Chromium's replacement for navigator.platform. */
  userAgentData?: { platform: string };
}

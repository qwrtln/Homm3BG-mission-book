import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { WizardAnswers } from "../shared/scenario-wizard.ts";
import type { Baseline } from "../shared/unsaved.ts";
import type { BusyTexRunner } from "../shared/vendor/texlyre-busytex.js";
import { initialWizardFields, type WizardFields } from "../shared/wizard-fields.ts";

/** The app's shared fields, read and written by the modules through the `state` facade in modules/state.ts. */
export interface AppState {
  entries: ScenarioEntry[];
  chosenPath: string | null;
  chosenTitle: string;
  building: boolean;
  runner: BusyTexRunner | null;
  lastPdf: Blob | null;
  /** The editor source lastPdf was made from; null when no PDF is shown. */
  pdfSource: string | null;
  /** The uploadsSignature of the in-app build lastPdf came from; null for a published PDF or none. */
  pdfUploads: string | null;
  /** Repository path of the scenario lastPdf shows; names its download. */
  pdfPath: string | null;
  /** Whether the pane drops lastPdf's last page (a published PDF's feedback page). */
  pdfDropsLastPage: boolean;
  /** Repository path -> the bytes a contributor added from their own machine. */
  uploadedFiles: Map<string, Uint8Array>;
  /** The pending autosave's timer id, from the DOM's setTimeout. */
  saveTimer: number | null;
  scenarioPrefetch: ScenarioPrefetch | null;
  /** What "nothing to save" looks like for the open scenario; null when none is open. */
  clean: Baseline | null;
}

/**
 * Where the last save or resumed draft landed: what "Save again" pushes to
 * and "Open PR" opens against.
 *
 * `edit` is set while a member is editing an existing scenario in place, and
 * `startOver` there means the first save must reset the branch to the default
 * branch. The save that does it clears it, so later saves build on top.
 *
 * `committedUploads` holds the upload paths the branch carries: a resumed
 * draft's assets, then whatever the last save pushed. One missing from the
 * uploads dialog at the next save was dropped or renamed, and comes off the
 * branch.
 *
 * `saving` is true while a save is on its way to GitHub.
 */
export interface SaveState {
  lastSaveTarget: SaveTarget | null;
  edit: { startOver: boolean } | null;
  committedUploads: Set<string>;
  saving: boolean;
}

/** The dialogs the header opens. */
export type DialogName = "about" | "help" | "feedback" | "upload";

/** What a confirmation asks, as confirmAction() takes it. */
export interface ConfirmOptions {
  title: string;
  message: string;
  warning: string;
  okLabel: string;
  cancelLabel?: string;
  danger: boolean;
}

/** A pending confirmation: its question, and the promise's resolver. */
export interface ConfirmRequest {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/** One notice. `id` changes with every notice, so showing the same text twice restarts the timer. */
export interface ToastNotice {
  id: number;
  message: string;
  tone: "ok" | "bad";
}

/** What the header renders from. The modules that open, build and save write it; the header components read it. */
export interface HeaderState {
  theme: "dark" | "light";
  /** Whether a GitHub token is held: the sign-in button, or the save controls and Sign out. */
  signedIn: boolean;
  /** Whether the header names the open scenario (with Save) instead of the app. */
  scenarioHeaderVisible: boolean;
  /** Whether Build, Download and Upload images show: a scenario is open and its workspace is up. */
  actionsVisible: boolean;
  /** Whether a scenario waits behind the welcome screen, so "Back to editing" shows. */
  parked: boolean;
  buildDisabled: boolean;
  /** The idle Build button's title, naming the build key for this platform. Empty until initBuildTitle() runs. */
  buildIdleTitle: string;
  /** The Build button's width while it reads "Stop", pinned so a shrinking button does not slide its neighbours; null when idle. */
  buildMinWidth: number | null;
  downloadDisabled: boolean;
  /** Whether the open scenario shows a locally saved copy, not the original source. */
  draftNote: boolean;
  /** Whether the open scenario differs from its last clean state; the note also needs a sign-in. */
  dirty: boolean;
  /** The category select stays locked until the first text is in the editor: a move now would carry the previous text. */
  categoryHold: boolean;
  /** Why the last category move was refused; null when there is nothing to say. */
  categoryNote: string | null;
  /** Whether "Open PR" shows beside Save. */
  openPrVisible: boolean;
  /** The pull request "View PR" links to; null while there is none. */
  prUrl: string | null;
  /** True while the pull request is being opened. */
  openingPr: boolean;
}

/** What React components render from; the old modules reach it through the dialog helpers below. */
export interface UiState extends HeaderState {
  /** Which of the menu's dialogs are open. Independent, so Help can open over About. */
  dialogs: Record<DialogName, boolean>;
  confirm: ConfirmRequest | null;
  toast: ToastNotice | null;
}

/**
 * The welcome screen's picker: what to search for, what is picked, and where
 * it is filed. `components/welcome/*` render from it; `modules/picker.ts`
 * writes it for the modules not yet migrated (github/resume.ts's edit flow).
 */
export interface PickerState {
  /** Whether the signed-in contributor can edit existing scenarios, not only add new ones. */
  isMember: boolean;
  /** "new" starts a fresh scenario; "edit" changes one in place (members only). */
  pickerMode: "new" | "edit";
  /** The current pick's repository path — a real entry or a blank template; null until something is picked. */
  pendingPath: string | null;
  /** What the picked row showed, mirrored into the search box. */
  pendingTitle: string;
  /** Where a new scenario is filed; null until chosen. */
  chosenCategory: string | null;
  /** True while opening an edit pick disables "Open editor". */
  pickerBusy: boolean;
  /** An error from opening an edit pick, shown in go-hint until the next pick or mode change. */
  pickerError: string | null;
  /** Set when the scenario list failed to load; shown in the search dropdown. */
  entriesError: string | null;
}

/** The two places that draw an upload panel: the header's dialog, and the start wizard's panes. */
export type UploadPanelId = "dialog" | "wizard";

/**
 * One file a contributor added from their own machine, before and after it
 * is staged at a repository path.
 */
export interface PendingUpload {
  bytes: Uint8Array;
  /** The filename as chosen on their machine. */
  originalName: string;
  /** Where the build sees it; null until staged. */
  path: string | null;
  /** Object URL of the bytes, for the thumbnail; revoked with the upload. */
  preview: string;
}

/**
 * A map layout: its image, the player counts it is for, and the map editor's
 * optional save string, which travels as a .map file under the same name.
 */
export interface MapUpload extends PendingUpload {
  /** The player counts ticked, ascending. */
  counts: number[];
  /** The name the contributor typed, or null to derive it from the counts. */
  customName: string | null;
  /** What the rename box shows while it has focus; null shows the staged name. */
  renameText: string | null;
  mapCode: string;
  mapFilePath: string | null;
}

/** What a field's status line says: its hint, or why the last pick was refused. Anything but the hint reads as a problem. */
export type UploadStatus = { kind: "hint" } | { kind: "text"; text: string } | { kind: "mapCode" };

/** One panel's header image and map layouts, as `components/uploads/` draws them. */
export interface UploadPanelState {
  header: PendingUpload | null;
  /** The header's rename box. */
  headerName: string;
  /** What the rename box was last filled with from the scenario's name. */
  headerAutoName: string;
  headerStatus: UploadStatus;
  maps: MapUpload[];
  mapsStatus: UploadStatus;
}

/**
 * The start wizard: where it is, and what it holds. `components/wizard/*`
 * render from it; `modules/wizard.ts` writes it.
 */
export interface WizardState {
  /** Whether the wizard shows in place of the copy-or-blank picker. */
  open: boolean;
  /** Whether the panes hold a run that switching away keeps for later. */
  started: boolean;
  current: number;
  /** The furthest pane shown in this run; the panes past it hold only their defaults. */
  furthest: number;
  creating: boolean;
  /** Why the last attempt to make the scenario failed. */
  error: string | null;
  /** What the passed panes answered; a skipped pane has no fields here. */
  answers: Partial<WizardAnswers>;
  fields: WizardFields;
}

export interface WizardUiState {
  wizard: WizardState;
  uploadPanels: Record<UploadPanelId, UploadPanelState>;
}

export type StoreState = AppState & SaveState & UiState & PickerState & WizardUiState;

/** A panel with nothing staged. */
export function initialUploadPanel(): UploadPanelState {
  return {
    header: null,
    headerName: "",
    headerAutoName: "",
    headerStatus: { kind: "hint" },
    maps: [],
    mapsStatus: { kind: "hint" },
  };
}

/** A wizard nobody has opened. */
export function initialWizard(): WizardState {
  return {
    open: false,
    started: false,
    current: 0,
    furthest: 0,
    creating: false,
    error: null,
    answers: {},
    fields: initialWizardFields(),
  };
}

/** The state a fresh page starts from. */
export function initialState(): StoreState {
  return {
    entries: [], // every scenario the search can offer (mission + draft, not templates)
    chosenPath: null, // path of the entry currently loaded in the editor
    chosenTitle: "",
    building: false,
    runner: null,
    lastPdf: null,
    pdfSource: null, // the editor source lastPdf was made from
    pdfUploads: null, // the uploadsSignature of the in-app build lastPdf came from
    pdfPath: null, // the scenario lastPdf shows, which names its download
    pdfDropsLastPage: false, // whether the pane drops lastPdf's last page

    // Files a contributor added from their own machine, not the repository: a
    // new header image or new map art the scenario does not have committed
    // yet. Keyed by the repository path the build should see them at, so a
    // build both fetches around them and prefers them outright when a path
    // collides with a real repo file.
    uploadedFiles: new Map(), // path -> Uint8Array

    saveTimer: null,

    // {path, controller, promise}
    scenarioPrefetch: null,

    clean: null,

    lastSaveTarget: null,
    edit: null,
    committedUploads: new Set(),
    saving: false,

    theme: "light",
    signedIn: false,
    scenarioHeaderVisible: false,
    actionsVisible: false,
    parked: false,
    buildDisabled: true,
    buildIdleTitle: "",
    buildMinWidth: null,
    downloadDisabled: true,
    draftNote: false,
    dirty: false,
    categoryHold: false,
    categoryNote: null,
    openPrVisible: false,
    prUrl: null,
    openingPr: false,

    dialogs: { about: false, help: false, feedback: false, upload: false },
    confirm: null,
    toast: null,

    isMember: false,
    pickerMode: "new",
    pendingPath: null,
    pendingTitle: "",
    chosenCategory: null,
    pickerBusy: false,
    pickerError: null,
    entriesError: null,

    wizard: initialWizard(),
    uploadPanels: { dialog: initialUploadPanel(), wizard: initialUploadPanel() },
  };
}

/** The vanilla store: `getState`, `setState` and `subscribe` for the modules not yet migrated to React. */
export const store = createStore<StoreState>(() => initialState());

/** The store as a hook: `useAppStore((s) => s.chosenPath)` re-renders only when that field changes. */
export function useAppStore<T>(selector: (state: StoreState) => T): T {
  return useStore(store, selector);
}

/** Opens one of the menu's dialogs. */
export function openDialog(name: DialogName): void {
  store.setState((state) => ({ dialogs: { ...state.dialogs, [name]: true } }));
}

/** Marks a dialog closed, when the dialog closed itself. */
export function dialogClosed(name: DialogName): void {
  if (store.getState().dialogs[name]) store.setState((state) => ({ dialogs: { ...state.dialogs, [name]: false } }));
}

/**
 * Asks in the page's own modal. A second question while one is open answers
 * the first with no.
 *
 * @returns true only when the confirming button was pressed
 */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  store.getState().confirm?.resolve(false);
  return new Promise((resolve) => {
    store.setState({ confirm: { options, resolve } });
  });
}

/** Answers the open confirmation and removes it. */
export function answerConfirm(confirmed: boolean): void {
  const { confirm } = store.getState();
  if (confirm === null) return;
  store.setState({ confirm: null });
  confirm.resolve(confirmed);
}

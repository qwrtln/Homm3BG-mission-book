// Ambient declarations for things the app reaches through the global scope
// rather than through an import: the vendored CodeMirror build loaded by a
// plain <script> tag, and the probe hooks app/modules/build.js and
// app/modules/github.js hang off window for the headless capture drivers.

/** A place in a CodeMirror 5 document: zero-based line and column. */
interface CodeMirrorPosition {
  line: number;
  ch: number;
}

/** Key names ("Up", "Ctrl-Space") to handlers, as CodeMirror 5's addKeyMap takes them. */
type CodeMirrorKeyMap = Record<string, (cm: CodeMirrorEditor) => void>;

/**
 * Key names to a command name or a handler, as CodeMirror 5's extraKeys
 * option takes them. A handler may return CodeMirror.Pass to fall through to
 * the next key map.
 */
type CodeMirrorStaticKeyMap = Record<string, string | ((cm: CodeMirrorEditor) => void | typeof CodeMirror.Pass)>;

/**
 * An extraKeys map consulted through its `call` hook instead of a plain
 * lookup, for a binding that depends on which key was pressed. Returning
 * `false` from it leaves that key to the browser, CodeMirror's own
 * documented way to unbind a key without claiming it.
 */
interface CodeMirrorCallKeyMap {
  call(key: string, cm: CodeMirrorEditor): string | false | ((cm: CodeMirrorEditor) => void) | undefined;
}

type CodeMirrorExtraKeyMap = CodeMirrorStaticKeyMap | CodeMirrorCallKeyMap;

/** The subset of CodeMirror 5's editor API this app actually calls. */
interface CodeMirrorEditor {
  getValue(): string;
  setValue(text: string): void;
  setOption(name: string, value: unknown): void;
  on(event: "change" | "blur" | "focus" | "cursorActivity" | "scroll", handler: () => void): void;
  /** origin names the edit: "+input" typing, "+delete" deleting, "paste", "undo", "setValue", ... */
  on(event: "change", handler: (cm: CodeMirrorEditor, change: { origin?: string }) => void): void;
  refresh(): void;
  focus(): void;
  getCursor(): CodeMirrorPosition;
  setCursor(pos: CodeMirrorPosition): void;
  getLine(line: number): string;
  replaceRange(text: string, from: CodeMirrorPosition, to?: CodeMirrorPosition, origin?: string): void;
  posFromIndex(index: number): CodeMirrorPosition;
  cursorCoords(pos: CodeMirrorPosition, mode: "window"): { left: number; right: number; top: number; bottom: number };
  somethingSelected(): boolean;
  addKeyMap(map: CodeMirrorKeyMap): void;
  removeKeyMap(map: CodeMirrorKeyMap): void;
  getInputField(): HTMLTextAreaElement;
  hasFocus(): boolean;
  lineCount(): number;
  addLineClass(line: number, where: "text" | "background" | "gutter" | "wrap", cls: string): CodeMirrorLineHandle;
  removeLineClass(line: CodeMirrorLineHandle, where: "text" | "background" | "gutter" | "wrap", cls: string): void;
  scrollIntoView(pos: CodeMirrorPosition, margin?: number): void;
  /** Runs a named CodeMirror command, core or addon-defined. */
  execCommand(name: string): void;
  /** From addon/comment/comment.js; stex's lineComment ("%") drives it. */
  toggleComment(): void;
  on(event: "keydown", handler: (cm: CodeMirrorEditor, event: KeyboardEvent) => void): void;
}

/** CodeMirror 5's handle on one line; it follows the line through edits. */
interface CodeMirrorLineHandle {
  readonly text: string;
}

interface CodeMirrorOptions {
  mode?: string;
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  indentUnit?: number;
  tabSize?: number;
  theme?: string;
  extraKeys?: CodeMirrorExtraKeyMap;
}

interface CodeMirrorStatic {
  fromTextArea(host: HTMLTextAreaElement, options?: CodeMirrorOptions): CodeMirrorEditor;
  /** Returned from an extraKeys handler to fall through to the next key map. */
  Pass: unique symbol;
}

/** Loaded from app/vendor/ by a <script> tag in app/index.html, not imported. */
declare const CodeMirror: CodeMirrorStatic;

interface Window {
  /** Reads back where the last save landed. Used by the integration tests. */
  __lastSaveTarget?: () => SaveTarget | null;
  /** The app's shared state object. Installed by app/app.js for the integration tests. */
  __state?: AppState;
  /** The local-store functions the integration tests seed and read. Installed by app/app.js. */
  __localStore?: Pick<typeof import("../app/modules/local-store.js"), "loadRecord" | "saveText" | "saveUploads">;
}

interface Navigator {
  /** Not in lib.dom.d.ts yet; Chromium's replacement for navigator.platform. */
  userAgentData?: { platform: string };
}

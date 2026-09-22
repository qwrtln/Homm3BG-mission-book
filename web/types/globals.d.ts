// Ambient declarations for things the app reaches through the global scope
// rather than through an import: the vendored CodeMirror build loaded by a
// plain <script> tag, and the probe hooks app/modules/build.js and
// app/modules/github.js hang off window for the headless capture drivers.

/** The subset of CodeMirror 5's editor API this app actually calls. */
interface CodeMirrorEditor {
  getValue(): string;
  setValue(text: string): void;
  setOption(name: string, value: unknown): void;
  on(event: "change" | "blur" | "focus", handler: () => void): void;
  refresh(): void;
  focus(): void;
}

interface CodeMirrorOptions {
  mode?: string;
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  indentUnit?: number;
  tabSize?: number;
  theme?: string;
}

interface CodeMirrorStatic {
  fromTextArea(host: HTMLTextAreaElement, options?: CodeMirrorOptions): CodeMirrorEditor;
}

/** Loaded from app/vendor/ by a <script> tag in app/index.html, not imported. */
declare const CodeMirror: CodeMirrorStatic;

interface Window {
  /** Reads back where the last save landed. Used by the integration tests. */
  __lastSaveTarget?: () => SaveTarget | null;
}

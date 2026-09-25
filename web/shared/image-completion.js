// What the .tex editor offers while a contributor types an image path. The
// book reaches its images through two macros from metadata.tex: \images for
// assets/images/ (a scenario's header, the last argument of
// \addscenariosection) and \maps for assets/maps/ (a layout, drawn with
// \includegraphics). Only files uploaded in this session are offered; the
// repository's own images are already referenced by the scenarios using them.

/** Repository folder of an uploadable image, and the macro the book reaches it by. */
const IMAGE_FOLDERS = [
  { dir: "assets/maps/", macro: "\\maps/" },
  { dir: "assets/images/", macro: "\\images/" },
];

// Text before the cursor, ending inside the argument being typed.
// \addscenariosection{1}{Clash Scenario}{Chain Link}{\images/...
const HEADER_ARGUMENT = /\\addscenariosection\s*(?:\{[^{}]*\}\s*){3}\{([^{}]*)$/;
// \includegraphics[width=\linewidth]{\maps/...
const GRAPHICS_ARGUMENT = /\\includegraphics\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)$/;

/**
 * Where the cursor sits inside an image argument, if it does.
 *
 * @typedef {object} CompletionContext
 * @property {"header" | "graphics"} kind header: \addscenariosection's
 *   image; graphics: any \includegraphics
 * @property {string} typed the argument's text before the cursor
 * @property {number} from column where the argument's text starts
 * @property {number} to column where the replaced text ends: the cursor,
 *   plus any path running on after it
 */

/**
 * The image argument the cursor is in, read from its line alone: both
 * commands keep their arguments on one line throughout the book.
 *
 * @param {string} line the cursor's whole line
 * @param {number} ch the cursor's column
 * @returns {CompletionContext | null} null outside an image argument
 */
export function completionContext(line, ch) {
  const before = line.slice(0, ch);
  const header = HEADER_ARGUMENT.exec(before);
  const graphics = header ? null : GRAPHICS_ARGUMENT.exec(before);
  const match = header ?? graphics;
  if (!match) return null;
  const typed = match[1];
  const rest = /^[^{}\s]*/.exec(line.slice(ch));
  return {
    kind: header ? "header" : "graphics",
    typed,
    from: ch - typed.length,
    to: ch + (rest ? rest[0].length : 0),
  };
}

/**
 * The macro path of an uploaded file, as a scenario writes it:
 * "assets/maps/x_2p.png" is "\maps/x_2p.png". Null for anything else
 * uploaded, such as a map-editor file.
 *
 * @param {string} path repository path
 * @returns {string | null}
 */
export function macroPath(path) {
  const folder = IMAGE_FOLDERS.find(({ dir }) => path.startsWith(dir));
  return folder ? `${folder.macro}${path.slice(folder.dir.length)}` : null;
}

/**
 * The paths to offer, best first. A header argument offers header images
 * only; \includegraphics offers maps, then header images. Paths starting
 * with what was typed come before paths merely containing it, ignoring case.
 * A path already typed out in full is not offered again.
 *
 * @param {Iterable<string>} uploadedPaths repository paths of every upload
 * @param {CompletionContext} context
 * @returns {string[]}
 */
export function imageCompletions(uploadedPaths, context) {
  const folders = context.kind === "header" ? ["assets/images/"] : IMAGE_FOLDERS.map(({ dir }) => dir);
  const typed = context.typed.toLowerCase();
  /** @type {string[]} */
  const starting = [];
  /** @type {string[]} */
  const containing = [];
  for (const dir of folders) {
    const candidates = [...uploadedPaths]
      .filter((path) => path.startsWith(dir))
      .map(macroPath)
      .filter((candidate) => candidate !== null)
      .sort();
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (lower === typed) continue;
      if (lower.startsWith(typed)) starting.push(candidate);
      else if (lower.includes(typed)) containing.push(candidate);
    }
  }
  return [...starting, ...containing];
}

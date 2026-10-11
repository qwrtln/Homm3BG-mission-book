// Shared module. Resolves and extracts the TeX Live files the app carries in
// web/shared/texmf/ because the data package it preloads lacks them.
//
// The app preloads texlive-basic (88 MB) rather than texlive-extra (326 MB).
// The book reads about 160 files that only texlive-extra ships. Those are
// copied out of texlive-extra.data, by hand, with carry-texmf.ts, and
// committed. Taking them from the pinned engine release rather than from
// CTAN keeps them at the same TeX Live version as the kernel in
// texlive-basic.
//
// Pure logic, no DOM and no file system: carry-texmf.ts does the reading
// and writing, and tier 1 tests this.

export interface PackedFile {
  start: number;
  end: number;
}

/**
 * The LZ4 chunk table of an Emscripten data package built with `--lz4`.
 * Chunk `i` holds up to CHUNK_SIZE uncompressed bytes, stored at
 * `offsets[i]` for `sizes[i]` bytes, LZ4-compressed when `successes[i]` is 1
 * and raw when it is 0.
 */
export interface ChunkTable {
  offsets: number[];
  sizes: number[];
  successes: number[];
}

export interface DataPackage {
  /** absolute path -> uncompressed byte range */
  files: Map<string, PackedFile>;
  chunks: ChunkTable;
}

/** Emscripten's MiniLZ4 chunk size, in uncompressed bytes. */
export const CHUNK_SIZE = 2048;

/**
 * Parses the metadata Emscripten's file packager writes into a data
 * package's loader script (e.g. texlive-extra.js).
 *
 * @param loader the loader script's text
 */
export function parseDataPackage(loader: string): DataPackage {
  const filesAt = loader.indexOf('"files": [');
  if (filesAt < 0) throw new Error("No file list in the data package loader.");
  const filesEnd = loader.indexOf("]", filesAt);
  const list: unknown = JSON.parse(loader.slice(filesAt + '"files": '.length, filesEnd + 1));
  if (!Array.isArray(list)) throw new Error("The data package file list is not an array.");
  const files: Map<string, PackedFile> = new Map();
  for (const entry of list) {
    if (typeof entry?.filename !== "string" || !Number.isInteger(entry.start) || !Number.isInteger(entry.end)) {
      throw new Error(`Bad data package entry: ${JSON.stringify(entry)}`);
    }
    files.set(entry.filename, { start: entry.start, end: entry.end });
  }

  const tableAt = loader.indexOf("var compressedData = {");
  if (tableAt < 0) throw new Error("No LZ4 chunk table in the data package loader.");
  const tableStart = loader.indexOf("{", tableAt);
  // The packager writes the table as one line of JSON.
  const lineEnd = loader.indexOf("\n", tableStart);
  const table = JSON.parse(loader.slice(tableStart, lineEnd < 0 ? undefined : lineEnd));
  for (const key of ["offsets", "sizes", "successes"]) {
    if (!Array.isArray(table[key])) throw new Error(`The LZ4 chunk table has no ${key}.`);
  }
  return { files, chunks: { offsets: table.offsets, sizes: table.sizes, successes: table.successes } };
}

/**
 * The part of a TeX Live path below `texmf-dist/`, which is the same in
 * every installation: the container's /opt/texlive/texdir/texmf-dist/... and
 * the engine's /texlive/texmf-dist/... compare equal through it.
 *
 * @param path an absolute path
 * @returns null for a path outside any texmf-dist tree
 */
export function texmfKey(path: string): string | null {
  const marker = "/texmf-dist/";
  const at = path.indexOf(marker);
  return at < 0 ? null : path.slice(at + marker.length);
}

/**
 * Every TeX Live file a LaTeX recorder file (`.fls`, from `-recorder`) says
 * the run read.
 *
 * @param fls the recorder file's text
 * @returns texmfKey paths, sorted, without duplicates
 */
export function recorderInputs(fls: string): string[] {
  const found: Set<string> = new Set();
  for (const line of fls.split("\n")) {
    if (!line.startsWith("INPUT ")) continue;
    const key = texmfKey(line.slice("INPUT ".length).trim());
    if (key) found.add(key);
  }
  return [...found].sort();
}

/**
 * Splits the TeX Live files a build reads by where they can come from.
 *
 * @param reads texmfKey paths the book reads
 * @param preloaded the data package the app preloads
 * @param source the larger data package to carry files from
 * @returns `carry`: in `source` but not in `preloaded`, so they must be
 *   carried. `absent`: in neither, so they need another source (CTAN) or the
 *   browser build never reads them. Both sorted.
 */
export function planCarry(
  reads: Iterable<string>,
  preloaded: DataPackage,
  source: DataPackage,
): { carry: string[]; absent: string[] } {
  const have = keySet(preloaded);
  const offered = keySet(source);
  const carry: string[] = [];
  const absent: string[] = [];
  for (const key of new Set(reads)) {
    if (have.has(key)) continue;
    (offered.has(key) ? carry : absent).push(key);
  }
  return { carry: carry.sort(), absent: absent.sort() };
}

/** @returns every texmfKey path the package ships */
function keySet(pkg: DataPackage): Set<string> {
  const keys: Set<string> = new Set();
  for (const path of pkg.files.keys()) {
    const key = texmfKey(path);
    if (key) keys.add(key);
  }
  return keys;
}

/** The absolute path a data package stores a texmfKey path under. */
export function packedPath(pkg: DataPackage, key: string): string | null {
  for (const path of pkg.files.keys()) {
    if (texmfKey(path) === key) return path;
  }
  return null;
}

/**
 * Decodes one LZ4 block (no frame header) into `output`.
 *
 * @param input the compressed block
 * @param output room for the whole decoded block
 * @returns bytes written to `output`
 */
export function lz4DecodeBlock(input: Uint8Array, output: Uint8Array): number {
  let from = 0;
  let to = 0;
  while (from < input.length) {
    const token = input[from++];
    let literals = token >> 4;
    if (literals === 15) {
      let more: number;
      do {
        more = input[from++];
        literals += more;
      } while (more === 255);
    }
    output.set(input.subarray(from, from + literals), to);
    from += literals;
    to += literals;
    if (from >= input.length) break; // the last sequence has literals only
    const offset = input[from] | (input[from + 1] << 8);
    from += 2;
    if (offset === 0) throw new Error("Corrupt LZ4 block: zero match offset.");
    let length = token & 15;
    if (length === 15) {
      let more: number;
      do {
        more = input[from++];
        length += more;
      } while (more === 255);
    }
    length += 4;
    // Byte by byte: a match may overlap the bytes it is copying.
    for (let i = 0; i < length; i++) {
      output[to] = output[to - offset];
      to += 1;
    }
  }
  return to;
}

/** Reads one file's bytes out of an LZ4-compressed data package. */
export function unpackFile(data: Uint8Array, chunks: ChunkTable, file: PackedFile): Uint8Array {
  const out = new Uint8Array(file.end - file.start);
  const chunk = new Uint8Array(CHUNK_SIZE);
  let written = 0;
  while (written < out.length) {
    const position = file.start + written;
    const index = Math.floor(position / CHUNK_SIZE);
    if (index >= chunks.offsets.length) throw new Error(`Chunk ${index} is past the end of the package.`);
    const stored = data.subarray(chunks.offsets[index], chunks.offsets[index] + chunks.sizes[index]);
    const decoded = chunks.successes[index] ? chunk.subarray(0, lz4DecodeBlock(stored, chunk)) : stored;
    const from = position - index * CHUNK_SIZE;
    const take = Math.min(decoded.length - from, out.length - written);
    if (take <= 0) throw new Error(`Chunk ${index} is shorter than its file needs.`);
    out.set(decoded.subarray(from, from + take), written);
    written += take;
  }
  return out;
}

/**
 * The name a carried file gets in the virtual filesystem: its basename,
 * because the build copies carried files flat into the working directory,
 * where kpathsea looks first.
 *
 * @param key a texmfKey path
 */
export function carriedName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

/** Where a manifest line says a carried file comes from. */
export const CARRY_SOURCES = ["texlive-extra", "ctan"] as const;

/**
 * One line of the carry manifest (web/shared/texmf/carried.txt).
 * `texlive-extra`: `path` is a texmfKey path inside texlive-extra.data.
 * `ctan`: `path` is a file under web/shared/texmf/ctan/, fetched by
 * fetch-missing-texmf.sh because no data package ships it.
 */
export interface CarryEntry {
  source: (typeof CARRY_SOURCES)[number];
  path: string;
  name: string;
}

/**
 * Parses the carry manifest: one `<source> <path>` per line; `#` starts a
 * comment, which records why a group of files is carried.
 *
 * @returns in manifest order
 * @throws on an unknown source, a malformed line, or two entries that would
 *   land on the same flat name
 */
export function parseCarryManifest(text: string): CarryEntry[] {
  const entries: CarryEntry[] = [];
  const seen: Map<string, string> = new Map();
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const source = parts[0] as CarryEntry["source"];
    if (parts.length !== 2 || !CARRY_SOURCES.includes(source)) {
      throw new Error(`carried.txt line ${index + 1}: expected "<${CARRY_SOURCES.join("|")}> <path>", got "${raw}"`);
    }
    const name = carriedName(parts[1]);
    const clash = seen.get(name);
    if (clash) throw new Error(`carried.txt line ${index + 1}: ${parts[1]} and ${clash} both land on ${name}`);
    seen.set(name, parts[1]);
    entries.push({ source, path: parts[1], name });
  });
  return entries;
}

export interface BundledFile {
  name: string;
  content: Uint8Array;
}

/** Bumped whenever the bundle layout changes. */
export const BUNDLE_FORMAT = 1;

/**
 * Packs carried files into one uncompressed bundle: a one-line JSON index,
 * a newline, then every file's bytes back to back in index order. The
 * caller gzips it; the browser gunzips it with DecompressionStream.
 */
export function packBundle(files: readonly BundledFile[]): Uint8Array {
  const index = { format: BUNDLE_FORMAT, files: files.map((f) => ({ name: f.name, bytes: f.content.length })) };
  const head = new TextEncoder().encode(`${JSON.stringify(index)}\n`);
  const out = new Uint8Array(head.length + files.reduce((sum, f) => sum + f.content.length, 0));
  out.set(head, 0);
  let at = head.length;
  for (const file of files) {
    out.set(file.content, at);
    at += file.content.length;
  }
  return out;
}

/**
 * Reverses packBundle. Validates the index, since the bytes come over the
 * network.
 *
 * @param bundle the gunzipped bundle
 * @throws on a malformed bundle
 */
export function unpackBundle(bundle: Uint8Array): BundledFile[] {
  const newline = bundle.indexOf(10);
  if (newline < 0) throw new Error("Carried TeX bundle has no index.");
  const index: unknown = JSON.parse(new TextDecoder().decode(bundle.subarray(0, newline)));
  const entries = (index as { format?: unknown; files?: unknown })?.files;
  if ((index as { format?: unknown })?.format !== BUNDLE_FORMAT || !Array.isArray(entries)) {
    throw new Error(`Carried TeX bundle is not format ${BUNDLE_FORMAT}.`);
  }
  const files: BundledFile[] = [];
  let at = newline + 1;
  for (const entry of entries) {
    if (typeof entry?.name !== "string" || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`Bad carried TeX bundle entry: ${JSON.stringify(entry)}`);
    }
    if (at + entry.bytes > bundle.length) throw new Error(`Carried TeX bundle is truncated at ${entry.name}.`);
    files.push({ name: entry.name, content: bundle.slice(at, at + entry.bytes) });
    at += entry.bytes;
  }
  if (at !== bundle.length) throw new Error("Carried TeX bundle has trailing bytes.");
  return files;
}

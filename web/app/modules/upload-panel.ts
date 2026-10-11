// One header image and up to MAX_MAP_FILES map layouts, each shown as a card
// (components/uploads/UploadPanel.tsx) with its preview, the name it is staged
// under (renamable) and, for a map, the player counts it is for. The editor's
// upload dialog and the start wizard's panes each draw one of these, from their
// own slice of the store and into their own staging map, so both offer the same
// experience from one model.
//
// This module is the model: the component calls its actions on a click or a
// keystroke, and every action stages the files at once, before it returns.

import {
  fileExtension,
  HEADER_EXTENSIONS,
  IMAGES_DIR,
  MAP_EXTENSION,
  MAP_FILE_EXTENSION,
  MAP_FILES_DIR,
  MAPS_DIR,
  MAX_MAP_FILES,
  mapFileContents,
  mapImageName,
  normalizeMapCode,
  parsePlayerCounts,
  sanitizeUploadName,
  withExtension,
} from "../../shared/upload-names.ts";
import {
  type MapUpload,
  type PendingUpload,
  store,
  type UploadPanelId,
  type UploadPanelState,
  type UploadStatus,
} from "../store.ts";

/** The map editor contributors export their map images from. */
export const MAP_EDITOR_URL = "https://zedero.github.io/homm3boardgame/";

const MAPS_COLLIDE = "Two layouts share the same name — tick the player counts each one is for, or rename one.";
const HINT: UploadStatus = { kind: "hint" };

/**
 * What one panel needs from the module that owns it.
 *
 * `slug` is the scenario's file-safe name, which the files are named after;
 * `onChange` runs after the staged files change; `notify` after files are added.
 */
export interface UploadPanelConfig {
  slug: () => string;
  onChange: () => void;
  notify?: (message: string) => void;
}

/** A staged map image, as the wizard hands it on. */
export interface StagedMap {
  path: string;
  bytes: Uint8Array;
  /** The player counts ticked, in order. */
  counts: number[];
}

/**
 * Where the wizard stages its images until the scenario is made. They move
 * into the editor through restoreUploads, at these same paths: the panel
 * stages straight into this map, so the wizard only has to read it back.
 */
export const wizardFiles: Map<string, Uint8Array> = new Map();

const configs: Partial<Record<UploadPanelId, UploadPanelConfig>> = {};

/** Tells a panel how to name its files and what to do when they change. */
export function configureUploadPanel(id: UploadPanelId, config: UploadPanelConfig): void {
  configs[id] = config;
}

function config(id: UploadPanelId): UploadPanelConfig {
  const found = configs[id];
  if (!found) throw new Error(`The "${id}" upload panel has not been configured.`);
  return found;
}

/** @returns where this panel stages its files, by repository path */
function staged(id: UploadPanelId): Map<string, Uint8Array> {
  return id === "dialog" ? store.getState().uploadedFiles : wizardFiles;
}

function panel(id: UploadPanelId): UploadPanelState {
  return store.getState().uploadPanels[id];
}

function patch(id: UploadPanelId, fields: Partial<UploadPanelState>): void {
  store.setState((s) => ({ uploadPanels: { ...s.uploadPanels, [id]: { ...s.uploadPanels[id], ...fields } } }));
}

export async function readAsUint8Array(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** An upload with its thumbnail made; free it with releasePreview once nothing draws it. */
function newUpload(bytes: Uint8Array, originalName: string): PendingUpload {
  const type = fileExtension(originalName) === ".png" ? "image/png" : "image/jpeg";
  const preview = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  return { bytes, originalName, path: null, preview };
}

function releasePreview(upload: PendingUpload | null): void {
  if (upload) URL.revokeObjectURL(upload.preview);
}

/** A map layout, its player counts read back from its name. */
function newMapUpload(bytes: Uint8Array, originalName: string): MapUpload {
  const counts = [...new Set(parsePlayerCounts(originalName))].sort((a, b) => a - b);
  return {
    ...newUpload(bytes, originalName),
    counts,
    customName: null,
    renameText: null,
    mapCode: "",
    mapFilePath: null,
  };
}

// --- the header image --------------------------------------------------------------

/**
 * The header's final file name: the rename box's text, made safe, carrying
 * the uploaded file's own extension.
 */
function headerTargetName(id: UploadPanelId, upload: PendingUpload, headerName: string): string {
  const ext = fileExtension(upload.originalName);
  return withExtension(sanitizeUploadName(headerName || config(id).slug()), ext);
}

/**
 * Re-stages the header image under whatever target name is in its rename
 * box, dropping the path it was staged at before.
 */
function restageHeader(id: UploadPanelId): void {
  const { header, headerName } = panel(id);
  if (!header) return;
  const files = staged(id);
  if (header.path) files.delete(header.path);
  const path = `${IMAGES_DIR}${headerTargetName(id, header, headerName)}`;
  files.set(path, header.bytes);
  patch(id, { header: { ...header, path }, headerStatus: HINT });
  config(id).onChange();
}

/**
 * Takes one header file, picked or dropped. Anything LaTeX cannot include
 * is refused, and the header staged before stays.
 */
export async function addHeaderFile(id: UploadPanelId, file: File | undefined): Promise<void> {
  if (!file) return;
  if (!HEADER_EXTENSIONS.includes(fileExtension(file.name))) {
    patch(id, {
      headerStatus: { kind: "text", text: `${file.name} is not a PNG or JPG — LaTeX cannot include it. Pick another.` },
    });
    return;
  }
  const bytes = await readAsUint8Array(file);
  const before = panel(id).header;
  if (before?.path) staged(id).delete(before.path);
  releasePreview(before);
  const headerAutoName = withExtension(config(id).slug(), fileExtension(file.name));
  patch(id, { header: newUpload(bytes, file.name), headerName: headerAutoName, headerAutoName });
  restageHeader(id);
  const { header, headerName } = panel(id);
  if (header) config(id).notify?.(`Header image uploaded as ${headerTargetName(id, header, headerName)}.`);
}

/** The rename box was typed in: stages the header under the new name. */
export function renameHeader(id: UploadPanelId, text: string): void {
  patch(id, { headerName: text });
  restageHeader(id);
}

/** Leaving the rename box shows the name as it is actually staged. */
export function commitHeaderName(id: UploadPanelId): void {
  const { header, headerName } = panel(id);
  if (header) patch(id, { headerName: headerTargetName(id, header, headerName) });
}

export function removeHeader(id: UploadPanelId): void {
  const { header } = panel(id);
  if (header?.path) staged(id).delete(header.path);
  releasePreview(header);
  patch(id, { header: null, headerName: "", headerStatus: HINT });
  config(id).onChange();
}

// --- the map layouts ------------------------------------------------------------------

/**
 * A map layout's target image name: the contributor's own, if they typed
 * one, else the one its ticked player counts derive.
 */
function mapTargetName(id: UploadPanelId, item: MapUpload): string {
  const name = item.customName ?? mapImageName(config(id).slug(), item.counts);
  return withExtension(sanitizeUploadName(name), MAP_EXTENSION);
}

/** @returns the name a map row's rename box shows */
export function mapRenameValue(id: UploadPanelId, item: MapUpload): string {
  return item.renameText ?? mapTargetName(id, item);
}

/** Unstages a map layout's image and its map file. */
function unstageMap(files: Map<string, Uint8Array>, item: MapUpload): void {
  if (item.path) files.delete(item.path);
  if (item.mapFilePath) files.delete(item.mapFilePath);
}

/**
 * Re-stages every map image, and each one's map file, under its target
 * name. A save string that is not base64 stages no map file until fixed.
 */
function restageMaps(id: UploadPanelId): void {
  const files = staged(id);
  const { maps } = panel(id);
  for (const item of maps) unstageMap(files, item);
  const seen = new Set<string>();
  let collision = false;
  let badCode = false;
  const encoder = new TextEncoder();
  const restaged = maps.map((item) => {
    const name = mapTargetName(id, item);
    const path = `${MAPS_DIR}${name}`;
    if (seen.has(path)) collision = true;
    seen.add(path);
    files.set(path, item.bytes); // a repeated name: the last file staged under it wins
    const code = normalizeMapCode(item.mapCode);
    if (code === null) badCode = true;
    let mapFilePath: string | null = null;
    if (code) {
      mapFilePath = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
      files.set(mapFilePath, encoder.encode(mapFileContents(code)));
    }
    return { ...item, path, mapFilePath };
  });
  const mapsStatus: UploadStatus = collision
    ? { kind: "text", text: MAPS_COLLIDE }
    : badCode
      ? { kind: "mapCode" }
      : HINT;
  patch(id, { maps: restaged, mapsStatus });
  config(id).onChange();
}

function updateMap(id: UploadPanelId, index: number, change: Partial<MapUpload>): void {
  const maps = panel(id).maps.map((item, i) => (i === index ? { ...item, ...change } : item));
  patch(id, { maps });
}

/**
 * Takes map files, picked or dropped. They are refused together: one that
 * is not PNG, or one past the limit, adds none of them.
 */
export async function addMapFiles(id: UploadPanelId, files: File[]): Promise<void> {
  if (!files.length) return;
  const notPng = files.filter((file) => fileExtension(file.name) !== MAP_EXTENSION);
  const have = panel(id).maps.length;
  const problem = notPng.length
    ? `${notPng.map((file) => file.name).join(", ")} ${notPng.length === 1 ? "is" : "are"} not PNG. None were added — pick again.`
    : have + files.length > MAX_MAP_FILES
      ? `That makes ${have + files.length} layouts, more than the ${MAX_MAP_FILES}-player limit. None were added.`
      : "";
  if (problem) {
    patch(id, { mapsStatus: { kind: "text", text: problem } });
    return;
  }
  const added = await Promise.all(files.map(async (file) => newMapUpload(await readAsUint8Array(file), file.name)));
  patch(id, { maps: [...panel(id).maps, ...added] });
  restageMaps(id);
  config(id).notify?.(
    added.length === 1 ? `Map image ${added[0].originalName} uploaded.` : `${added.length} map images uploaded.`,
  );
}

export function removeMap(id: UploadPanelId, index: number): void {
  const { maps } = panel(id);
  const item = maps[index];
  if (!item) return;
  unstageMap(staged(id), item);
  releasePreview(item);
  const rest = maps.filter((_, i) => i !== index);
  if (rest.length) {
    patch(id, { maps: rest });
    restageMaps(id);
    return;
  }
  patch(id, { maps: [], mapsStatus: HINT });
  config(id).onChange();
}

/** The rename box was typed in: the typed name sticks, whatever the counts are afterwards. */
export function renameMap(id: UploadPanelId, index: number, text: string): void {
  updateMap(id, index, { renameText: text, customName: text.trim() ? text : null });
  restageMaps(id);
}

/** Leaving the rename box shows the name as it is actually staged. */
export function commitMapName(id: UploadPanelId, index: number): void {
  updateMap(id, index, { renameText: null });
}

export function toggleMapCount(id: UploadPanelId, index: number, count: number, checked: boolean): void {
  const item = panel(id).maps[index];
  if (!item) return;
  const rest = item.counts.filter((n) => n !== count);
  updateMap(id, index, { counts: checked ? [...rest, count].sort((a, b) => a - b) : rest });
  restageMaps(id);
}

export function setMapCode(id: UploadPanelId, index: number, text: string): void {
  updateMap(id, index, { mapCode: text });
  restageMaps(id);
}

/** Leaving the box shows the save string as it is actually saved. */
export function commitMapCode(id: UploadPanelId, index: number): void {
  const item = panel(id).maps[index];
  if (!item) return;
  const code = normalizeMapCode(item.mapCode);
  if (code !== null) updateMap(id, index, { mapCode: code });
}

// --- what the owning module asks of a panel -------------------------------------------

/** Drops every file and empties the controls. */
export function resetUploadPanel(id: UploadPanelId): void {
  const { header, maps } = panel(id);
  const files = staged(id);
  if (header?.path) files.delete(header.path);
  for (const item of maps) unstageMap(files, item);
  releasePreview(header);
  for (const item of maps) releasePreview(item);
  patch(id, {
    header: null,
    headerName: "",
    headerStatus: HINT,
    maps: [],
    mapsStatus: HINT,
  });
}

/** Takes committed files back in, the first image as the header. */
export function restoreUploadPanel(id: UploadPanelId, committed: { path: string; bytes: Uint8Array }[]): void {
  const files = staged(id);
  const images = committed.filter((f) => f.path.startsWith(IMAGES_DIR));
  const maps = committed.filter((f) => f.path.startsWith(MAPS_DIR));
  const mapFiles = committed.filter((f) => f.path.startsWith(MAP_FILES_DIR));
  const [header, ...extraImages] = images;
  if (header) {
    const originalName = header.path.slice(IMAGES_DIR.length);
    patch(id, { header: newUpload(header.bytes, originalName), headerName: originalName });
    restageHeader(id);
  }
  for (const extra of extraImages) files.set(extra.path, extra.bytes);
  const pairedMapFiles = new Set<string>();
  if (maps.length) {
    const restored = maps.map((f) => {
      const name = f.path.slice(MAPS_DIR.length);
      const item = newMapUpload(f.bytes, name);
      if (mapTargetName(id, item) !== name) item.customName = name;
      const mapFilePath = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
      const mapFile = mapFiles.find((m) => m.path === mapFilePath);
      if (mapFile) {
        item.mapCode = new TextDecoder().decode(mapFile.bytes).trim();
        pairedMapFiles.add(mapFile.path);
      }
      return item;
    });
    patch(id, { maps: restored });
    restageMaps(id);
  }
  for (const extra of mapFiles) if (!pairedMapFiles.has(extra.path)) files.set(extra.path, extra.bytes);
}

/** @returns where the header image is staged */
export function uploadHeaderPath(id: UploadPanelId): string | null {
  return panel(id).header?.path ?? null;
}

/** @returns a panel's map layouts, in order, as staged */
export function stagedMaps(state: UploadPanelState): StagedMap[] {
  return state.maps.flatMap((item) =>
    item.path ? [{ path: item.path, bytes: item.bytes, counts: [...item.counts].sort((a, b) => a - b) }] : [],
  );
}

/** Renames what still carries the scenario's old name, after the name changed. */
export function followUploadSlug(id: UploadPanelId): void {
  const { header, headerName, headerAutoName } = panel(id);
  // A name the contributor typed stays theirs.
  if (header && headerName === headerAutoName) {
    const auto = withExtension(config(id).slug(), fileExtension(header.originalName));
    patch(id, { headerAutoName: auto });
    if (headerName !== auto) {
      patch(id, { headerName: auto });
      restageHeader(id);
    }
  }
  if (panel(id).maps.length) restageMaps(id);
}

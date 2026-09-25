import {
  fileExtension,
  HEADER_EXTENSIONS,
  MAP_EXTENSION,
  MAP_FILE_EXTENSION,
  MAX_PLAYERS,
  mapImageName,
  parsePlayerCounts,
  withExtension,
} from "../../shared/upload-names.js";
import { refreshUnsavedNote } from "./dirty.js";
import { el, escapeHtml, sanitizeFilename } from "./dom.js";
import { state } from "./state.js";

// No server: a chosen file never leaves the browser, it just joins the
// virtual filesystem the build compiles from, under an editable target name.
const MAX_MAP_FILES = 6;

const IMAGES_DIR = "assets/images/";
const MAPS_DIR = "assets/maps/";
const MAP_FILES_DIR = "assets/map-files/";

const HEADER_HINT = "PNG or JPG. Named after the scenario; rename it if you like.";
const MAPS_HINT =
  "PNG exported from the map editor. Add one image for the whole scenario, or one per player-count layout and tick the counts it is for.";
const ADD_FIRST_MAP = "+ Add map image";

/**
 * One file a contributor added from their own machine, before and after it
 * is staged at a repository path.
 *
 * @typedef {object} PendingUpload
 * @property {Uint8Array} bytes
 * @property {string} originalName the filename as chosen on their machine
 * @property {string | null} path where the build sees it; null until staged
 */

/**
 * A map layout: its image, the player counts it is for, and the map editor's
 * optional save file that travels under the same name.
 *
 * @typedef {PendingUpload & {
 *   counts: Set<number>,
 *   customName: string | null,
 *   mapFile: PendingUpload | null,
 * }} MapUpload
 */

/** @type {PendingUpload | null} */
let headerUpload = null;
/** @type {MapUpload[]} */
let mapUploads = [];

/** File-safe form of the open scenario's name. @returns {string} */
function scenarioSlug() {
  return sanitizeFilename(state.chosenTitle);
}

/** Empties the map rows, once the last layout is gone. @returns {void} */
function resetMapList() {
  el("upload-maps-add").textContent = ADD_FIRST_MAP;
  el("upload-maps-names").innerHTML = "";
  el("upload-maps-names").hidden = true;
  setUploadStatus("upload-maps-status", MAPS_HINT);
  refreshUnsavedNote();
}

/** Clears every staged upload and its controls. @returns {void} */
export function resetUploads() {
  state.uploadedFiles.clear();
  headerUpload = null;
  mapUploads = [];
  el("upload-header").value = "";
  el("upload-header-name").value = "";
  el("upload-header-name").hidden = true;
  el("upload-maps").value = "";
  el("upload-maps-names").innerHTML = "";
  el("upload-maps-names").hidden = true;
  el("upload-maps-add").textContent = ADD_FIRST_MAP;
  setUploadStatus("upload-header-status", HEADER_HINT);
  setUploadStatus("upload-maps-status", MAPS_HINT);
}

/**
 * @param {"upload-header-status" | "upload-maps-status"} id
 * @param {string} html trusted markup; caller escapes any contributor text
 * @param {"" | "bad"} [tone]
 * @returns {void}
 */
export function setUploadStatus(id, html, tone = "") {
  const span = el(id);
  span.innerHTML = html;
  span.classList.toggle("bad", tone === "bad");
}

/**
 * @param {File} file
 * @returns {Promise<Uint8Array>}
 */
export async function readAsUint8Array(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Repository-safe form of an uploaded file's name: spaces become
 * underscores and anything TeX or a URL would trip on is dropped. The
 * extension survives; a name that empties out falls back to "image".
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeUploadName(name) {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "image";
}

/**
 * The header's final file name: the rename box's text, made safe, carrying
 * the uploaded file's own extension.
 *
 * @param {PendingUpload} upload
 * @returns {string}
 */
function headerTargetName(upload) {
  const ext = fileExtension(upload.originalName);
  return withExtension(sanitizeUploadName(el("upload-header-name").value || scenarioSlug()), ext);
}

/**
 * Re-stages the header image under whatever target name is in its rename
 * box, dropping the path it was staged at before.
 *
 * @returns {void}
 */
export function restageHeader() {
  if (!headerUpload) return;
  if (headerUpload.path) state.uploadedFiles.delete(headerUpload.path);
  const path = `${IMAGES_DIR}${headerTargetName(headerUpload)}`;
  headerUpload.path = path;
  state.uploadedFiles.set(path, headerUpload.bytes);
  setUploadStatus("upload-header-status", HEADER_HINT);
  refreshUnsavedNote();
}

/**
 * A map layout's target image name: the contributor's own, if they typed
 * one, else the one its ticked player counts derive.
 *
 * @param {MapUpload} item
 * @returns {string}
 */
function mapTargetName(item) {
  const name = item.customName ?? mapImageName(scenarioSlug(), item.counts);
  return withExtension(sanitizeUploadName(name), MAP_EXTENSION);
}

/**
 * Re-stages every map image, and each one's map-editor file, under its
 * target name.
 *
 * @returns {void}
 */
export function restageMaps() {
  for (const item of mapUploads) {
    if (item.path) state.uploadedFiles.delete(item.path);
    if (item.mapFile?.path) state.uploadedFiles.delete(item.mapFile.path);
  }
  const seen = new Set();
  let collision = false;
  for (const item of mapUploads) {
    const name = mapTargetName(item);
    const path = `${MAPS_DIR}${name}`;
    if (seen.has(path)) collision = true;
    seen.add(path);
    item.path = path;
    state.uploadedFiles.set(path, item.bytes); // a repeated name: the last file staged under it wins
    if (item.mapFile) {
      item.mapFile.path = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
      state.uploadedFiles.set(item.mapFile.path, item.mapFile.bytes);
    }
  }
  setUploadStatus(
    "upload-maps-status",
    collision ? "Two layouts share the same name — tick the player counts each one is for, or rename one." : MAPS_HINT,
    collision ? "bad" : "",
  );
  refreshUnsavedNote();
}

/**
 * @param {MapUpload} item
 * @param {number} i
 * @returns {string}
 */
function mapRowHtml(item, i) {
  const boxes = Array.from({ length: MAX_PLAYERS }, (_, k) => k + 1)
    .map(
      (n) =>
        `<label><input type="checkbox" class="upload-player" value="${n}"${item.counts.has(n) ? " checked" : ""}>${n}</label>`,
    )
    .join("");
  const mapFile = item.mapFile
    ? `<span class="orig-name">Map editor file: ${escapeHtml(item.mapFile.originalName)}</span>
       <button type="button" class="link upload-mapfile-remove">Remove</button>`
    : `<button type="button" class="link upload-mapfile-add">Add map editor file (.map, optional)</button>`;
  return `
    <div class="upload-map" data-index="${i}">
      <div class="upload-map-head">
        <span class="upload-map-title">Layout ${i + 1}</span>
        <span class="orig-name">${escapeHtml(item.originalName)}</span>
        <button type="button" class="upload-remove" aria-label="Remove layout ${i + 1}" title="Remove this layout">×</button>
      </div>
      <input type="text" class="upload-rename" aria-label="Target filename for layout ${i + 1}" value="${escapeHtml(mapTargetName(item))}">
      <fieldset class="upload-players"><legend>Players</legend>${boxes}</fieldset>
      <div class="upload-mapfile">
        <input type="file" class="upload-mapfile-input" accept=".map" hidden>
        ${mapFile}
      </div>
    </div>
  `;
}

/** Draws one row per staged map image. @returns {void} */
export function renderMapUploads() {
  const list = el("upload-maps-names");
  list.innerHTML = mapUploads.map(mapRowHtml).join("");
  list.hidden = false;
  el("upload-maps-add").textContent = "+ Add another map image";
  list.querySelectorAll(".upload-map").forEach((row) => {
    const item = mapUploads[Number(/** @type {HTMLElement} */ (row).dataset.index)];
    const rename = /** @type {HTMLInputElement} */ (row.querySelector(".upload-rename"));
    rename.addEventListener("input", () => {
      item.customName = rename.value.trim() ? rename.value : null;
      restageMaps();
    });
    // Leaving the box shows the name as it is actually staged.
    rename.addEventListener("change", () => {
      rename.value = mapTargetName(item);
    });
    row.querySelectorAll(".upload-player").forEach((box) => {
      const checkbox = /** @type {HTMLInputElement} */ (box);
      checkbox.addEventListener("change", () => {
        const n = Number(checkbox.value);
        if (checkbox.checked) item.counts.add(n);
        else item.counts.delete(n);
        if (item.customName === null) rename.value = mapTargetName(item);
        restageMaps();
      });
    });
    row.querySelector(".upload-remove")?.addEventListener("click", () => {
      if (item.path) state.uploadedFiles.delete(item.path);
      if (item.mapFile?.path) state.uploadedFiles.delete(item.mapFile.path);
      mapUploads = mapUploads.filter((other) => other !== item);
      if (mapUploads.length) renderMapUploads();
      else resetMapList();
    });
    const mapFileInput = /** @type {HTMLInputElement} */ (row.querySelector(".upload-mapfile-input"));
    row.querySelector(".upload-mapfile-add")?.addEventListener("click", () => mapFileInput.click());
    row.querySelector(".upload-mapfile-remove")?.addEventListener("click", () => {
      if (item.mapFile?.path) state.uploadedFiles.delete(item.mapFile.path);
      item.mapFile = null;
      renderMapUploads();
    });
    mapFileInput.addEventListener("change", async () => {
      const [file] = mapFileInput.files ?? [];
      if (!file) return;
      if (fileExtension(file.name) !== MAP_FILE_EXTENSION) {
        setUploadStatus(
          "upload-maps-status",
          `${escapeHtml(file.name)} is not a <code>.map</code> file from the map editor.`,
          "bad",
        );
        mapFileInput.value = "";
        return;
      }
      if (item.mapFile?.path) state.uploadedFiles.delete(item.mapFile.path);
      item.mapFile = { bytes: await readAsUint8Array(file), originalName: file.name, path: null };
      renderMapUploads();
    });
  });
  restageMaps();
}

/**
 * A map layout, its player counts read back from its name. A name that is
 * not the one those counts derive is kept as the contributor's own.
 *
 * @param {Uint8Array} bytes
 * @param {string} originalName
 * @returns {MapUpload}
 */
function newMapUpload(bytes, originalName) {
  const counts = new Set(parsePlayerCounts(originalName));
  return { bytes, originalName, path: null, counts, customName: null, mapFile: null };
}

/**
 * Puts a resumed draft's committed assets back into the upload controls, so
 * "Save again" keeps carrying them.
 *
 * @param {{path: string, bytes: Uint8Array}[]} files
 * @returns {void}
 */
export function restoreUploads(files) {
  const images = files.filter((f) => f.path.startsWith(IMAGES_DIR));
  const maps = files.filter((f) => f.path.startsWith(MAPS_DIR));
  const mapFiles = files.filter((f) => f.path.startsWith(MAP_FILES_DIR));
  const [header, ...extraImages] = images;
  if (header) {
    const originalName = header.path.slice(IMAGES_DIR.length);
    headerUpload = { bytes: header.bytes, originalName, path: null };
    el("upload-header-name").hidden = false;
    el("upload-header-name").value = originalName;
    restageHeader();
  }
  for (const extra of extraImages) state.uploadedFiles.set(extra.path, extra.bytes);
  const pairedMapFiles = new Set();
  if (maps.length) {
    mapUploads = maps.map((f) => {
      const name = f.path.slice(MAPS_DIR.length);
      const item = newMapUpload(f.bytes, name);
      if (mapTargetName(item) !== name) item.customName = name;
      const mapFilePath = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
      const mapFile = mapFiles.find((m) => m.path === mapFilePath);
      if (mapFile) {
        item.mapFile = { bytes: mapFile.bytes, originalName: mapFilePath.slice(MAP_FILES_DIR.length), path: null };
        pairedMapFiles.add(mapFile.path);
      }
      return item;
    });
    renderMapUploads();
  }
  for (const extra of mapFiles) if (!pairedMapFiles.has(extra.path)) state.uploadedFiles.set(extra.path, extra.bytes);
}

/** Wires the uploads dialog and its two file inputs. @returns {void} */
export function initUploads() {
  el("upload-open").addEventListener("click", () => el("upload-dialog").showModal());
  el("upload-maps-add").addEventListener("click", () => el("upload-maps").click());

  el("upload-header").addEventListener("change", async () => {
    const [file] = el("upload-header").files ?? [];
    if (!file) return;
    if (!HEADER_EXTENSIONS.includes(fileExtension(file.name))) {
      setUploadStatus(
        "upload-header-status",
        `${escapeHtml(file.name)} is not a PNG or JPG — LaTeX cannot include it. Pick another.`,
        "bad",
      );
      el("upload-header").value = "";
      return;
    }
    if (headerUpload?.path) state.uploadedFiles.delete(headerUpload.path);
    headerUpload = { bytes: await readAsUint8Array(file), originalName: file.name, path: null };
    el("upload-header-name").hidden = false;
    el("upload-header-name").value = withExtension(scenarioSlug(), fileExtension(file.name));
    restageHeader();
  });
  el("upload-header-name").addEventListener("input", restageHeader);
  // Leaving the box shows the name as it is actually staged.
  el("upload-header-name").addEventListener("change", () => {
    if (headerUpload) el("upload-header-name").value = headerTargetName(headerUpload);
  });

  el("upload-maps").addEventListener("change", async () => {
    const files = [...(el("upload-maps").files ?? [])];
    if (!files.length) return;
    // Emptied at once, so the same picker adds the next layout.
    el("upload-maps").value = "";
    const notPng = files.filter((file) => fileExtension(file.name) !== MAP_EXTENSION);
    const problem = notPng.length
      ? `${notPng.map((file) => escapeHtml(file.name)).join(", ")} ${notPng.length === 1 ? "is" : "are"} not PNG. None were added — pick again.`
      : mapUploads.length + files.length > MAX_MAP_FILES
        ? `That makes ${mapUploads.length + files.length} layouts, more than the ${MAX_MAP_FILES}-player limit. None were added.`
        : "";
    if (problem) {
      setUploadStatus("upload-maps-status", problem, "bad");
      return;
    }
    const added = await Promise.all(files.map(async (file) => newMapUpload(await readAsUint8Array(file), file.name)));
    mapUploads = [...mapUploads, ...added];
    renderMapUploads();
  });
}

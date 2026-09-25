import {
  fileExtension,
  HEADER_EXTENSIONS,
  MAP_EXTENSION,
  MAP_FILE_EXTENSION,
  MAX_PLAYERS,
  mapFileContents,
  mapImageName,
  normalizeMapCode,
  parsePlayerCounts,
  withExtension,
} from "../../shared/upload-names.js";
import { refreshUnsavedNote } from "./dirty.js";
import { el, escapeHtml, sanitizeFilename } from "./dom.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";

// No server: a chosen file never leaves the browser, it just joins the
// virtual filesystem the build compiles from, under an editable target name.
const MAX_MAP_FILES = 6;

const IMAGES_DIR = "assets/images/";
const MAPS_DIR = "assets/maps/";
const MAP_FILES_DIR = "assets/map-files/";

const HEADER_HINT = "PNG or JPG. Named after the scenario; rename it if you like.";
const MAPS_HINT =
  "PNG exported from the map editor. Add one image for the whole scenario, or one per player-count layout and tick the counts it is for.";
const MAP_CODE_BAD =
  "A map editor save string is one line of letters, digits, <code>+</code>, <code>/</code> and <code>=</code>. Paste it again.";
const ADD_FIRST_MAP = "+ Add map image";
const ADD_FIRST_HEADER = "+ Add header image";

/**
 * One file a contributor added from their own machine, before and after it
 * is staged at a repository path.
 *
 * @typedef {object} PendingUpload
 * @property {Uint8Array} bytes
 * @property {string} originalName the filename as chosen on their machine
 * @property {string | null} path where the build sees it; null until staged
 * @property {string | null} preview object URL of the bytes, for the
 *   thumbnail; made on first draw, revoked with the upload
 */

/**
 * A map layout: its image, the player counts it is for, and the map editor's
 * optional save string, which travels as a .map file under the same name.
 *
 * @typedef {PendingUpload & {
 *   counts: Set<number>,
 *   customName: string | null,
 *   mapCode: string,
 *   mapFilePath: string | null,
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

/**
 * Object URL for an upload's thumbnail, made once and kept on the upload.
 *
 * @param {PendingUpload} upload
 * @returns {string}
 */
function previewUrl(upload) {
  if (upload.preview === null) {
    const ext = fileExtension(upload.originalName);
    const type = ext === ".png" ? "image/png" : "image/jpeg";
    upload.preview = URL.createObjectURL(new Blob([new Uint8Array(upload.bytes)], { type }));
  }
  return upload.preview;
}

/**
 * Frees an upload's thumbnail once nothing draws it any more.
 *
 * @param {PendingUpload | null} upload
 * @returns {void}
 */
function releasePreview(upload) {
  if (upload?.preview) URL.revokeObjectURL(upload.preview);
  if (upload) upload.preview = null;
}

/** Empties the map rows, once the last layout is gone. @returns {void} */
function resetMapList() {
  el("upload-maps-add").textContent = ADD_FIRST_MAP;
  el("upload-maps-names").innerHTML = "";
  el("upload-maps-names").hidden = true;
  setUploadStatus("upload-maps-status", MAPS_HINT);
  refreshUnsavedNote();
}

/**
 * Shows the header card for the staged header image, or the add button
 * alone when there is none.
 *
 * @returns {void}
 */
function renderHeaderCard() {
  el("upload-header-card").hidden = headerUpload === null;
  el("upload-header-add").textContent = headerUpload ? "Replace header image" : ADD_FIRST_HEADER;
  if (headerUpload) {
    el("upload-header-orig").textContent = headerUpload.originalName;
    el("upload-header-preview").src = previewUrl(headerUpload);
  } else {
    el("upload-header-name").value = "";
    el("upload-header-orig").textContent = "";
    el("upload-header-preview").removeAttribute("src");
  }
}

/** Clears every staged upload and its controls. @returns {void} */
export function resetUploads() {
  state.uploadedFiles.clear();
  releasePreview(headerUpload);
  for (const item of mapUploads) releasePreview(item);
  headerUpload = null;
  mapUploads = [];
  el("upload-header").value = "";
  renderHeaderCard();
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
 * Unstages a map layout's image and its map file.
 *
 * @param {MapUpload} item
 * @returns {void}
 */
function unstageMap(item) {
  if (item.path) state.uploadedFiles.delete(item.path);
  if (item.mapFilePath) state.uploadedFiles.delete(item.mapFilePath);
  item.mapFilePath = null;
}

/**
 * Re-stages every map image, and each one's map file, under its target
 * name. A save string that is not base64 stages no map file until fixed.
 *
 * @returns {void}
 */
export function restageMaps() {
  for (const item of mapUploads) unstageMap(item);
  const seen = new Set();
  let collision = false;
  let badCode = false;
  const encoder = new TextEncoder();
  for (const item of mapUploads) {
    const name = mapTargetName(item);
    const path = `${MAPS_DIR}${name}`;
    if (seen.has(path)) collision = true;
    seen.add(path);
    item.path = path;
    state.uploadedFiles.set(path, item.bytes); // a repeated name: the last file staged under it wins
    const code = normalizeMapCode(item.mapCode);
    if (code === null) badCode = true;
    if (code) {
      item.mapFilePath = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
      state.uploadedFiles.set(item.mapFilePath, encoder.encode(mapFileContents(code)));
    }
  }
  const problem = collision
    ? "Two layouts share the same name — tick the player counts each one is for, or rename one."
    : badCode
      ? MAP_CODE_BAD
      : "";
  setUploadStatus("upload-maps-status", problem || MAPS_HINT, problem ? "bad" : "");
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
  const badCode = normalizeMapCode(item.mapCode) === null;
  return `
    <div class="upload-card upload-map" data-index="${i}">
      <div class="upload-card-body">
        <div class="upload-card-head">
          <span class="upload-card-title">Layout ${i + 1}</span>
          <span class="orig-name">${escapeHtml(item.originalName)}</span>
          <button type="button" class="upload-remove" aria-label="Remove layout ${i + 1}" title="Remove this layout">×</button>
        </div>
        <input type="text" class="upload-rename" aria-label="Target filename for layout ${i + 1}" value="${escapeHtml(mapTargetName(item))}">
        <fieldset class="upload-players"><legend>Players</legend>${boxes}</fieldset>
        <label class="upload-mapfile">
          <span>Map editor string <span class="optional">(optional)</span></span>
          <input type="text" class="upload-mapfile-input" spellcheck="false" autocomplete="off"
            placeholder="Paste the string the map editor exports" aria-label="Map editor string for layout ${i + 1}"
            value="${escapeHtml(item.mapCode)}"${badCode ? ' aria-invalid="true"' : ""}>
        </label>
      </div>
      <img class="upload-preview" src="${previewUrl(item)}" alt="Layout ${i + 1} preview">
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
      unstageMap(item);
      releasePreview(item);
      mapUploads = mapUploads.filter((other) => other !== item);
      if (mapUploads.length) renderMapUploads();
      else resetMapList();
    });
    const mapCode = /** @type {HTMLInputElement} */ (row.querySelector(".upload-mapfile-input"));
    mapCode.addEventListener("input", () => {
      item.mapCode = mapCode.value;
      const bad = normalizeMapCode(item.mapCode) === null;
      if (bad) mapCode.setAttribute("aria-invalid", "true");
      else mapCode.removeAttribute("aria-invalid");
      restageMaps();
    });
    // Leaving the box shows the string as it is actually saved.
    mapCode.addEventListener("change", () => {
      const code = normalizeMapCode(item.mapCode);
      if (code === null) return;
      item.mapCode = code;
      mapCode.value = code;
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
  return { bytes, originalName, path: null, preview: null, counts, customName: null, mapCode: "", mapFilePath: null };
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
    headerUpload = { bytes: header.bytes, originalName, path: null, preview: null };
    el("upload-header-name").value = originalName;
    renderHeaderCard();
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
        item.mapCode = new TextDecoder().decode(mapFile.bytes).trim();
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
  el("upload-header-add").addEventListener("click", () => el("upload-header").click());
  el("upload-header-remove").addEventListener("click", () => {
    if (headerUpload?.path) state.uploadedFiles.delete(headerUpload.path);
    releasePreview(headerUpload);
    headerUpload = null;
    el("upload-header").value = "";
    renderHeaderCard();
    setUploadStatus("upload-header-status", HEADER_HINT);
    refreshUnsavedNote();
  });

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
    releasePreview(headerUpload);
    headerUpload = { bytes: await readAsUint8Array(file), originalName: file.name, path: null, preview: null };
    el("upload-header").value = "";
    el("upload-header-name").value = withExtension(scenarioSlug(), fileExtension(file.name));
    renderHeaderCard();
    restageHeader();
    showToast(`Header image uploaded as ${headerTargetName(headerUpload)}.`);
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
    showToast(
      added.length === 1 ? `Map image ${added[0].originalName} uploaded.` : `${added.length} map images uploaded.`,
    );
  });
}

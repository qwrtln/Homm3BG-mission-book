// One header image and up to MAX_MAP_FILES map layouts, each shown as a card
// with its preview, the name it is staged under (renamable) and, for a map,
// the player counts it is for. The editor's upload popover and the start
// wizard's panes each draw one of these into their own elements and stage
// into their own map, so both offer the same experience from one model.
//
// Files come from a hidden file input behind a "+ Add" button, or are dropped
// onto the field; both paths go through the same checks.

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
import { escapeHtml } from "./dom.js";

export const MAX_MAP_FILES = 6;

export const IMAGES_DIR = "assets/images/";
export const MAPS_DIR = "assets/maps/";
export const MAP_FILES_DIR = "assets/map-files/";

/** The map editor contributors export their map images from. */
export const MAP_EDITOR_URL = "http://homm3bgmapeditor.zedero.nl/";

const MAP_CODE_BAD =
  "A map editor save string is one line of letters, digits, <code>+</code>, <code>/</code> and <code>=</code>. Paste it again.";
const MAPS_COLLIDE = "Two layouts share the same name — tick the player counts each one is for, or rename one.";
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

/**
 * The elements one panel draws into. The file inputs stay hidden; their add
 * buttons open them, and each drop zone takes dropped files.
 *
 * @typedef {object} UploadPanelElements
 * @property {HTMLInputElement} headerInput
 * @property {HTMLButtonElement} headerAdd
 * @property {HTMLElement} headerCard
 * @property {HTMLInputElement} headerName the rename box
 * @property {HTMLElement} headerOrig
 * @property {HTMLImageElement} headerPreview
 * @property {HTMLButtonElement} headerRemove
 * @property {HTMLElement} headerStatus
 * @property {HTMLElement} headerZone where a header file can be dropped
 * @property {HTMLInputElement} mapsInput
 * @property {HTMLButtonElement} mapsAdd
 * @property {HTMLElement} mapsList
 * @property {HTMLElement} mapsStatus
 * @property {HTMLElement} mapsZone where map files can be dropped
 */

/**
 * @typedef {object} UploadPanelOptions
 * @property {UploadPanelElements} elements
 * @property {() => string} slug the scenario's file-safe name, which the files are named after
 * @property {Map<string, Uint8Array>} staged where each file is staged, by repository path
 * @property {boolean} mapCodes whether a layout offers the map editor's save string
 * @property {string} headerHint trusted markup
 * @property {string} mapsHint trusted markup
 * @property {() => void} onChange after the staged files change
 * @property {(message: string) => void} [notify] after files are added
 */

/**
 * A staged map image, as the wizard hands it on.
 *
 * @typedef {object} StagedMap
 * @property {string} path
 * @property {Uint8Array} bytes
 * @property {number[]} counts the player counts ticked, in order
 */

/**
 * What a panel offers the module that owns it.
 *
 * @typedef {object} UploadPanel
 * @property {() => void} reset drops every file and empties the controls
 * @property {(files: {path: string, bytes: Uint8Array}[]) => void} restore
 *   takes committed files back in, the first image as the header
 * @property {() => string | null} headerPath where the header image is staged
 * @property {() => StagedMap[]} maps the map layouts, in order, as staged
 * @property {() => boolean} mapsCollide whether two layouts share a name
 * @property {() => void} followSlug renames what still carries the scenario's
 *   old name after the name changed
 */

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
 * Lets `zone` take files dropped on it, highlighted with `.drop-target`
 * while files are dragged over it. A drag that carries no files, such as
 * text, passes by untouched.
 *
 * @param {HTMLElement} zone
 * @param {(files: File[]) => void} onFiles
 * @returns {void}
 */
export function acceptFileDrops(zone, onFiles) {
  /** @param {DragEvent} event */
  const carriesFiles = (event) => event.dataTransfer?.types.includes("Files") ?? false;
  // Entering a child fires dragenter before the parent's dragleave, so count.
  let depth = 0;
  zone.addEventListener("dragenter", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth++;
    zone.classList.add("drop-target");
  });
  zone.addEventListener("dragover", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drop-target");
  });
  zone.addEventListener("dragleave", (event) => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove("drop-target");
  });
  zone.addEventListener("drop", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    zone.classList.remove("drop-target");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) onFiles(files);
  });
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

/**
 * A map layout, its player counts read back from its name.
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
 * @param {HTMLElement} span
 * @param {string} html trusted markup; caller escapes any contributor text
 * @param {"" | "bad"} [tone]
 * @returns {void}
 */
function setStatus(span, html, tone = "") {
  span.innerHTML = html;
  span.classList.toggle("bad", tone === "bad");
}

/**
 * Wires one panel into its elements and returns its controls.
 *
 * @param {UploadPanelOptions} options
 * @returns {UploadPanel}
 */
export function createUploadPanel(options) {
  const { elements: ui, slug, staged, mapCodes, headerHint, mapsHint, onChange } = options;
  const notify = options.notify ?? (() => {});

  /** @type {PendingUpload | null} */
  let headerUpload = null;
  /** @type {MapUpload[]} */
  let mapUploads = [];
  let collision = false;
  /** What the header's rename box was last filled with from the scenario's name. */
  let headerAutoName = "";

  /**
   * Shows the header card for the staged header image, or the add button
   * alone when there is none.
   *
   * @returns {void}
   */
  function renderHeaderCard() {
    ui.headerCard.hidden = headerUpload === null;
    ui.headerAdd.textContent = headerUpload ? "Replace header image" : ADD_FIRST_HEADER;
    if (headerUpload) {
      ui.headerOrig.textContent = headerUpload.originalName;
      ui.headerPreview.src = previewUrl(headerUpload);
    } else {
      ui.headerName.value = "";
      ui.headerOrig.textContent = "";
      ui.headerPreview.removeAttribute("src");
    }
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
    return withExtension(sanitizeUploadName(ui.headerName.value || slug()), ext);
  }

  /**
   * Re-stages the header image under whatever target name is in its rename
   * box, dropping the path it was staged at before.
   *
   * @returns {void}
   */
  function restageHeader() {
    if (!headerUpload) return;
    if (headerUpload.path) staged.delete(headerUpload.path);
    const path = `${IMAGES_DIR}${headerTargetName(headerUpload)}`;
    headerUpload.path = path;
    staged.set(path, headerUpload.bytes);
    setStatus(ui.headerStatus, headerHint);
    onChange();
  }

  /** Empties the map rows, once the last layout is gone. @returns {void} */
  function resetMapList() {
    collision = false;
    ui.mapsAdd.textContent = ADD_FIRST_MAP;
    ui.mapsList.innerHTML = "";
    ui.mapsList.hidden = true;
    setStatus(ui.mapsStatus, mapsHint);
    onChange();
  }

  /**
   * A map layout's target image name: the contributor's own, if they typed
   * one, else the one its ticked player counts derive.
   *
   * @param {MapUpload} item
   * @returns {string}
   */
  function mapTargetName(item) {
    const name = item.customName ?? mapImageName(slug(), item.counts);
    return withExtension(sanitizeUploadName(name), MAP_EXTENSION);
  }

  /**
   * Unstages a map layout's image and its map file.
   *
   * @param {MapUpload} item
   * @returns {void}
   */
  function unstageMap(item) {
    if (item.path) staged.delete(item.path);
    if (item.mapFilePath) staged.delete(item.mapFilePath);
    item.mapFilePath = null;
  }

  /**
   * Re-stages every map image, and each one's map file, under its target
   * name. A save string that is not base64 stages no map file until fixed.
   *
   * @returns {void}
   */
  function restageMaps() {
    for (const item of mapUploads) unstageMap(item);
    const seen = new Set();
    collision = false;
    let badCode = false;
    const encoder = new TextEncoder();
    for (const item of mapUploads) {
      const name = mapTargetName(item);
      const path = `${MAPS_DIR}${name}`;
      if (seen.has(path)) collision = true;
      seen.add(path);
      item.path = path;
      staged.set(path, item.bytes); // a repeated name: the last file staged under it wins
      const code = normalizeMapCode(item.mapCode);
      if (code === null) badCode = true;
      if (code) {
        item.mapFilePath = `${MAP_FILES_DIR}${withExtension(name, MAP_FILE_EXTENSION)}`;
        staged.set(item.mapFilePath, encoder.encode(mapFileContents(code)));
      }
    }
    const problem = collision ? MAPS_COLLIDE : badCode ? MAP_CODE_BAD : "";
    setStatus(ui.mapsStatus, problem || mapsHint, problem ? "bad" : "");
    onChange();
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
    const mapCode = mapCodes
      ? `
        <label class="upload-mapfile">
          <span>Map editor string <span class="optional">(optional)</span></span>
          <input type="text" class="upload-mapfile-input" spellcheck="false" autocomplete="off"
            placeholder="Paste the string the map editor exports" aria-label="Map editor string for layout ${i + 1}"
            value="${escapeHtml(item.mapCode)}"${badCode ? ' aria-invalid="true"' : ""}>
        </label>`
      : "";
    return `
    <div class="upload-card upload-map" data-index="${i}">
      <div class="upload-card-body">
        <div class="upload-card-head">
          <span class="upload-card-title">Layout ${i + 1}</span>
          <span class="orig-name">${escapeHtml(item.originalName)}</span>
          <button type="button" class="upload-remove" aria-label="Remove layout ${i + 1}" title="Remove this layout">×</button>
        </div>
        <input type="text" class="upload-rename" aria-label="Target filename for layout ${i + 1}" value="${escapeHtml(mapTargetName(item))}">
        <fieldset class="upload-players"><legend>Players</legend>${boxes}</fieldset>${mapCode}
      </div>
      <img class="upload-preview" src="${previewUrl(item)}" alt="Layout ${i + 1} preview">
    </div>
  `;
  }

  /** Draws one row per staged map image. @returns {void} */
  function renderMapUploads() {
    const list = ui.mapsList;
    list.innerHTML = mapUploads.map(mapRowHtml).join("");
    list.hidden = false;
    ui.mapsAdd.textContent = "+ Add another map image";
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
      const mapCode = /** @type {HTMLInputElement | null} */ (row.querySelector(".upload-mapfile-input"));
      if (!mapCode) return;
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
   * Takes one header file, picked or dropped. Anything LaTeX cannot include
   * is refused, and the header staged before stays.
   *
   * @param {File | undefined} file
   * @returns {Promise<void>}
   */
  async function addHeaderFile(file) {
    if (!file) return;
    if (!HEADER_EXTENSIONS.includes(fileExtension(file.name))) {
      setStatus(
        ui.headerStatus,
        `${escapeHtml(file.name)} is not a PNG or JPG — LaTeX cannot include it. Pick another.`,
        "bad",
      );
      ui.headerInput.value = "";
      return;
    }
    if (headerUpload?.path) staged.delete(headerUpload.path);
    releasePreview(headerUpload);
    headerUpload = { bytes: await readAsUint8Array(file), originalName: file.name, path: null, preview: null };
    ui.headerInput.value = "";
    headerAutoName = withExtension(slug(), fileExtension(file.name));
    ui.headerName.value = headerAutoName;
    renderHeaderCard();
    restageHeader();
    notify(`Header image uploaded as ${headerTargetName(headerUpload)}.`);
  }

  /**
   * Takes map files, picked or dropped. They are refused together: one that
   * is not PNG, or one past the limit, adds none of them.
   *
   * @param {File[]} files
   * @returns {Promise<void>}
   */
  async function addMapFiles(files) {
    if (!files.length) return;
    // Emptied at once, so the same picker adds the next layout.
    ui.mapsInput.value = "";
    const notPng = files.filter((file) => fileExtension(file.name) !== MAP_EXTENSION);
    const problem = notPng.length
      ? `${notPng.map((file) => escapeHtml(file.name)).join(", ")} ${notPng.length === 1 ? "is" : "are"} not PNG. None were added — pick again.`
      : mapUploads.length + files.length > MAX_MAP_FILES
        ? `That makes ${mapUploads.length + files.length} layouts, more than the ${MAX_MAP_FILES}-player limit. None were added.`
        : "";
    if (problem) {
      setStatus(ui.mapsStatus, problem, "bad");
      return;
    }
    const added = await Promise.all(files.map(async (file) => newMapUpload(await readAsUint8Array(file), file.name)));
    mapUploads = [...mapUploads, ...added];
    renderMapUploads();
    notify(
      added.length === 1 ? `Map image ${added[0].originalName} uploaded.` : `${added.length} map images uploaded.`,
    );
  }

  ui.mapsAdd.addEventListener("click", () => ui.mapsInput.click());
  ui.headerAdd.addEventListener("click", () => ui.headerInput.click());
  ui.headerRemove.addEventListener("click", () => {
    if (headerUpload?.path) staged.delete(headerUpload.path);
    releasePreview(headerUpload);
    headerUpload = null;
    ui.headerInput.value = "";
    renderHeaderCard();
    setStatus(ui.headerStatus, headerHint);
    onChange();
  });
  ui.headerInput.addEventListener("change", () => {
    const [file] = ui.headerInput.files ?? [];
    void addHeaderFile(file);
  });
  ui.headerName.addEventListener("input", restageHeader);
  // Leaving the box shows the name as it is actually staged.
  ui.headerName.addEventListener("change", () => {
    if (headerUpload) ui.headerName.value = headerTargetName(headerUpload);
  });
  ui.mapsInput.addEventListener("change", () => {
    void addMapFiles([...(ui.mapsInput.files ?? [])]);
  });
  acceptFileDrops(ui.headerZone, (files) => void addHeaderFile(files[0]));
  acceptFileDrops(ui.mapsZone, (files) => void addMapFiles(files));

  return {
    reset() {
      for (const path of [headerUpload?.path, ...mapUploads.flatMap((item) => [item.path, item.mapFilePath])]) {
        if (path) staged.delete(path);
      }
      releasePreview(headerUpload);
      for (const item of mapUploads) releasePreview(item);
      headerUpload = null;
      mapUploads = [];
      collision = false;
      ui.headerInput.value = "";
      renderHeaderCard();
      ui.mapsInput.value = "";
      ui.mapsList.innerHTML = "";
      ui.mapsList.hidden = true;
      ui.mapsAdd.textContent = ADD_FIRST_MAP;
      setStatus(ui.headerStatus, headerHint);
      setStatus(ui.mapsStatus, mapsHint);
    },

    restore(files) {
      const images = files.filter((f) => f.path.startsWith(IMAGES_DIR));
      const maps = files.filter((f) => f.path.startsWith(MAPS_DIR));
      const mapFiles = files.filter((f) => f.path.startsWith(MAP_FILES_DIR));
      const [header, ...extraImages] = images;
      if (header) {
        const originalName = header.path.slice(IMAGES_DIR.length);
        headerUpload = { bytes: header.bytes, originalName, path: null, preview: null };
        ui.headerName.value = originalName;
        renderHeaderCard();
        restageHeader();
      }
      for (const extra of extraImages) staged.set(extra.path, extra.bytes);
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
      for (const extra of mapFiles) if (!pairedMapFiles.has(extra.path)) staged.set(extra.path, extra.bytes);
    },

    headerPath() {
      return headerUpload?.path ?? null;
    },

    maps() {
      return mapUploads.flatMap((item) =>
        item.path ? [{ path: item.path, bytes: item.bytes, counts: [...item.counts].sort((a, b) => a - b) }] : [],
      );
    },

    mapsCollide() {
      return collision;
    },

    followSlug() {
      // A name the contributor typed stays theirs.
      if (headerUpload && ui.headerName.value === headerAutoName) {
        headerAutoName = withExtension(slug(), fileExtension(headerUpload.originalName));
        if (ui.headerName.value !== headerAutoName) {
          ui.headerName.value = headerAutoName;
          restageHeader();
        }
      }
      if (mapUploads.length) renderMapUploads();
    },
  };
}

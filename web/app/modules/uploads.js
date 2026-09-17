import { state } from "./state.js";
import { el, escapeHtml } from "./dom.js";

// No server: a chosen file never leaves the browser, it just joins the
// virtual filesystem the build compiles from, under an editable target path.
const MAX_MAP_FILES = 6;

let headerUpload = null;  // {bytes, path} | null
let mapUploads = [];      // [{bytes, originalName, path}]

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
  setUploadStatus("upload-header-status", "Goes to <code>assets/images/</code>.");
  setUploadStatus("upload-maps-status", "One file for the whole scenario, or up to six — one per player. Goes to <code>assets/maps/</code>.");
}

export function setUploadStatus(id, html, tone = "") {
  const span = el(id);
  span.innerHTML = html;
  span.classList.toggle("bad", tone === "bad");
}

export async function readAsUint8Array(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function restageHeader() {
  if (!headerUpload) return;
  if (headerUpload.path) state.uploadedFiles.delete(headerUpload.path);
  const name = el("upload-header-name").value.trim() || headerUpload.originalName;
  const path = `assets/images/${name}`;
  headerUpload.path = path;
  state.uploadedFiles.set(path, headerUpload.bytes);
  setUploadStatus("upload-header-status", `Staged: <code>${escapeHtml(path)}</code>`);
}

export function restageMaps() {
  for (const item of mapUploads) if (item.path) state.uploadedFiles.delete(item.path);
  const inputs = [...el("upload-maps-names").querySelectorAll(".upload-rename")];
  const seen = new Set();
  let collision = false;
  mapUploads.forEach((item, i) => {
    const name = (inputs[i] ? inputs[i].value.trim() : "") || item.originalName;
    const path = `assets/maps/${name}`;
    if (seen.has(path)) collision = true;
    seen.add(path);
    item.path = path;
    state.uploadedFiles.set(path, item.bytes); // a repeated name: the last file staged under it wins
  });
  setUploadStatus(
    "upload-maps-status",
    collision
      ? "Two files share the same target name — only the last one staged under it is kept."
      : `Staged: ${mapUploads.map((m) => `<code>${escapeHtml(m.path)}</code>`).join(", ")}`,
    collision ? "bad" : "",
  );
}

export function renderMapUploads() {
  const list = el("upload-maps-names");
  list.innerHTML = mapUploads.map((item, i) => `
    <div class="upload-rename-row">
      <span class="orig-name">${escapeHtml(item.originalName)} →</span>
      <input type="text" class="upload-rename" data-index="${i}" value="${escapeHtml(item.originalName)}">
    </div>
  `).join("");
  list.hidden = false;
  list.querySelectorAll(".upload-rename").forEach((input) => input.addEventListener("input", restageMaps));
  restageMaps();
}

export function restoreUploads(files) {
  const images = files.filter((f) => f.path.startsWith("assets/images/"));
  const maps = files.filter((f) => f.path.startsWith("assets/maps/"));
  const [header, ...extraImages] = images;
  if (header) {
    const originalName = header.path.slice("assets/images/".length);
    headerUpload = { bytes: header.bytes, originalName, path: null };
    el("upload-header-name").hidden = false;
    el("upload-header-name").value = originalName;
    restageHeader();
  }
  for (const extra of extraImages) state.uploadedFiles.set(extra.path, extra.bytes);
  if (maps.length) {
    mapUploads = maps.map((f) => ({ bytes: f.bytes, originalName: f.path.slice("assets/maps/".length), path: null }));
    renderMapUploads();
  }
}

export function initUploads() {
  el("upload-toggle").addEventListener("click", (event) => {
    event.stopPropagation();
    el("upload-popover").hidden = !el("upload-popover").hidden;
  });
  el("upload-popover").addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => { el("upload-popover").hidden = true; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") el("upload-popover").hidden = true;
  });

  el("upload-header").addEventListener("change", async () => {
    const [file] = el("upload-header").files;
    if (!file) return;
    if (headerUpload && headerUpload.path) state.uploadedFiles.delete(headerUpload.path);
    headerUpload = { bytes: await readAsUint8Array(file), originalName: file.name, path: null };
    el("upload-header-name").hidden = false;
    el("upload-header-name").value = file.name;
    restageHeader();
  });
  el("upload-header-name").addEventListener("input", restageHeader);

  el("upload-maps").addEventListener("change", async () => {
    const files = [...el("upload-maps").files];
    if (!files.length) return;
    if (files.length > MAX_MAP_FILES) {
      setUploadStatus("upload-maps-status", `Chose ${files.length} files, more than the ${MAX_MAP_FILES}-player limit. None were staged — pick again.`, "bad");
      el("upload-maps").value = "";
      return;
    }
    for (const item of mapUploads) if (item.path) state.uploadedFiles.delete(item.path);
    mapUploads = await Promise.all(files.map(async (file) => ({
      bytes: await readAsUint8Array(file),
      originalName: file.name,
      path: null,
    })));
    renderMapUploads();
  });
}

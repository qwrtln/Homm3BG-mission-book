// Reads one pixel out of a PNG the export wrote, well enough for tier 2 to
// tell the stub's pages apart by color.
//
// Handles only what canvas.toBlob("image/png") produces in Chromium: 8-bit
// RGB (color type 2, for an opaque canvas) or RGBA (color type 6), not
// interlaced. Anything else throws rather than returning a wrong color.

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE_SIZE = 8;
/** Bytes per pixel, by the color types this reader supports. */
const PIXEL_SIZE = { 2: 3, 6: 4 };

/**
 * The Paeth predictor from the PNG specification, section 9.4.
 *
 * @param {number} left
 * @param {number} up
 * @param {number} upLeft
 * @returns {number}
 */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  if (toUp <= toUpLeft) return up;
  return upLeft;
}

/**
 * Reverses one scanline's filter in place, against the already unfiltered
 * line above it (all zeros for the first line).
 *
 * @param {number} filter the line's filter type byte, 0 to 4
 * @param {Uint8Array} line the line's bytes, without the filter byte
 * @param {Uint8Array} above the unfiltered line above
 * @param {number} pixelSize bytes per pixel
 * @returns {void}
 */
function unfilter(filter, line, above, pixelSize) {
  for (let i = 0; i < line.length; i += 1) {
    const left = i >= pixelSize ? line[i - pixelSize] : 0;
    const up = above[i];
    const upLeft = i >= pixelSize ? above[i - pixelSize] : 0;
    let predictor;
    if (filter === 0) predictor = 0;
    else if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = Math.floor((left + up) / 2);
    else if (filter === 4) predictor = paeth(left, up, upLeft);
    else throw new Error(`unknown PNG filter type ${filter}`);
    line[i] = (line[i] + predictor) & 0xff;
  }
}

/**
 * The RGBA color of one pixel of a PNG.
 *
 * @param {Uint8Array} png the whole file's bytes
 * @param {number} x 0-based column
 * @param {number} y 0-based row
 * @returns {[number, number, number, number]} red, green, blue, alpha (255 for RGB)
 */
export function pngPixel(png, x, y) {
  const bytes = Buffer.from(png);
  const idat = [];
  let width = 0;
  let pixelSize = 0;
  for (let offset = PNG_SIGNATURE_SIZE; offset < bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      const [bitDepth, colorType, , , interlace] = data.subarray(8, 13);
      pixelSize = PIXEL_SIZE[colorType] ?? 0;
      if (bitDepth !== 8 || pixelSize === 0 || interlace !== 0) {
        throw new Error(`unsupported PNG: bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * pixelSize;
  let above = new Uint8Array(stride);
  for (let row = 0; row <= y; row += 1) {
    const start = row * (stride + 1);
    const line = Uint8Array.from(raw.subarray(start + 1, start + 1 + stride));
    unfilter(raw[start], line, above, pixelSize);
    above = line;
  }
  const at = x * pixelSize;
  return [above[at], above[at + 1], above[at + 2], pixelSize === 4 ? above[at + 3] : 255];
}

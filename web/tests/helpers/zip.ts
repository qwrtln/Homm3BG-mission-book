// Reads a zip archive built by client-zip well enough for tier 2 to check an
// export's names, order and bytes.
//
// Reads the central directory, not the local headers: client-zip streams a
// Response, so a local header's own size/CRC fields may be written as a data
// descriptor after the entry's data instead of up front. The central
// directory, written once the whole archive is known, always has the real
// values.

import { crc32 } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** The value recorded in the zip's central directory. */
  crc32: number;
}

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

/**
 * Finds the end-of-central-directory record, scanning back from the end: the
 * archive carries no comment, so it is the last 22 bytes.
 *
 * @returns its offset
 */
function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new Error("No end-of-central-directory record found; this is not a zip archive.");
}

/**
 * One entry's bytes, read from its local file header at `offset`.
 *
 * @param offset the local file header's offset, from the central directory
 * @param compressedSize from the central directory; equal to the
 *   uncompressed size, since client-zip stores entries without compressing them
 */
function readLocalFileData(buffer: Buffer, offset: number, compressedSize: number): Uint8Array {
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`No local file header at offset ${offset}.`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  return new Uint8Array(buffer.subarray(dataStart, dataStart + compressedSize));
}

/**
 * Walks a zip archive's central directory and reads each entry's data.
 *
 * @param buffer the whole archive's bytes
 * @returns entries in the order the central directory lists them
 */
export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`No central directory entry at offset ${offset}.`);
    }
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({ name, data: readLocalFileData(buffer, localHeaderOffset, compressedSize), crc32: crc });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Checks every entry's recorded CRC-32 against Node's own implementation of
 * the same data.
 *
 * @throws {Error} naming the first entry whose data does not hash to its recorded CRC-32
 */
export function assertValidCrc32(entries: ZipEntry[]): void {
  for (const entry of entries) {
    const actual = crc32(entry.data);
    if (actual !== entry.crc32) {
      throw new Error(`${entry.name}: CRC-32 mismatch (the zip says ${entry.crc32}, the data hashes to ${actual})`);
    }
  }
}

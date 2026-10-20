import {
  type ChecksumMismatch,
  type ChecksumReport,
  cksumRegion,
  computeFileChecksums,
} from "./checksum.js";
import { CIB_LENGTH, HEADER_LENGTH, HeaderOffset, MAGIC } from "./constants.js";
import { decode, decodeAscii, encodingForVersion } from "./encoding.js";
import { PuzChecksumError, PuzParseError } from "./errors.js";
import type { PuzSection, RawPuz } from "./raw.js";

export interface ParseOptions {
  /** Throw {@link PuzChecksumError} if any checksum doesn't match. Default `false`. */
  strict?: boolean;
}

export interface ParseResult {
  raw: RawPuz;
  checksums: ChecksumReport;
}

const MAGIC_BYTES = Uint8Array.from([...MAGIC].map((c) => c.charCodeAt(0)).concat(0));

function findMagic(bytes: Uint8Array): number {
  outer: for (let i = HeaderOffset.MAGIC; i <= bytes.length - MAGIC_BYTES.length; i++) {
    for (let k = 0; k < MAGIC_BYTES.length; k++) {
      if (bytes[i + k] !== MAGIC_BYTES[k]) continue outer;
    }
    return i - HeaderOffset.MAGIC;
  }
  return -1;
}

/** Parse the bytes of a .puz file. Leading garbage before the header is skipped. */
export function parsePuz(input: Uint8Array, options: ParseOptions = {}): ParseResult {
  const start = findMagic(input);
  if (start < 0) throw new PuzParseError("Not a .puz file: ACROSS&DOWN magic string not found");
  const bytes = input.subarray(start);
  if (bytes.length < HEADER_LENGTH)
    throw new PuzParseError("File is too short to contain a header");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);

  const versionBytes = bytes.subarray(HeaderOffset.VERSION, HeaderOffset.VERSION + 4);
  const nul = versionBytes.indexOf(0);
  const version = decodeAscii(nul >= 0 ? versionBytes.subarray(0, nul) : versionBytes);
  const encoding = encodingForVersion(version);

  const width = bytes[HeaderOffset.WIDTH]!;
  const height = bytes[HeaderOffset.HEIGHT]!;
  const numClues = u16(HeaderOffset.NUM_CLUES);
  if (width === 0 || height === 0) throw new PuzParseError(`Invalid grid size ${width}x${height}`);

  const cells = width * height;
  let pos = HEADER_LENGTH;
  if (bytes.length < pos + 2 * cells) throw new PuzParseError("File is truncated inside the grid");
  const solutionBytes = bytes.subarray(pos, (pos += cells));
  const stateBytes = bytes.subarray(pos, (pos += cells));

  const readString = (): Uint8Array => {
    const end = bytes.indexOf(0, pos);
    const s = bytes.subarray(pos, end < 0 ? bytes.length : end);
    pos = end < 0 ? bytes.length : end + 1;
    return s;
  };

  const titleBytes = readString();
  const authorBytes = readString();
  const copyrightBytes = readString();
  const clueBytes: Uint8Array[] = [];
  for (let i = 0; i < numClues; i++) {
    if (pos >= bytes.length)
      throw new PuzParseError(`File is truncated: found ${i} of ${numClues} clues`);
    clueBytes.push(readString());
  }
  const notesBytes = readString();

  const mismatches: ChecksumMismatch[] = [];
  const sections: PuzSection[] = [];
  while (pos + 8 <= bytes.length) {
    const title = decodeAscii(bytes.subarray(pos, pos + 4));
    if (!/^[\x20-\x7e]{4}$/.test(title)) break; // trailing garbage
    const length = u16(pos + 4);
    const storedChecksum = u16(pos + 6);
    const dataStart = pos + 8;
    if (dataStart + length > bytes.length) {
      if (options.strict) throw new PuzParseError(`Section ${title} is truncated`);
      break;
    }
    const data = bytes.slice(dataStart, dataStart + length);
    const computed = cksumRegion(data);
    if (computed !== storedChecksum) {
      mismatches.push({ name: `section:${title}`, stored: storedChecksum, computed });
    }
    sections.push({ title, data });
    pos = dataStart + length + 1; // skip null terminator
  }

  const computed = computeFileChecksums({
    version,
    cib: bytes.subarray(HeaderOffset.WIDTH, HeaderOffset.WIDTH + CIB_LENGTH),
    solution: solutionBytes,
    state: stateBytes,
    title: titleBytes,
    author: authorBytes,
    copyright: copyrightBytes,
    clues: clueBytes,
    notes: notesBytes,
  });
  const storedFile = u16(HeaderOffset.FILE_CHECKSUM);
  const storedCib = u16(HeaderOffset.CIB_CHECKSUM);
  const storedMasked = toHex(
    bytes.subarray(HeaderOffset.MASKED_CHECKSUMS, HeaderOffset.MASKED_CHECKSUMS + 8),
  );
  if (computed.file !== storedFile)
    mismatches.unshift({ name: "file", stored: storedFile, computed: computed.file });
  if (computed.cib !== storedCib)
    mismatches.unshift({ name: "cib", stored: storedCib, computed: computed.cib });
  if (toHex(computed.masked) !== storedMasked) {
    mismatches.push({ name: "masked", stored: storedMasked, computed: toHex(computed.masked) });
  }
  const checksums: ChecksumReport = { valid: mismatches.length === 0, mismatches };
  if (options.strict && !checksums.valid) {
    const names = mismatches.map((m) => m.name).join(", ");
    throw new PuzChecksumError(`Checksum mismatch: ${names}`, checksums);
  }

  const raw: RawPuz = {
    version,
    width,
    height,
    puzzleType: u16(HeaderOffset.PUZZLE_TYPE),
    solutionState: u16(HeaderOffset.SOLUTION_STATE),
    scrambledChecksum: u16(HeaderOffset.SCRAMBLED_CHECKSUM),
    reserved1C: u16(HeaderOffset.RESERVED_1C),
    reserved20: bytes.slice(HeaderOffset.RESERVED_20, HeaderOffset.RESERVED_20 + 12),
    // Grids are always one byte per square, regardless of string encoding.
    solution: decode(solutionBytes),
    state: decode(stateBytes),
    title: decode(titleBytes, encoding),
    author: decode(authorBytes, encoding),
    copyright: decode(copyrightBytes, encoding),
    clues: clueBytes.map((c) => decode(c, encoding)),
    notes: decode(notesBytes, encoding),
    sections,
  };
  return { raw, checksums };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

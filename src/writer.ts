import { cksumRegion, computeFileChecksums } from "./checksum.js";
import { CIB_LENGTH, HEADER_LENGTH, HeaderOffset, MAGIC } from "./constants.js";
import { encode, encodeAscii, encodingForVersion } from "./encoding.js";
import { PuzError } from "./errors.js";
import type { RawPuz } from "./raw.js";

/** Serialize a {@link RawPuz} to .puz bytes, computing every checksum. */
export function serializePuz(raw: RawPuz): Uint8Array {
  const squareCount = raw.width * raw.height;
  if (raw.width < 1 || raw.width > 255 || raw.height < 1 || raw.height > 255) {
    throw new PuzError(`Invalid grid size ${raw.width}x${raw.height}`);
  }
  if (raw.version.length > 3)
    throw new PuzError(`Version "${raw.version}" is longer than 3 characters`);

  const encoding = encodingForVersion(raw.version);
  const solution = encode(raw.solution);
  const state = encode(raw.state);
  if (solution.length !== squareCount || state.length !== squareCount) {
    throw new PuzError(`Solution and state must each be ${squareCount} single-byte characters`);
  }
  const title = encode(raw.title, encoding);
  const author = encode(raw.author, encoding);
  const copyright = encode(raw.copyright, encoding);
  const clues = raw.clues.map((c) => encode(c, encoding));
  const notes = encode(raw.notes, encoding);

  const header = new Uint8Array(HEADER_LENGTH);
  const view = new DataView(header.buffer);
  header.set(encodeAscii(MAGIC), HeaderOffset.MAGIC);
  header.set(encodeAscii(raw.version), HeaderOffset.VERSION);
  view.setUint16(HeaderOffset.RESERVED_1C, raw.reserved1C, true);
  view.setUint16(HeaderOffset.SCRAMBLED_CHECKSUM, raw.scrambledChecksum, true);
  header.set(raw.reserved20.subarray(0, 12), HeaderOffset.RESERVED_20);
  header[HeaderOffset.WIDTH] = raw.width;
  header[HeaderOffset.HEIGHT] = raw.height;
  view.setUint16(HeaderOffset.NUM_CLUES, clues.length, true);
  view.setUint16(HeaderOffset.PUZZLE_TYPE, raw.puzzleType, true);
  view.setUint16(HeaderOffset.SOLUTION_STATE, raw.solutionState, true);

  const checksums = computeFileChecksums({
    version: raw.version,
    cib: header.subarray(HeaderOffset.WIDTH, HeaderOffset.WIDTH + CIB_LENGTH),
    solution,
    state,
    title,
    author,
    copyright,
    clues,
    notes,
  });
  view.setUint16(HeaderOffset.FILE_CHECKSUM, checksums.file, true);
  view.setUint16(HeaderOffset.CIB_CHECKSUM, checksums.cib, true);
  header.set(checksums.masked, HeaderOffset.MASKED_CHECKSUMS);

  const parts: Uint8Array[] = [header, solution, state];
  for (const s of [title, author, copyright, ...clues, notes]) parts.push(s, NULL);

  for (const section of raw.sections) {
    if (!/^[\x20-\x7e]{4}$/.test(section.title)) {
      throw new PuzError(
        `Section title must be 4 printable ASCII characters, got "${section.title}"`,
      );
    }
    if (section.data.length > 0xffff) throw new PuzError(`Section ${section.title} is too large`);
    const sectionHeader = new Uint8Array(8);
    sectionHeader.set(encodeAscii(section.title));
    const sv = new DataView(sectionHeader.buffer);
    sv.setUint16(4, section.data.length, true);
    sv.setUint16(6, cksumRegion(section.data), true);
    parts.push(sectionHeader, section.data, NULL);
  }

  return concat(parts);
}

const NULL = new Uint8Array([0]);

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

import { versionAtLeast } from "./raw.js";

/** The rolling 16-bit checksum used throughout the .puz format. */
export function cksumRegion(data: Uint8Array, cksum = 0): number {
  let c = cksum;
  for (let i = 0; i < data.length; i++) {
    c = c & 1 ? (c >>> 1) | 0x8000 : c >>> 1;
    c = (c + data[i]!) & 0xffff;
  }
  return c;
}

const NULL = new Uint8Array([0]);

/** Encoded byte regions the file-level checksums are computed over. Strings exclude their null terminator. */
export interface ChecksumInput {
  version: string;
  /** The 8 header bytes from 0x2C (width, height, clue count, type, solution state). */
  cib: Uint8Array;
  solution: Uint8Array;
  state: Uint8Array;
  title: Uint8Array;
  author: Uint8Array;
  copyright: Uint8Array;
  clues: Uint8Array[];
  notes: Uint8Array;
}

export interface FileChecksums {
  file: number;
  cib: number;
  /** The 8 "ICHEATED"-masked bytes at 0x10. */
  masked: Uint8Array;
}

function textChecksum(input: ChecksumInput, cksum: number): number {
  let c = cksum;
  // Title, author, copyright and notes count only when non-empty, including their null.
  for (const s of [input.title, input.author, input.copyright]) {
    if (s.length > 0) c = cksumRegion(NULL, cksumRegion(s, c));
  }
  // Clues are checksummed without their null terminator.
  for (const clue of input.clues) c = cksumRegion(clue, c);
  if (versionAtLeast(input.version, 1, 3) && input.notes.length > 0) {
    c = cksumRegion(NULL, cksumRegion(input.notes, c));
  }
  return c;
}

export function computeFileChecksums(input: ChecksumInput): FileChecksums {
  const cib = cksumRegion(input.cib);
  const file = textChecksum(input, cksumRegion(input.state, cksumRegion(input.solution, cib)));

  const parts = [
    cib,
    cksumRegion(input.solution),
    cksumRegion(input.state),
    textChecksum(input, 0),
  ];
  const mask = "ICHEATED";
  const masked = new Uint8Array(8);
  for (let i = 0; i < 4; i++) {
    masked[i] = mask.charCodeAt(i) ^ (parts[i]! & 0xff);
    masked[i + 4] = mask.charCodeAt(i + 4) ^ (parts[i]! >>> 8);
  }
  return { file, cib, masked };
}

export interface ChecksumMismatch {
  /** "file", "cib", "masked", or "section:GEXT" etc. */
  name: string;
  /** The value stored in the file. */
  stored: number | string;
  /** The value computed from the file's contents. */
  computed: number | string;
}

export interface ChecksumReport {
  valid: boolean;
  mismatches: ChecksumMismatch[];
}

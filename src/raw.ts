import { BLOCK, PuzzleType, SolutionState } from "./constants.js";

/** An extra section (GEXT, LTIM, ...) as stored in the file. */
export interface PuzSection {
  /** Four ASCII characters. */
  title: string;
  data: Uint8Array;
}

/**
 * A direct, lossless representation of a .puz file's contents. {@link parsePuz} produces
 * one and {@link serializePuz} turns one back into bytes. Checksums aren't stored here:
 * they're verified on read and recomputed on write.
 *
 * Most callers want the higher-level {@link Puzzle} class instead.
 */
export interface RawPuz {
  /** e.g. "1.3". Versions >= 2.0 use UTF-8 for strings. */
  version: string;
  width: number;
  height: number;
  /** Header value at 0x30, see {@link PuzzleType}. */
  puzzleType: number;
  /** Header value at 0x32, see {@link SolutionState}. */
  solutionState: number;
  /** Checksum of the real solution, used to verify an unscramble key. */
  scrambledChecksum: number;
  /** Reserved header bytes, kept so files round-trip unchanged. */
  reserved1C: number;
  /** Reserved header bytes (12 bytes), kept so files round-trip unchanged. */
  reserved20: Uint8Array;
  /** Row-major, one character per square, "." for blocks. */
  solution: string;
  /** Row-major, one character per square, "-" for empty, "." for blocks. */
  state: string;
  title: string;
  author: string;
  copyright: string;
  /** In file order: sorted by number, across before down. */
  clues: string[];
  notes: string;
  sections: PuzSection[];
}

export function emptyRawPuz(width: number, height: number): RawPuz {
  return {
    version: "1.3",
    width,
    height,
    puzzleType: PuzzleType.NORMAL,
    solutionState: SolutionState.UNSCRAMBLED,
    scrambledChecksum: 0,
    reserved1C: 0,
    reserved20: new Uint8Array(12),
    solution: BLOCK.repeat(width * height),
    state: BLOCK.repeat(width * height),
    title: "",
    author: "",
    copyright: "",
    clues: [],
    notes: "",
    sections: [],
  };
}

/** `true` if `version` (like "1.3" or "1.2c") is at least major.minor. */
export function versionAtLeast(version: string, major: number, minor: number): boolean {
  const m = /^(\d+)(?:\.(\d+))?/.exec(version);
  if (!m) return false;
  const vMajor = Number(m[1]);
  const vMinor = Number(m[2] ?? 0);
  return vMajor > major || (vMajor === major && vMinor >= minor);
}

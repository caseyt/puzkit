/** The magic string at offset 0x02 of every .puz file. */
export const MAGIC = "ACROSS&DOWN";

export const HEADER_LENGTH = 0x34;

/** Byte offsets of the fixed-size header fields. */
export const HeaderOffset = {
  FILE_CHECKSUM: 0x00,
  MAGIC: 0x02,
  CIB_CHECKSUM: 0x0e,
  MASKED_CHECKSUMS: 0x10,
  VERSION: 0x18,
  RESERVED_1C: 0x1c,
  SCRAMBLED_CHECKSUM: 0x1e,
  RESERVED_20: 0x20,
  WIDTH: 0x2c,
  HEIGHT: 0x2d,
  NUM_CLUES: 0x2e,
  PUZZLE_TYPE: 0x30,
  SOLUTION_STATE: 0x32,
} as const;

/** The CIB checksum covers the 8 header bytes starting at WIDTH. */
export const CIB_LENGTH = 8;

/** Character used for black squares in the solution and state grids. */
export const BLOCK = ".";
/** Diagramless puzzles may use this for black squares in the solution. */
export const DIAGRAMLESS_BLOCK = ":";

export function isBlockChar(ch: string | undefined): boolean {
  return ch === BLOCK || ch === DIAGRAMLESS_BLOCK;
}

/** Character used for an empty (unfilled) square in the state grid. */
export const EMPTY = "-";

/** Header value at 0x30. */
export const PuzzleType = {
  NORMAL: 0x0001,
  DIAGRAMLESS: 0x0401,
} as const;

/** Header value at 0x32. */
export const SolutionState = {
  UNSCRAMBLED: 0x0000,
  /** The solution is not present in the file. */
  NO_SOLUTION: 0x0002,
  SCRAMBLED: 0x0004,
} as const;

/**
 * Per-square bit flags stored in the GEXT section.
 */
export const CellFlag = {
  PREVIOUSLY_INCORRECT: 0x10,
  INCORRECT: 0x20,
  REVEALED: 0x40,
  CIRCLED: 0x80,
} as const;
export type CellFlag = (typeof CellFlag)[keyof typeof CellFlag];

/** Well-known extra section titles. */
export const SectionTitle = {
  /** Rebus grid: one byte per square, 0 = none, n = RTBL key n-1. */
  GRBS: "GRBS",
  /** Rebus table: " 0:STAR; 1:HEART;" */
  RTBL: "RTBL",
  /** Timer: "seconds,state" where state 0 = running, 1 = stopped. */
  LTIM: "LTIM",
  /** Per-square markup flags, see {@link CellFlag}. */
  GEXT: "GEXT",
  /** User rebus entries: one null-terminated string per square. */
  RUSR: "RUSR",
} as const;

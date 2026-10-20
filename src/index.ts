export {
  Puzzle,
  type Cell,
  type CellRef,
  type CheckResult,
  type ClearOptions,
  type Clue,
  type CreatePuzzleOptions,
  type ReadOptions,
  type SetValueOptions,
  type Timer,
  type WriteOptions,
} from "./puzzle.js";
export type { Direction, Entry, Layout, SquareInfo } from "./grid.js";
export { computeLayout } from "./grid.js";
export {
  BLOCK,
  CellFlag,
  DIAGRAMLESS_BLOCK,
  EMPTY,
  PuzzleType,
  SectionTitle,
  SolutionState,
} from "./constants.js";
export { PuzChecksumError, PuzError, PuzLockedError, PuzParseError } from "./errors.js";

// Low-level access to the file format.
export type { PuzSection, RawPuz } from "./raw.js";
export { parsePuz, type ParseOptions, type ParseResult } from "./reader.js";
export { serializePuz } from "./writer.js";
export { cksumRegion, type ChecksumMismatch, type ChecksumReport } from "./checksum.js";
export { decode, encode, type PuzEncoding } from "./encoding.js";
export { scrambleSolution, unscrambleSolution, scrambledChecksum } from "./scramble.js";
export { base64ToBytes, bytesToBase64 } from "./base64.js";
export { collectBytes, type BinaryInput, type ByteSource } from "./stream.js";

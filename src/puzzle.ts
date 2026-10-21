import { base64ToBytes, bytesToBase64 } from "./base64.js";
import type { ChecksumReport } from "./checksum.js";
import { BLOCK, CellFlag, EMPTY, PuzzleType, SectionTitle, SolutionState } from "./constants.js";
import { encodingForVersion } from "./encoding.js";
import { PuzError, PuzLockedError } from "./errors.js";
import { type Direction, type Entry, type Layout, type SquareInfo, computeLayout } from "./grid.js";
import { type PuzSection, type RawPuz, emptyRawPuz } from "./raw.js";
import { type ParseOptions, parsePuz } from "./reader.js";
import { scrambleSolution, scrambledChecksum, unscrambleSolution } from "./scramble.js";
import {
  type TimerData,
  parseLtim,
  parseRtbl,
  parseRusr,
  serializeLtim,
  serializeRtbl,
  serializeRusr,
} from "./sections.js";
import {
  type BinaryInput,
  type ByteSource,
  bytesToStream,
  collectBytes,
  toUint8Array,
} from "./stream.js";
import { serializePuz } from "./writer.js";

/** A square's row and column, both counted from 0. */
export interface RowCol {
  readonly row: number;
  readonly col: number;
}

/** A clue: an {@link Entry} plus its text. */
export interface Clue extends Entry {
  readonly text: string;
}

/** A snapshot of one square: its position, numbering, solution, and current state. */
export interface Cell extends SquareInfo {
  /** The player's entry, or "" if empty. Multi-letter for rebus entries. */
  readonly value: string;
  /** The correct answer, or `undefined` if the solution is locked or absent. */
  readonly solution: string | undefined;
  /** Raw GEXT bit flags, see {@link CellFlag}. */
  readonly flags: number;
  readonly isCircled: boolean;
  readonly isRevealed: boolean;
  readonly isIncorrect: boolean;
  readonly wasIncorrect: boolean;
  /** `true` if the solution for this square is more than one letter. */
  readonly isRebus: boolean;
}

export interface Timer {
  /** Total elapsed seconds, including the current run if the timer is running. */
  readonly seconds: number;
  readonly running: boolean;
}

export interface ReadOptions extends ParseOptions {
  /**
   * Current time in ms, used as the start time if the file's timer is running.
   * Defaults to `Date.now()`.
   */
  now?: number;
}

export interface WriteOptions {
  /** Current time in ms, used to compute a running timer's value. Defaults to `Date.now()`. */
  now?: number;
}

export interface SetSquareValueOptions {
  /** Overwrite squares that were revealed. Default `false`. */
  force?: boolean;
  /** Keep the case of the entry instead of uppercasing it. Default `false`. */
  preserveCase?: boolean;
}

export interface ClearOptions {
  /** Also clear revealed squares and all check/reveal markup. Default `false`. */
  includeRevealed?: boolean;
}

export interface CheckResult {
  /** Squares that were filled in and checked. */
  readonly checked: readonly number[];
  /** Squares that were filled in incorrectly. */
  readonly incorrect: readonly number[];
}

export interface CreatePuzzleOptions {
  /** Solution rows, all the same length, with "." for blocks. */
  grid: readonly string[];
  /** Clue texts in numbered order. Counts must match the grid. */
  clues: { readonly across: readonly string[]; readonly down: readonly string[] };
  title?: string;
  author?: string;
  copyright?: string;
  notes?: string;
  /** Multi-letter answers keyed by square index. The grid holds each answer's first letter. */
  rebus?: Readonly<Record<number, string>>;
  /** Square indices to circle. */
  circled?: readonly number[];
  /** Header version string. Default "1.3". Use "2.0" for UTF-8 strings. */
  version?: string;
}

const KNOWN_SECTIONS: readonly string[] = [
  SectionTitle.GRBS,
  SectionTitle.RTBL,
  SectionTitle.LTIM,
  SectionTitle.GEXT,
  SectionTitle.RUSR,
];

/**
 * A crossword puzzle loaded from (or destined for) an Across Lite .puz file.
 *
 * Puzzle objects are mutable: methods like {@link setSquareValue} and {@link checkPuzzle} change
 * the puzzle in place. Use {@link clone} to take a copy, e.g. before handing a new value to
 * React state.
 */
export class Puzzle {
  /** Checksum results from when the file was read. Always valid for puzzles built in code. */
  readonly checksums: ChecksumReport;

  #raw: RawPuz;
  #layout: Layout;
  #clues: { across: Clue[]; down: Clue[] } | undefined;
  /** Per-square entry, "" when empty. */
  #values: string[];
  #flags: Uint8Array;
  /** Rebus answers per square (from GRBS + RTBL). */
  #rebus: (string | undefined)[];
  #rebusTable: Map<number, string>;
  #timerMs: number;
  #timerStartedAt: number | undefined;
  /** Section titles present in the original file. */
  #originalSections: Set<string>;

  private constructor(raw: RawPuz, checksums: ChecksumReport, now: number) {
    this.checksums = checksums;
    this.#raw = raw;
    this.#layout = computeLayout(raw.solution, raw.width, raw.height);
    this.#originalSections = new Set(raw.sections.map((s) => s.title));

    const cells = raw.width * raw.height;
    const section = (title: string) => raw.sections.find((s) => s.title === title)?.data;
    const encoding = encodingForVersion(raw.version);

    const userRebus = section(SectionTitle.RUSR);
    const rusr = userRebus ? parseRusr(userRebus, cells, encoding) : [];
    this.#values = Array.from({ length: cells }, (_, i) => {
      if (this.#layout.squares[i]!.isBlock) return "";
      if (rusr[i]) return rusr[i]!;
      const ch = raw.state[i] ?? EMPTY;
      return ch === EMPTY ? "" : ch;
    });

    this.#flags = new Uint8Array(cells);
    const gext = section(SectionTitle.GEXT);
    if (gext) this.#flags.set(gext.subarray(0, cells));

    const rtbl = section(SectionTitle.RTBL);
    this.#rebusTable = rtbl ? parseRtbl(rtbl) : new Map();
    const grbs = section(SectionTitle.GRBS);
    this.#rebus = Array.from({ length: cells }, (_, i) => {
      const key = grbs?.[i];
      return key ? this.#rebusTable.get(key - 1) : undefined;
    });

    const ltim = section(SectionTitle.LTIM);
    const timer: TimerData = ltim ? parseLtim(ltim) : { seconds: 0, running: false };
    this.#timerMs = timer.seconds * 1000;
    this.#timerStartedAt = timer.running ? now : undefined;
  }

  // ---------------------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------------------

  /** Parse a .puz file from bytes (a Uint8Array, Node Buffer, ArrayBuffer, or DataView). */
  static fromBytes(input: BinaryInput, options: ReadOptions = {}): Puzzle {
    const { raw, checksums } = parsePuz(toUint8Array(input), options);
    return new Puzzle(raw, checksums, options.now ?? Date.now());
  }

  /** Parse a base64-encoded .puz file, as returned by e.g. `expo-file-system`. */
  static fromBase64(base64: string, options: ReadOptions = {}): Puzzle {
    return Puzzle.fromBytes(base64ToBytes(base64), options);
  }

  /** Read a .puz file from a WHATWG ReadableStream, a Node.js Readable, or any (async) iterable of bytes. */
  static async fromStream(source: ByteSource, options: ReadOptions = {}): Promise<Puzzle> {
    return Puzzle.fromBytes(await collectBytes(source), options);
  }

  /** Build a puzzle from a {@link RawPuz}. The raw object is copied. */
  static fromRaw(raw: RawPuz, options: { now?: number } = {}): Puzzle {
    return new Puzzle(copyRaw(raw), { valid: true, mismatches: [] }, options.now ?? Date.now());
  }

  /** Build a new, empty puzzle from a solution grid and clues. */
  static create(options: CreatePuzzleOptions): Puzzle {
    const height = options.grid.length;
    const width = options.grid[0]?.length ?? 0;
    if (height === 0 || width === 0) throw new PuzError("Grid must not be empty");
    if (options.grid.some((row) => row.length !== width)) {
      throw new PuzError("All grid rows must be the same length");
    }

    const raw = emptyRawPuz(width, height);
    raw.version = options.version ?? raw.version;
    raw.solution = options.grid.join("").toUpperCase();
    raw.state = raw.solution.replace(/[^.]/g, EMPTY);
    raw.title = options.title ?? "";
    raw.author = options.author ?? "";
    raw.copyright = options.copyright ?? "";
    raw.notes = options.notes ?? "";

    const layout = computeLayout(raw.solution, width, height);
    const { across, down } = options.clues;
    if (across.length !== layout.across.length || down.length !== layout.down.length) {
      throw new PuzError(
        `Grid has ${layout.across.length} across and ${layout.down.length} down entries, ` +
          `but got ${across.length} across and ${down.length} down clues`,
      );
    }
    raw.clues = [...layout.across, ...layout.down]
      .sort((a, b) => a.index - b.index)
      .map((e) => (e.direction === "across" ? across : down)[e.listIndex]!);

    const rebus = Object.entries(options.rebus ?? {});
    if (rebus.length > 0) {
      const answers = [...new Set(rebus.map(([, answer]) => answer.toUpperCase()))];
      const grbs = new Uint8Array(width * height);
      for (const [index, answer] of rebus) {
        const i = Number(index);
        if (raw.solution[i] === undefined || raw.solution[i] === BLOCK) {
          throw new PuzError(`Rebus square ${index} is not a letter square`);
        }
        grbs[i] = answers.indexOf(answer.toUpperCase()) + 1;
      }
      const table = new Map(answers.map((answer, key) => [key, answer]));
      raw.sections.push({ title: SectionTitle.GRBS, data: grbs });
      raw.sections.push({ title: SectionTitle.RTBL, data: serializeRtbl(table) });
    }

    const puzzle = new Puzzle(raw, { valid: true, mismatches: [] }, Date.now());
    for (const i of options.circled ?? []) puzzle.setCircled(i, true);
    return puzzle;
  }

  // ---------------------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------------------

  /** Serialize to .puz bytes. */
  toBytes(options: WriteOptions = {}): Uint8Array {
    return serializePuz(this.toRaw(options));
  }

  toBase64(options: WriteOptions = {}): string {
    return bytesToBase64(this.toBytes(options));
  }

  /** Serialize to a WHATWG ReadableStream. In Node, use `Readable.fromWeb()` to convert. */
  toStream(options: WriteOptions = {}): ReadableStream<Uint8Array> {
    return bytesToStream(this.toBytes(options));
  }

  /** The current puzzle as a {@link RawPuz}, with all user state folded into the grid and sections. */
  toRaw(options: WriteOptions = {}): RawPuz {
    const raw = copyRaw(this.#raw);
    const cells = this.size;
    const encoding = encodingForVersion(raw.version);

    raw.state = this.#values
      .map((v, i) =>
        this.#layout.squares[i]!.isBlock ? (raw.state[i] ?? BLOCK) : v ? v[0]! : EMPTY,
      )
      .join("");

    const generated = new Map<string, Uint8Array>();
    const timer = this.getTimer(options.now);
    if (this.#originalSections.has(SectionTitle.LTIM) || timer.seconds > 0 || timer.running) {
      generated.set(SectionTitle.LTIM, serializeLtim(timer));
    }
    if (this.#originalSections.has(SectionTitle.GEXT) || this.#flags.some((f) => f !== 0)) {
      generated.set(SectionTitle.GEXT, this.#flags.slice());
    }
    const rusr = this.#values.map((v) => (v.length > 1 ? v : undefined));
    if (this.#originalSections.has(SectionTitle.RUSR) || rusr.some((v) => v !== undefined)) {
      generated.set(SectionTitle.RUSR, serializeRusr(rusr, encoding));
    }

    // Update known sections in place, keep unknown sections as-is, then append new ones
    // in the conventional order.
    const sections: PuzSection[] = raw.sections.map((s) => {
      const data = generated.get(s.title);
      generated.delete(s.title);
      return data ? { title: s.title, data } : s;
    });
    for (const title of KNOWN_SECTIONS) {
      const data = generated.get(title);
      if (data) sections.push({ title, data });
    }
    raw.sections = sections;
    if (raw.state.length !== cells) throw new PuzError("Internal error: state length mismatch");
    return raw;
  }

  /** A deep, independent copy, including a running timer. */
  clone(): Puzzle {
    const copy = new Puzzle(copyRaw(this.#raw), this.checksums, 0);
    copy.#originalSections = new Set(this.#originalSections);
    copy.#values = [...this.#values];
    copy.#flags = this.#flags.slice();
    copy.#timerMs = this.#timerMs;
    copy.#timerStartedAt = this.#timerStartedAt;
    return copy;
  }

  // ---------------------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------------------

  get version(): string {
    return this.#raw.version;
  }
  get width(): number {
    return this.#raw.width;
  }
  get height(): number {
    return this.#raw.height;
  }
  /** Number of squares (width × height). */
  get size(): number {
    return this.#raw.width * this.#raw.height;
  }
  get isDiagramless(): boolean {
    return this.#raw.puzzleType === PuzzleType.DIAGRAMLESS;
  }

  get title(): string {
    return this.#raw.title;
  }
  set title(value: string) {
    this.#raw.title = value;
  }
  get author(): string {
    return this.#raw.author;
  }
  set author(value: string) {
    this.#raw.author = value;
  }
  get copyright(): string {
    return this.#raw.copyright;
  }
  set copyright(value: string) {
    this.#raw.copyright = value;
  }
  get notes(): string {
    return this.#raw.notes;
  }
  set notes(value: string) {
    this.#raw.notes = value;
  }

  /** Names of extra sections in the file (GEXT, LTIM, ...), in file order. */
  get sectionTitles(): readonly string[] {
    return this.#raw.sections.map((s) => s.title);
  }

  // ---------------------------------------------------------------------------------------
  // Grid & clues
  // ---------------------------------------------------------------------------------------

  /** The index of the square at `row`, `col`. Throws `RangeError` if out of bounds. */
  toIndex({ row, col }: RowCol): number {
    const inBounds =
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      row >= 0 &&
      row < this.height &&
      col >= 0 &&
      col < this.width;
    if (!inBounds) throw new RangeError(`Square (row ${row}, col ${col}) is outside the grid`);
    return row * this.width + col;
  }

  /** The row and column of a square. Throws `RangeError` if out of bounds. */
  toRowCol(index: number): RowCol {
    this.#check(index);
    return { row: Math.floor(index / this.width), col: index % this.width };
  }

  /** A snapshot of one square. */
  getCell(index: number): Cell {
    const i = this.#check(index);
    const flags = this.#flags[i]!;
    const solution = this.hasSolution && !this.isScrambled ? this.#solutionAt(i) : undefined;
    return {
      ...this.#layout.squares[i]!,
      value: this.#values[i]!,
      solution,
      flags,
      isCircled: (flags & CellFlag.CIRCLED) !== 0,
      isRevealed: (flags & CellFlag.REVEALED) !== 0,
      isIncorrect: (flags & CellFlag.INCORRECT) !== 0,
      wasIncorrect: (flags & CellFlag.PREVIOUSLY_INCORRECT) !== 0,
      isRebus: this.#rebus[i] !== undefined && this.#rebus[i]!.length > 1,
    };
  }

  /** Snapshots of every square, row-major. */
  getCells(): Cell[] {
    return Array.from({ length: this.size }, (_, i) => this.getCell(i));
  }

  isBlock(index: number): boolean {
    return this.#layout.squares[this.#check(index)]!.isBlock;
  }

  get clues(): { readonly across: readonly Clue[]; readonly down: readonly Clue[] } {
    if (!this.#clues) {
      const withText = (e: Entry): Clue => ({ ...e, text: this.#raw.clues[e.index] ?? "" });
      this.#clues = {
        across: this.#layout.across.map(withText),
        down: this.#layout.down.map(withText),
      };
    }
    return this.#clues;
  }

  /** All clues in file order: by number, across before down. */
  get allClues(): readonly Clue[] {
    return [...this.clues.across, ...this.clues.down].sort((a, b) => a.index - b.index);
  }

  /** Look up a clue by direction and printed number. */
  getClue(direction: Direction, number: number): Clue | undefined {
    return this.clues[direction].find((c) => c.number === number);
  }

  /** The across and down clues that pass through a square. */
  cluesAt(index: number): { across: Clue | undefined; down: Clue | undefined } {
    const square = this.#layout.squares[this.#check(index)]!;
    return {
      across: square.across === undefined ? undefined : this.clues.across[square.across],
      down: square.down === undefined ? undefined : this.clues.down[square.down],
    };
  }

  setClueText(clue: Pick<Clue, "direction" | "number">, text: string): void {
    const found = this.getClue(clue.direction, clue.number);
    if (!found) throw new RangeError(`No ${clue.number} ${clue.direction} clue`);
    this.#raw.clues[found.index] = text;
    this.#clues = undefined;
  }

  // ---------------------------------------------------------------------------------------
  // Entries
  // ---------------------------------------------------------------------------------------

  /** The player's entry in a square, or "" if empty. */
  getSquareValue(index: number): string {
    return this.#values[this.#check(index)]!;
  }

  /**
   * Fill a square. Multi-letter values are stored as rebus entries; "" clears the square.
   * Revealed squares are left alone unless `force` is set.
   *
   * @returns `true` if the square changed.
   */
  setSquareValue(index: number, value: string, options: SetSquareValueOptions = {}): boolean {
    const i = this.#check(index);
    if (this.#layout.squares[i]!.isBlock) return false;
    if (!options.force && this.#hasFlag(i, CellFlag.REVEALED)) return false;
    const next = options.preserveCase ? value : value.toUpperCase();
    if (next === EMPTY || next === BLOCK) throw new RangeError(`"${next}" is not a valid entry`);
    if (this.#values[i] === next) return false;
    this.#values[i] = next;
    return true;
  }

  /** Empty a square. Revealed squares are left alone unless `force` is set. */
  clearSquareValue(index: number, options: Pick<SetSquareValueOptions, "force"> = {}): boolean {
    return this.setSquareValue(index, "", options);
  }

  /** Empty every square. */
  clear(options: ClearOptions = {}): void {
    for (let i = 0; i < this.size; i++) {
      if (options.includeRevealed) {
        this.#values[i] = "";
        this.#flags[i] = this.#flags[i]! & CellFlag.CIRCLED;
      } else if (!this.#hasFlag(i, CellFlag.REVEALED)) {
        this.#values[i] = "";
      }
    }
  }

  /** `true` when every letter square has an entry. */
  get isFilled(): boolean {
    return this.#layout.squares.every((s) => s.isBlock || this.#values[s.index] !== "");
  }

  /** `true` when every letter square is filled in correctly. */
  get isSolved(): boolean {
    this.#requireSolution();
    return this.#layout.squares.every((s) => s.isBlock || this.#isCorrect(s.index));
  }

  /**
   * Whether a square's entry is correct. Rebus squares accept either the full answer or
   * its first letter, as Across Lite does. Empty squares are not correct.
   */
  isCorrect(index: number): boolean {
    this.#requireSolution();
    return this.#isCorrect(this.#check(index));
  }

  // ---------------------------------------------------------------------------------------
  // Markup flags
  // ---------------------------------------------------------------------------------------

  getFlags(index: number): number {
    return this.#flags[this.#check(index)]!;
  }

  hasFlag(index: number, flag: CellFlag): boolean {
    return this.#hasFlag(this.#check(index), flag);
  }

  /** Set or clear one {@link CellFlag} on a square. */
  setFlag(index: number, flag: CellFlag, on: boolean): void {
    const i = this.#check(index);
    this.#flags[i] = on ? this.#flags[i]! | flag : this.#flags[i]! & ~flag;
  }

  isCircled(index: number): boolean {
    return this.hasFlag(index, CellFlag.CIRCLED);
  }

  setCircled(index: number, circled: boolean): void {
    this.setFlag(index, CellFlag.CIRCLED, circled);
  }

  isRevealed(index: number): boolean {
    return this.hasFlag(index, CellFlag.REVEALED);
  }

  // ---------------------------------------------------------------------------------------
  // Check & reveal
  // ---------------------------------------------------------------------------------------

  /**
   * Check squares against the solution and update their markup. Empty squares are skipped.
   * Wrong squares get INCORRECT; a correct square previously marked INCORRECT becomes
   * PREVIOUSLY_INCORRECT.
   */
  checkCells(indexes: Iterable<number>): CheckResult {
    this.#requireSolution();
    const checked: number[] = [];
    const incorrect: number[] = [];
    for (const index of indexes) {
      const i = this.#check(index);
      if (this.#layout.squares[i]!.isBlock || this.#values[i] === "") continue;
      checked.push(i);
      let f = this.#flags[i]!;
      if (this.#isCorrect(i)) {
        if (f & CellFlag.INCORRECT) f = (f & ~CellFlag.INCORRECT) | CellFlag.PREVIOUSLY_INCORRECT;
      } else {
        f |= CellFlag.INCORRECT;
        incorrect.push(i);
      }
      this.#flags[i] = f;
    }
    return { checked, incorrect };
  }

  checkCell(index: number): CheckResult {
    return this.checkCells([index]);
  }

  checkClue(clue: Pick<Clue, "direction" | "number">): CheckResult {
    return this.checkCells(this.#entryCells(clue));
  }

  checkPuzzle(): CheckResult {
    return this.checkCells(this.#allIndices());
  }

  /**
   * Fill squares with their answers and mark them REVEALED. Revealed squares can't be
   * changed by {@link setSquareValue} unless `force` is passed.
   *
   * @returns The squares that were revealed.
   */
  revealCells(indexes: Iterable<number>): number[] {
    this.#requireSolution();
    const revealed: number[] = [];
    for (const index of indexes) {
      const i = this.#check(index);
      if (this.#layout.squares[i]!.isBlock) continue;
      this.#flags[i] = this.#flags[i]! | CellFlag.REVEALED;
      this.#values[i] = this.#solutionAt(i);
      revealed.push(i);
    }
    return revealed;
  }

  revealCell(index: number): number[] {
    return this.revealCells([index]);
  }

  revealClue(clue: Pick<Clue, "direction" | "number">): number[] {
    return this.revealCells(this.#entryCells(clue));
  }

  revealPuzzle(): number[] {
    return this.revealCells(this.#allIndices());
  }

  // ---------------------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------------------

  /** The timer's state at `now` (default `Date.now()`). */
  getTimer(now: number = Date.now()): Timer {
    const running = this.#timerStartedAt !== undefined;
    const ms = this.#timerMs + (running ? Math.max(0, now - this.#timerStartedAt!) : 0);
    return { seconds: Math.floor(ms / 1000), running };
  }

  get timer(): Timer {
    return this.getTimer();
  }

  /** Start the timer. No-op if it is already running. */
  startTimer(now: number = Date.now()): void {
    if (this.#timerStartedAt === undefined) this.#timerStartedAt = now;
  }

  /** Stop the timer, banking the elapsed time. No-op if it is already stopped. */
  stopTimer(now: number = Date.now()): void {
    if (this.#timerStartedAt === undefined) return;
    this.#timerMs += Math.max(0, now - this.#timerStartedAt);
    this.#timerStartedAt = undefined;
  }

  /** Set the elapsed time. Keeps the current running state unless `running` is given. */
  setTimer(
    seconds: number,
    running: boolean = this.#timerStartedAt !== undefined,
    now: number = Date.now(),
  ): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Timer seconds must be >= 0");
    this.#timerMs = seconds * 1000;
    this.#timerStartedAt = running ? now : undefined;
  }

  /** Stop the timer and set it to zero. */
  resetTimer(): void {
    this.#timerMs = 0;
    this.#timerStartedAt = undefined;
  }

  // ---------------------------------------------------------------------------------------
  // Solution lock
  // ---------------------------------------------------------------------------------------

  /** `true` if the solution is scrambled and needs a key to unlock. */
  get isScrambled(): boolean {
    return (this.#raw.solutionState & SolutionState.SCRAMBLED) !== 0;
  }

  /** `false` if the file doesn't include a solution at all. */
  get hasSolution(): boolean {
    return (this.#raw.solutionState & SolutionState.NO_SOLUTION) === 0;
  }

  /**
   * Unscramble a locked solution. The key is checked against the file's scrambled checksum.
   *
   * @returns `true` on success, `false` if the key is wrong.
   */
  unscramble(key: number | string): boolean {
    if (!this.isScrambled) return true;
    const candidate = unscrambleSolution(this.#raw.solution, this.width, this.height, key);
    if (scrambledChecksum(candidate, this.width, this.height) !== this.#raw.scrambledChecksum)
      return false;
    this.#raw.solution = candidate;
    this.#raw.solutionState &= ~SolutionState.SCRAMBLED;
    this.#raw.scrambledChecksum = 0;
    return true;
  }

  /** Lock the solution with a 4-digit key. Only solutions made entirely of A-Z can be scrambled. */
  scramble(key: number | string): void {
    this.#requireSolution();
    const letters = this.#raw.solution.replace(/[.:]/g, "");
    if (!/^[A-Z]*$/.test(letters))
      throw new PuzError("Only solutions made of A-Z can be scrambled");
    if (letters.length < 12) throw new PuzError("Solution is too short to scramble");
    this.#raw.scrambledChecksum = scrambledChecksum(this.#raw.solution, this.width, this.height);
    this.#raw.solution = scrambleSolution(this.#raw.solution, this.width, this.height, key);
    this.#raw.solutionState |= SolutionState.SCRAMBLED;
  }

  // ---------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------

  /** Validate a square index and return it. Throws `RangeError` if out of bounds. */
  #check(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError(`Square ${index} is outside the grid`);
    }
    return index;
  }

  #hasFlag(i: number, flag: number): boolean {
    return (this.#flags[i]! & flag) !== 0;
  }

  #solutionAt(i: number): string {
    return this.#rebus[i] ?? this.#raw.solution[i]!;
  }

  #isCorrect(i: number): boolean {
    const value = this.#values[i]!.toUpperCase();
    if (value === "") return false;
    return (
      value === this.#solutionAt(i).toUpperCase() || value === this.#raw.solution[i]!.toUpperCase()
    );
  }

  #requireSolution(): void {
    if (!this.hasSolution) throw new PuzLockedError("This puzzle has no solution");
    if (this.isScrambled)
      throw new PuzLockedError("The solution is scrambled; call unscramble(key) first");
  }

  #entryCells(clue: Pick<Clue, "direction" | "number">): readonly number[] {
    const found = this.getClue(clue.direction, clue.number);
    if (!found) throw new RangeError(`No ${clue.number} ${clue.direction} clue`);
    return found.cells;
  }

  *#allIndices(): Generator<number> {
    for (let i = 0; i < this.size; i++) yield i;
  }
}

function copyRaw(raw: RawPuz): RawPuz {
  return {
    ...raw,
    reserved20: raw.reserved20.slice(),
    clues: [...raw.clues],
    sections: raw.sections.map((s) => ({ title: s.title, data: s.data.slice() })),
  };
}

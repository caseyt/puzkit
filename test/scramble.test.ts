import { describe, expect, it } from "vitest";
import {
  Puzzle,
  PuzLockedError,
  parsePuz,
  scrambleSolution,
  scrambledChecksum,
  unscrambleSolution,
} from "../src/index.js";
import { keyDigits } from "../src/scramble.js";
import { fixture, samplePuzzle } from "./helpers.js";

// sample-locked-1234.puz was produced by puzpy's lock_solution(1234) from sample.puz.
const SOLUTION = "ABCDEFGHIJKL.MNOPQRSTUVWX";
const LOCKED = "WBYUUFHADIEF.KPRMAMVRSCXQ";

describe("scrambling", () => {
  it("matches puzpy's output", () => {
    expect(scrambleSolution(SOLUTION, 5, 5, 1234)).toBe(LOCKED);
    expect(unscrambleSolution(LOCKED, 5, 5, "1234")).toBe(SOLUTION);
    expect(scrambledChecksum(SOLUTION, 5, 5)).toBe(
      parsePuz(fixture("sample-locked-1234.puz")).raw.scrambledChecksum,
    );
  });

  it("round-trips for many keys and grid shapes", () => {
    const solution = "HELLO.WORLDS.ARE.ROUND.AND.BIG";
    for (const key of ["0000", "1111", "9999", "4821", "1029", 7]) {
      const scrambled = scrambleSolution(solution, 6, 5, key);
      expect(scrambled.replace(/[A-Z]/g, "")).toBe(solution.replace(/[A-Z]/g, ""));
      expect(unscrambleSolution(scrambled, 6, 5, key)).toBe(solution);
    }
  });

  it("validates keys", () => {
    expect(keyDigits(42)).toEqual([0, 0, 4, 2]);
    for (const bad of ["123", "12345", "abcd", 12345])
      expect(() => keyDigits(bad)).toThrow(RangeError);
  });
});

describe("Puzzle locking", () => {
  it("reads a locked file and unlocks it with the right key", () => {
    const p = Puzzle.fromBytes(fixture("sample-locked-1234.puz"));
    expect(p.checksums.valid).toBe(true);
    expect(p.isScrambled).toBe(true);
    expect(p.getCell(0).solution).toBeUndefined();
    expect(() => p.checkPuzzle()).toThrow(PuzLockedError);
    expect(() => p.revealCell(0)).toThrow(PuzLockedError);
    expect(() => p.isSolved).toThrow(PuzLockedError);

    // Entries can still be made while locked.
    expect(p.setSquareValue(0, "A")).toBe(true);

    expect(p.unscramble(4321)).toBe(false);
    expect(p.isScrambled).toBe(true);
    expect(p.unscramble(1234)).toBe(true);
    expect(p.isScrambled).toBe(false);
    expect(p.unscramble(1234)).toBe(true); // already unlocked
    expect(p.isCorrect(0)).toBe(true);
  });

  it("produces the same file as puzpy when locking", () => {
    const p = samplePuzzle();
    p.scramble(1234);
    expect(p.toBytes()).toEqual(new Uint8Array(fixture("sample-locked-1234.puz")));
  });

  it("unlocking restores the original file", () => {
    const p = Puzzle.fromBytes(fixture("sample-locked-1234.puz"));
    p.unscramble("1234");
    expect(p.toBytes()).toEqual(new Uint8Array(fixture("sample.puz")));
  });

  it("refuses to scramble unsuitable solutions", () => {
    expect(() =>
      samplePuzzle({ grid: ["AB1DE", "FGHIJ", "KL.MN", "OPQRS", "TUVWX"] }).scramble(1234),
    ).toThrow(/A-Z/);
    const tiny = Puzzle.create({
      grid: ["AB", "CD"],
      clues: { across: ["a", "b"], down: ["c", "d"] },
    });
    expect(() => tiny.scramble(1234)).toThrow(/too short/);
  });

  it("reports a missing solution", () => {
    const raw = samplePuzzle().toRaw();
    raw.solutionState = 0x0002;
    const p = Puzzle.fromRaw(raw);
    expect(p.hasSolution).toBe(false);
    expect(p.getCell(0).solution).toBeUndefined();
    expect(() => p.checkCell(0)).toThrow(/no solution/);
  });
});

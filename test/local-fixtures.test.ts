/**
 * Round-trip tests against real-world .puz files. Published puzzles are copyrighted, so
 * these files aren't committed: drop any .puz files into test/fixtures/local/ to run them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Puzzle, parsePuz } from "../src/index.js";

const dir = fileURLToPath(new URL("./fixtures/local/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".puz"));

describe.skipIf(files.length === 0)("local fixtures", () => {
  it.each(files)("%s", (name) => {
    const bytes = new Uint8Array(readFileSync(dir + name));
    const { raw, checksums } = parsePuz(bytes);
    expect(checksums.mismatches).toEqual([]);

    const puzzle = Puzzle.fromBytes(bytes, { now: 0 });
    expect(puzzle.allClues.length).toBe(raw.clues.length);
    expect(puzzle.toBytes({ now: 0 })).toEqual(bytes);

    if (puzzle.hasSolution && !puzzle.isScrambled) {
      puzzle.revealPuzzle();
      expect(puzzle.isSolved).toBe(true);
      expect(parsePuz(puzzle.toBytes()).checksums.valid).toBe(true);
    }
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Puzzle, type CreatePuzzleOptions } from "../src/index.js";

/**
 *  1  2  3  4  5
 *  A  B  C  D  E      Across: 1 ABCDE, 6 FGHIJ, 7 KL, 8 MN, 9 OPQRS, 11 TUVWX
 *  6              Down:   1 AFKOT, 2 BGLPU, 3 CH, 4 DIMRW, 5 EJNSX, 10 QV
 *  F  G  H  I  J
 *  7     8
 *  K  L  .  M  N
 *  9     10
 *  O  P  Q  R  S
 *  11
 *  T  U  V  W  X
 */
export const SAMPLE: CreatePuzzleOptions = {
  grid: ["ABCDE", "FGHIJ", "KL.MN", "OPQRS", "TUVWX"],
  clues: {
    across: ["First row", "Second row", "Left stub", "Right stub", "Fourth row", "Last row"],
    down: [
      "First column",
      "Second column",
      "Short top",
      "Fourth column",
      "Last column",
      "Short bottom",
    ],
  },
  title: "Sample Puzzle",
  author: "Test Author",
  copyright: "© 2026 Nobody",
  notes: "Some notes",
};

export function samplePuzzle(overrides: Partial<CreatePuzzleOptions> = {}): Puzzle {
  return Puzzle.create({ ...SAMPLE, ...overrides });
}

export function fixture(name: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
}

export const NOW = 1_700_000_000_000;

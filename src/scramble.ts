/**
 * Across Lite solution scrambling.
 *
 * A locked puzzle's solution is scrambled with a 4-digit key. The letters (blocks excluded)
 * are read in column-major order, then for each key digit: every letter is shifted by the
 * key, the string is rotated left by the digit, and its halves are interleaved.
 * The header's scrambled checksum is the checksum of the unscrambled column-major letters,
 * which is how a key is verified.
 */
import { cksumRegion } from "./checksum.js";
import { isBlockChar } from "./constants.js";
import { encode } from "./encoding.js";

const A = 65;

export function keyDigits(key: number | string): number[] {
  const s = typeof key === "number" ? String(key).padStart(4, "0") : key;
  if (!/^\d{4}$/.test(s)) throw new RangeError(`Scramble key must be 4 digits, got "${s}"`);
  return [...s].map(Number);
}

/** Read a row-major grid in column-major order. */
function transpose(grid: string, width: number, height: number): string {
  let out = "";
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) out += grid[row * width + col];
  }
  return out;
}

/** Inverse of {@link transpose}. */
function untranspose(columns: string, width: number, height: number): string {
  const out = new Array<string>(width * height);
  let i = 0;
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) out[row * width + col] = columns[i++]!;
  }
  return out.join("");
}

function shift(s: string, key: number[], direction: 1 | -1): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const offset = direction * key[i % key.length]!;
    out += String.fromCharCode(A + ((((s.charCodeAt(i) - A + offset) % 26) + 26) % 26));
  }
  return out;
}

function interleave(s: string): string {
  const mid = Math.floor(s.length / 2);
  let out = "";
  for (let i = 0; i < mid; i++) out += s[mid + i]! + s[i]!;
  if (s.length % 2) out += s[s.length - 1];
  return out;
}

function deinterleave(s: string): string {
  let odd = "";
  let even = "";
  for (let i = 0; i < s.length; i++) {
    if (i % 2) odd += s[i];
    else even += s[i];
  }
  return odd + even;
}

/** Replace the non-block characters of `grid`, in order, with the characters of `letters`. */
function refill(grid: string, letters: string): string {
  let i = 0;
  let out = "";
  for (const ch of grid) out += isBlockChar(ch) ? ch : letters[i++];
  return out;
}

function letters(columns: string): string {
  return [...columns].filter((c) => !isBlockChar(c)).join("");
}

export function scrambleSolution(
  solution: string,
  width: number,
  height: number,
  key: number | string,
): string {
  const digits = keyDigits(key);
  const columns = transpose(solution, width, height);
  let s = letters(columns);
  for (const k of digits) {
    s = shift(s, digits, 1);
    s = s.slice(k) + s.slice(0, k);
    s = interleave(s);
  }
  return untranspose(refill(columns, s), width, height);
}

export function unscrambleSolution(
  scrambled: string,
  width: number,
  height: number,
  key: number | string,
): string {
  const digits = keyDigits(key);
  const columns = transpose(scrambled, width, height);
  let s = letters(columns);
  for (const k of [...digits].reverse()) {
    s = deinterleave(s);
    s = s.slice(s.length - k) + s.slice(0, s.length - k);
    s = shift(s, digits, -1);
  }
  return untranspose(refill(columns, s), width, height);
}

/** The checksum stored at header offset 0x1E for a given (unscrambled) solution. */
export function scrambledChecksum(solution: string, width: number, height: number): number {
  return cksumRegion(encode(letters(transpose(solution, width, height))));
}

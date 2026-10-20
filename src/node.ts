/**
 * Node.js file helpers. Kept in a separate entry point so the core library has no Node
 * dependencies and works in browsers and React Native.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Puzzle, type ReadOptions, type WriteOptions } from "./puzzle.js";

/** Read a .puz file from disk. */
export async function readPuzzleFile(path: string, options?: ReadOptions): Promise<Puzzle> {
  return Puzzle.fromBytes(await readFile(path), options);
}

/** Write a puzzle to disk as a .puz file. */
export async function writePuzzleFile(
  path: string,
  puzzle: Puzzle,
  options?: WriteOptions,
): Promise<void> {
  await writeFile(path, puzzle.toBytes(options));
}

/** Read a .puz file from disk by streaming it. */
export async function streamPuzzleFile(path: string, options?: ReadOptions): Promise<Puzzle> {
  return Puzzle.fromStream(createReadStream(path), options);
}

/** A Node.js Readable that yields the puzzle's .puz bytes. */
export function toNodeReadable(puzzle: Puzzle, options?: WriteOptions): Readable {
  return Readable.from([puzzle.toBytes(options)], { objectMode: false });
}

/** Write a puzzle's .puz bytes to a Node.js Writable (or a file path) and wait for it to finish. */
export async function writePuzzleStream(
  destination: Writable | string,
  puzzle: Puzzle,
  options?: WriteOptions,
): Promise<void> {
  const target = typeof destination === "string" ? createWriteStream(destination) : destination;
  await pipeline(toNodeReadable(puzzle, options), target);
}

export { Puzzle };

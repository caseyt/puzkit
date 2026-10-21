# puzkit

A TypeScript library for reading, modifying and writing Across Lite **`.puz`** crossword files.

- No dependencies. Works in Node.js (18+), browsers and React Native.
- Saving a file you just loaded produces exactly the same bytes.
- Checksums are verified when reading and recomputed when writing.

Install

```sh
npm install puzkit
```

---

## Contents

1. [Quick start](#quick-start)
2. [Key concepts](#key-concepts)
3. [Puzzle API](#puzzle-api)
   - [Loading](#loading) · [Saving](#saving) · [Metadata](#metadata) · [Grid and clues](#grid-and-clues) · [Entries](#entries) · [Check and reveal](#check-and-reveal) · [Square flags](#square-flags) · [Timer](#timer) · [Locked solutions](#locked-solutions)
4. [Types](#types)
5. [Node.js helpers (`puzkit/node`)](#nodejs-helpers-puzkitnode)
6. [Low-level functions](#low-level-functions)
7. [Constants](#constants)
8. [Errors](#errors)
9. [Notes](#notes)
10. [Recipes](#recipes)
11. [Development](#development)

---

## Quick start

```ts
import { readPuzzleFile, writePuzzleFile } from "puzkit/node";

const puzzle = await readPuzzleFile("monday.puz");

console.log(puzzle.title); // "A Tale of Twelve Cities"
console.log(puzzle.width, puzzle.height); // 15 15

const clue = puzzle.getClue("across", 1)!;
console.log(clue.text); // "Prepares for a busy evening, maybe"
console.log(clue.cells); // [0, 1, 2, 3]  (square indexes)

puzzle.setSquareValue(0, "D"); // fill square 0
puzzle.setSquareValue(puzzle.toIndex({ row: 0, col: 1 }), "E"); // fill row 0, column 1

const result = puzzle.checkClue({ direction: "across", number: 1 });
console.log(result.incorrect); // indexes of wrong squares, e.g. [1]

puzzle.revealCell(1);
puzzle.startTimer();

await writePuzzleFile("monday.puz", puzzle);
```

---

## Key concepts

**Squares.** The grid has `width × height` squares, numbered row by row from `0`. The square at `row`, `col` has index `row * width + col`. Every method that takes a square takes this index. Use `toIndex({ row, col })` and `toRowCol(index)` to convert. An index outside the grid throws `RangeError`.

**Blocks.** Black squares are called blocks. They have no value, are skipped by check and reveal, and `setSquareValue` on a block does nothing (it returns `false`).

**Clues.** A clue is identified by its `direction` (`"across"` or `"down"`) and its printed `number`. Methods that act on a clue take `{ direction, number }`. Any `Clue` object you got from the puzzle also works.

**Values.** A square's value is a string. An empty square is `""`. A value longer than one letter (like `"STAR"`) is a _rebus_ entry, which is saved to the file correctly.

**Mutability.** A `Puzzle` is changed in place: `setSquareValue`, `checkPuzzle` and the other modifying methods do not return a new puzzle. Call `puzzle.clone()` when you need a separate copy, for example to put a new object into React state.

**Snapshots.** `getCell()`, `getCells()` and `getTimer()` return plain objects describing the puzzle at that moment. They do not update when the puzzle changes.

**The solution.** A file can contain the solution in plain form, in scrambled (locked) form, or not at all. While the solution is unavailable, anything that needs it throws `PuzLockedError`: `check*`, `reveal*`, `isCorrect`, `isSolved` and `scramble`. In that state `getCell().solution` is `undefined`. Entering values always works.

**Time.** Timer methods and the load/save functions take an optional `now`: a time in milliseconds, like `Date.now()`. It defaults to `Date.now()`. Pass it explicitly when you need deterministic results, such as in tests.

---

## Puzzle API

### Loading

All loaders return a new `Puzzle`. Loading is lenient: a file with wrong checksums still loads, and the problems are listed in `puzzle.checksums`. Pass `{ strict: true }` to throw instead.

| Method                                | Input                                                                                                                 | Returns           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `Puzzle.fromBytes(input, options?)`   | `input`: the whole file as a `Uint8Array`, Node `Buffer`, `ArrayBuffer` or `DataView`                                 | `Puzzle`          |
| `Puzzle.fromBase64(base64, options?)` | `base64`: the whole file as a base64 string (standard or URL-safe; whitespace is ignored)                             | `Puzzle`          |
| `Puzzle.fromStream(source, options?)` | `source`: a web `ReadableStream<Uint8Array>`, a Node.js `Readable`, or any sync/async iterable of `Uint8Array` chunks | `Promise<Puzzle>` |
| `Puzzle.fromRaw(raw, options?)`       | `raw`: a [`RawPuz`](#rawpuz) object (it is copied, not kept)                                                          | `Puzzle`          |
| `Puzzle.create(options)`              | `options`: a [`CreatePuzzleOptions`](#createpuzzleoptions) object                                                     | `Puzzle`          |

`options` for the first three is a `ReadOptions` object:

| Option   | Type      | Default      | Meaning                                                                                         |
| -------- | --------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `false`      | Throw `PuzChecksumError` if any checksum is wrong, and `PuzParseError` if a section is cut off. |
| `now`    | `number`  | `Date.now()` | If the file's timer was saved as running, it counts from this time.                             |

`fromRaw` accepts only `{ now?: number }`.

**Errors:** `PuzParseError` if the input is not a `.puz` file, or if the file is cut off before the end of its clues.

`Puzzle.create` builds a new, empty puzzle from a solution grid and clues:

```ts
const puzzle = Puzzle.create({
  grid: ["CAT", "A.O", "BOW"], // "." marks a block
  clues: {
    across: ["Feline", "Ribbon tie"], // in number order
    down: ["Taxi", "Pull behind"],
  },
  title: "Tiny",
});
```

**Errors:** `PuzError` if the grid is empty, if the rows have different lengths, if the number of across or down clues doesn't match the grid, or if a `rebus` index is not a letter square.

### Saving

Saving doesn't change the puzzle. If the timer is running, the time saved includes the run so far.

| Method                      | Returns                      | Notes                                                                                    |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `puzzle.toBytes(options?)`  | `Uint8Array`                 | The complete `.puz` file.                                                                |
| `puzzle.toBase64(options?)` | `string`                     | The complete `.puz` file, base64 encoded.                                                |
| `puzzle.toStream(options?)` | `ReadableStream<Uint8Array>` | Web stream. Throws `Error` if the runtime lacks `ReadableStream`; use `toBytes()` there. |
| `puzzle.toRaw(options?)`    | [`RawPuz`](#rawpuz)          | Plain object form of the file, with no checksums.                                        |
| `puzzle.clone()`            | `Puzzle`                     | A fully independent copy, including a running timer.                                     |

`options` is `{ now?: number }`: the time used to work out a running timer's value.

### Metadata

| Property        | Type                | Access     | Meaning                                                                          |
| --------------- | ------------------- | ---------- | -------------------------------------------------------------------------------- |
| `title`         | `string`            | read/write |                                                                                  |
| `author`        | `string`            | read/write |                                                                                  |
| `copyright`     | `string`            | read/write |                                                                                  |
| `notes`         | `string`            | read/write | Free-text notes shown with the puzzle.                                           |
| `width`         | `number`            | read       | Columns.                                                                         |
| `height`        | `number`            | read       | Rows.                                                                            |
| `size`          | `number`            | read       | `width * height`.                                                                |
| `version`       | `string`            | read       | File format version, e.g. `"1.3"`. `"2.0"` and above store text as UTF-8.        |
| `isDiagramless` | `boolean`           | read       | `true` for diagramless puzzles.                                                  |
| `sectionTitles` | `readonly string[]` | read       | Extra sections present when the file was loaded, e.g. `["GEXT", "LTIM"]`.        |
| `checksums`     | `ChecksumReport`    | read       | Checksum results from loading. Always valid for puzzles from `create`/`fromRaw`. |

```ts
puzzle.checksums;
// { valid: false, mismatches: [{ name: "section:LTIM", stored: 84, computed: 12380 }] }
```

### Grid and clues

| Method / property            | Input                             | Returns                                                                                         |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `toIndex({ row, col })`      | `RowCol`                          | `number`: the index of the square at that row and column                                        |
| `toRowCol(index)`            | `number`                          | `RowCol`: `{ row, col }` of that square                                                         |
| `getCell(index)`             | `number`                          | [`Cell`](#cell) snapshot                                                                        |
| `getCells()`                 |                                   | `Cell[]`: every square, in index order                                                          |
| `isBlock(index)`             | `number`                          | `boolean`                                                                                       |
| `clues`                      |                                   | `{ across: Clue[]; down: Clue[] }`, each in number order                                        |
| `allClues`                   |                                   | `Clue[]`: by number, across before down at the same number                                      |
| `getClue(direction, number)` | `"across" \| "down"`, `number`    | `Clue \| undefined`                                                                             |
| `cluesAt(index)`             | `number`                          | `{ across: Clue \| undefined; down: Clue \| undefined }`: the clues passing through that square |
| `setClueText(clue, text)`    | `{ direction, number }`, `string` | `void`. Throws `RangeError` if there is no such clue.                                           |

All of these throw `RangeError` for a square outside the grid.

```ts
puzzle.getCell(13); // row 2, column 3
// {
//   index: 13, row: 2, col: 3, isBlock: false,
//   number: 8,           // printed clue number, or undefined
//   across: 3, down: 3,  // positions in puzzle.clues.across / .down, or undefined
//   value: "M", solution: "M",
//   flags: 0, isCircled: false, isRevealed: false, isIncorrect: false, wasIncorrect: false,
//   isRebus: false
// }

puzzle.getClue("down", 10);
// { number: 10, direction: "down", text: "Short bottom", cells: [17, 22], index: 10, listIndex: 5 }
```

### Entries

| Method                                   | Input                                       | Returns   | Behaviour                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSquareValue(index)`                  | `number`                                    | `string`  | The square's value, or `""` if it is empty or a block.                                                                                                                                                                                                         |
| `setSquareValue(index, value, options?)` | `number`, `string`, `SetSquareValueOptions` | `boolean` | Sets the value and returns `true` if it changed. `""` empties the square. Uppercased unless `preserveCase` is set. Does nothing (returns `false`) on a block, or on a revealed square unless `force` is set. Throws `RangeError` if `value` is `"-"` or `"."`. |
| `clearSquareValue(index, options?)`      | `number`, `{ force?: boolean }`             | `boolean` | Same as `setSquareValue(index, "", options)`.                                                                                                                                                                                                                  |
| `clear(options?)`                        | `{ includeRevealed?: boolean }`             | `void`    | Empties every square except revealed ones. With `includeRevealed: true`, empties every square and removes all flags except `CIRCLED`.                                                                                                                          |
| `isFilled`                               |                                             | `boolean` | `true` if every non-block square has a value.                                                                                                                                                                                                                  |
| `isSolved`                               |                                             | `boolean` | `true` if every non-block square is correct. Throws `PuzLockedError` if the solution is unavailable.                                                                                                                                                           |
| `isCorrect(index)`                       | `number`                                    | `boolean` | `true` if the value matches the solution (case-insensitive). Empty is never correct. For a rebus square, the full answer or its first letter both count. Throws `PuzLockedError` if the solution is unavailable.                                               |

`SetSquareValueOptions`:

| Option         | Type      | Default | Meaning                                             |
| -------------- | --------- | ------- | --------------------------------------------------- |
| `force`        | `boolean` | `false` | Allow changing a square that has been revealed.     |
| `preserveCase` | `boolean` | `false` | Store the value as given instead of uppercasing it. |

### Check and reveal

Each of these throws `PuzLockedError` if the solution is unavailable, `RangeError` for a square outside the grid, and `RangeError` for a clue that doesn't exist.

| Method                 | Input                    | Returns       |
| ---------------------- | ------------------------ | ------------- |
| `checkCell(index)`     | `number`                 | `CheckResult` |
| `checkCells(indexes)`  | any iterable of `number` | `CheckResult` |
| `checkClue(clue)`      | `{ direction, number }`  | `CheckResult` |
| `checkPuzzle()`        |                          | `CheckResult` |
| `revealCell(index)`    | `number`                 | `number[]`    |
| `revealCells(indexes)` | any iterable of `number` | `number[]`    |
| `revealClue(clue)`     | `{ direction, number }`  | `number[]`    |
| `revealPuzzle()`       |                          | `number[]`    |

**Checking** looks only at squares that have a value (blocks and empty squares are skipped). It updates each square's flags:

- Wrong value: sets `INCORRECT`.
- Correct value on a square marked `INCORRECT`: removes `INCORRECT` and sets `PREVIOUSLY_INCORRECT`.
- Correct value otherwise: no change.

It returns `{ checked, incorrect }`. `checked` lists the indexes of the squares that were checked, and `incorrect` lists the ones that were wrong.

**Revealing** sets each non-block square's value to the answer and sets its `REVEALED` flag. A revealed square can't be changed by `setSquareValue` or `clearSquareValue` unless you pass `force: true`. It returns the indexes of the squares revealed.

```ts
puzzle.checkPuzzle(); // { checked: [0, 1, 5], incorrect: [1] }
puzzle.revealClue({ direction: "down", number: 4 }); // [3, 8, 13, 18, 23]
```

### Square flags

Each square has a bitmask of flags (stored in the file's `GEXT` section). The flags are listed under [`CellFlag`](#constants).

| Method                       | Input                           | Returns   | Meaning                                                   |
| ---------------------------- | ------------------------------- | --------- | --------------------------------------------------------- |
| `getFlags(index)`            | `number`                        | `number`  | The raw bitmask.                                          |
| `hasFlag(index, flag)`       | `number`, `CellFlag`            | `boolean` |                                                           |
| `setFlag(index, flag, on)`   | `number`, `CellFlag`, `boolean` | `void`    | Turns one flag on (`true`) or off (`false`).              |
| `isCircled(index)`           | `number`                        | `boolean` | Shortcut for `hasFlag(index, CellFlag.CIRCLED)`.          |
| `setCircled(index, circled)` | `number`, `boolean`             | `void`    | Shortcut for `setFlag(index, CellFlag.CIRCLED, circled)`. |
| `isRevealed(index)`          | `number`                        | `boolean` | Shortcut for `hasFlag(index, CellFlag.REVEALED)`.         |

### Timer

The timer tracks solving time in whole seconds. While it runs, it counts in memory. Saving writes the total up to `now`, and records whether it was running.

| Method / property                   | Input                              | Returns                                 | Behaviour                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timer`                             |                                    | `{ seconds: number; running: boolean }` | Same as `getTimer()`.                                                                                                                                                         |
| `getTimer(now?)`                    | `number` (ms)                      | `{ seconds: number; running: boolean }` | Total seconds as of `now`, rounded down.                                                                                                                                      |
| `startTimer(now?)`                  | `number` (ms)                      | `void`                                  | Starts counting from `now`. Does nothing if already running.                                                                                                                  |
| `stopTimer(now?)`                   | `number` (ms)                      | `void`                                  | Adds the time since start to the total and stops. Does nothing if already stopped.                                                                                            |
| `setTimer(seconds, running?, now?)` | `number`, `boolean`, `number` (ms) | `void`                                  | Sets the total to `seconds`. `running` defaults to the current state; if `true`, counting continues from `now`. Throws `RangeError` if `seconds` is negative or not a number. |
| `resetTimer()`                      |                                    | `void`                                  | Stops the timer and sets it to 0.                                                                                                                                             |

```ts
puzzle.startTimer(1_000_000);
puzzle.getTimer(1_065_000); // { seconds: 65, running: true }
puzzle.stopTimer(1_065_000);
puzzle.timer; // { seconds: 65, running: false }
```

If a file was saved with the timer running, loading it restarts the timer from the load time (`ReadOptions.now`).

### Locked solutions

Some files ship with the solution scrambled under a 4-digit key. A key is a number (`1234`, or `42`, which becomes `"0042"`) or a 4-digit string (`"1234"`). Any other key throws `RangeError`.

| Method / property | Input              | Returns   | Behaviour                                                                                                                                                                                |
| ----------------- | ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isScrambled`     |                    | `boolean` | `true` if the solution is locked.                                                                                                                                                        |
| `hasSolution`     |                    | `boolean` | `false` if the file has no solution at all.                                                                                                                                              |
| `unscramble(key)` | `number \| string` | `boolean` | Unlocks the solution. Returns `false` (and changes nothing) if the key is wrong, and `true` if it worked or the puzzle wasn't locked.                                                    |
| `scramble(key)`   | `number \| string` | `void`    | Locks the solution. Throws `PuzError` if the solution contains anything other than A–Z letters or has fewer than 12 letters. Throws `PuzLockedError` if it is already locked or missing. |

---

## Types

All types are exported from `"puzkit"`.

```ts
type RowCol = { row: number; col: number }; // returned by toRowCol, accepted by toIndex
type Direction = "across" | "down";
```

### Cell

Returned by `getCell` and `getCells`.

```ts
interface Cell {
  index: number; // row * width + col
  row: number;
  col: number;
  isBlock: boolean;
  number: number | undefined; // printed clue number in this square
  across: number | undefined; // index into puzzle.clues.across of the across clue through this square
  down: number | undefined; // index into puzzle.clues.down of the down clue through this square
  value: string; // "" if empty; may be several letters (rebus)
  solution: string | undefined; // undefined while the solution is unavailable
  flags: number; // CellFlag bitmask
  isCircled: boolean;
  isRevealed: boolean;
  isIncorrect: boolean; // marked wrong by the last check
  wasIncorrect: boolean; // was marked wrong, then fixed
  isRebus: boolean; // the answer is more than one letter
}
```

### Clue

Returned by `clues`, `allClues`, `getClue` and `cluesAt`.

```ts
interface Clue {
  number: number; // printed number
  direction: Direction;
  text: string;
  cells: readonly number[]; // square indexes of the answer, in reading order
  index: number; // position in allClues (the order clues are stored in the file)
  listIndex: number; // position in clues.across or clues.down
}
```

### CheckResult

```ts
interface CheckResult {
  checked: readonly number[]; // squares that had a value and were checked
  incorrect: readonly number[]; // subset of `checked` that were wrong
}
```

### CreatePuzzleOptions

```ts
interface CreatePuzzleOptions {
  grid: readonly string[]; // solution rows, all the same length; "." for blocks
  clues: { across: readonly string[]; down: readonly string[] }; // in number order
  title?: string;
  author?: string;
  copyright?: string;
  notes?: string;
  rebus?: Record<number, string>; // multi-letter answers by square index; grid holds the first letter
  circled?: readonly number[]; // square indexes to circle
  version?: string; // default "1.3"; use "2.0" for UTF-8 text
}
```

### ChecksumReport

```ts
interface ChecksumReport {
  valid: boolean;
  mismatches: {
    name: string; // "file", "cib", "masked", or "section:<TITLE>"
    stored: number | string; // value found in the file
    computed: number | string; // value it should have been
  }[];
}
```

### RawPuz

The file's contents as a plain object, with no checksums. It is used by `toRaw`, `fromRaw`, `parsePuz` and `serializePuz`.

```ts
interface RawPuz {
  version: string; // e.g. "1.3" (at most 3 characters)
  width: number; // 1-255
  height: number; // 1-255
  puzzleType: number; // PuzzleType.NORMAL or PuzzleType.DIAGRAMLESS
  solutionState: number; // SolutionState value
  scrambledChecksum: number; // used to verify an unscramble key
  reserved1C: number; // unused header bytes, kept as-is
  reserved20: Uint8Array; // unused header bytes (12), kept as-is
  solution: string; // one character per square, row by row; "." = block
  state: string; // player's entries, one character per square; "-" = empty, "." = block
  title: string;
  author: string;
  copyright: string;
  clues: string[]; // in allClues order
  notes: string;
  sections: { title: string; data: Uint8Array }[]; // extra sections, e.g. GEXT, LTIM
}
```

---

## Node.js helpers (`puzkit/node`)

These use `node:fs` and live in a separate entry point, so the main `"puzkit"` import works without Node.js. `puzkit/node` also re-exports `Puzzle`.

| Function                                           | Input                                                                                               | Returns                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `readPuzzleFile(path, options?)`                   | file path, `ReadOptions`                                                                            | `Promise<Puzzle>`                           |
| `streamPuzzleFile(path, options?)`                 | file path, `ReadOptions`. Reads the file as a stream.                                               | `Promise<Puzzle>`                           |
| `writePuzzleFile(path, puzzle, options?)`          | file path, `Puzzle`, `{ now?: number }`                                                             | `Promise<void>`                             |
| `writePuzzleStream(destination, puzzle, options?)` | a Node `Writable` or a file path, `Puzzle`, `{ now?: number }`. Resolves when writing has finished. | `Promise<void>`                             |
| `toNodeReadable(puzzle, options?)`                 | `Puzzle`, `{ now?: number }`                                                                        | Node `Readable` that emits the file's bytes |

File system errors (missing file, no permission) are passed through unchanged.

---

## Low-level functions

You don't need these for normal use. They give direct access to the file format.

| Function                                            | Input                                                                                  | Returns                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parsePuz(bytes, options?)`                         | `Uint8Array`, `{ strict?: boolean }`                                                   | `{ raw: RawPuz; checksums: ChecksumReport }`. Throws like `Puzzle.fromBytes`.                                                                                                                                                                                                             |
| `serializePuz(raw)`                                 | `RawPuz`                                                                               | `Uint8Array` with all checksums computed. Throws `PuzError` if the size is outside 1–255, `version` is longer than 3 characters, `solution`/`state` are not `width*height` single-byte characters, a section title isn't 4 printable ASCII characters, or a section is over 65,535 bytes. |
| `computeLayout(solution, width, height)`            | solution string (one character per square, `"."` or `":"` = block), `number`, `number` | `{ squares, across, down }`: the numbering and word positions, with no clue text                                                                                                                                                                                                          |
| `cksumRegion(data, start?)`                         | `Uint8Array`, starting checksum (default `0`)                                          | `number`: the format's 16-bit checksum                                                                                                                                                                                                                                                    |
| `encode(text, encoding?)`                           | `string`, `"windows-1252"` (default) or `"utf-8"`                                      | `Uint8Array`                                                                                                                                                                                                                                                                              |
| `decode(bytes, encoding?)`                          | `Uint8Array`, `"windows-1252"` (default) or `"utf-8"`                                  | `string`                                                                                                                                                                                                                                                                                  |
| `scrambleSolution(solution, width, height, key)`    | solution string, `number`, `number`, key                                               | scrambled solution `string`                                                                                                                                                                                                                                                               |
| `unscrambleSolution(scrambled, width, height, key)` | scrambled string, `number`, `number`, key                                              | solution `string`. Doesn't check the key; compare `scrambledChecksum` of the result with `raw.scrambledChecksum`.                                                                                                                                                                         |
| `scrambledChecksum(solution, width, height)`        | plain solution string, `number`, `number`                                              | `number`                                                                                                                                                                                                                                                                                  |
| `bytesToBase64(bytes)`                              | `Uint8Array`                                                                           | `string`                                                                                                                                                                                                                                                                                  |
| `base64ToBytes(base64)`                             | `string`                                                                               | `Uint8Array`. Throws `TypeError` on invalid characters.                                                                                                                                                                                                                                   |
| `collectBytes(source)`                              | same as `Puzzle.fromStream`'s `source`                                                 | `Promise<Uint8Array>` with all chunks joined                                                                                                                                                                                                                                              |

`computeLayout` returns `squares` items with the `Cell` fields from `index` to `down`. Its `across` and `down` items are the `Clue` fields without `text`.

---

## Constants

```ts
import {
  CellFlag,
  PuzzleType,
  SolutionState,
  SectionTitle,
  BLOCK,
  DIAGRAMLESS_BLOCK,
  EMPTY,
} from "puzkit";
```

| Constant                        | Value    | Meaning                                                  |
| ------------------------------- | -------- | -------------------------------------------------------- |
| `CellFlag.PREVIOUSLY_INCORRECT` | `0x10`   | Was marked wrong, then fixed.                            |
| `CellFlag.INCORRECT`            | `0x20`   | Marked wrong by a check.                                 |
| `CellFlag.REVEALED`             | `0x40`   | Answer was revealed.                                     |
| `CellFlag.CIRCLED`              | `0x80`   | Square is drawn with a circle.                           |
| `PuzzleType.NORMAL`             | `0x0001` |                                                          |
| `PuzzleType.DIAGRAMLESS`        | `0x0401` |                                                          |
| `SolutionState.UNSCRAMBLED`     | `0x0000` |                                                          |
| `SolutionState.NO_SOLUTION`     | `0x0002` | File has no solution.                                    |
| `SolutionState.SCRAMBLED`       | `0x0004` | Solution is locked.                                      |
| `SectionTitle.GRBS` / `.RTBL`   |          | Rebus answers (which squares, and the answer text).      |
| `SectionTitle.RUSR`             |          | Player's rebus entries.                                  |
| `SectionTitle.GEXT`             |          | Square flags.                                            |
| `SectionTitle.LTIM`             |          | Timer.                                                   |
| `BLOCK`                         | `"."`    | Block character in `solution` / `state`.                 |
| `DIAGRAMLESS_BLOCK`             | `":"`    | Alternative block character used by diagramless puzzles. |
| `EMPTY`                         | `"-"`    | Empty square in `state`.                                 |

---

## Errors

Every error this library throws on purpose is one of these classes, except `RangeError` and `TypeError` for invalid arguments.

| Class              | Extends    | Thrown when                                                                                   |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------- |
| `PuzError`         | `Error`    | Base class. Also thrown directly for invalid input to `create`, `scramble` or `serializePuz`. |
| `PuzParseError`    | `PuzError` | The input isn't a readable `.puz` file.                                                       |
| `PuzChecksumError` | `PuzError` | A checksum is wrong and `strict: true` was used. Has a `report: ChecksumReport` property.     |
| `PuzLockedError`   | `PuzError` | The operation needs the solution, but it is scrambled or missing.                             |

```ts
import { Puzzle, PuzParseError } from "puzkit";

try {
  Puzzle.fromBytes(bytes);
} catch (e) {
  if (e instanceof PuzParseError) console.log("Not a .puz file");
}
```

---

## Notes

- **Checksums** are always recomputed on save, so files with bad checksums are repaired when saved.
- **Extra sections** are only written when needed:
  - `GEXT` (flags): if any square has a flag, or the file had this section.
  - `LTIM` (timer): if the time is above 0, the timer is running, or the file had this section.
  - `RUSR` (rebus entries): if any value is longer than one letter, or the file had this section.
- **Text encoding:** files below version 2.0 use Windows-1252, which covers Western European letters and curly quotes/dashes. Characters it can't represent are saved as a close ASCII equivalent or `?`. Version 2.0+ files use UTF-8.
- **Grid characters:** `solution` and `state` are always one byte per square.

---

## Recipes

### React state

```ts
const [puzzle, setPuzzle] = useState(() => Puzzle.fromBase64(data));

function enter(index: number, letter: string) {
  const next = puzzle.clone();
  next.setSquareValue(index, letter);
  setPuzzle(next);
}
```

### React Native / Expo

```ts
import * as FileSystem from "expo-file-system";

const puzzle = Puzzle.fromBase64(await FileSystem.readAsStringAsync(uri, { encoding: "base64" }));
await FileSystem.writeAsStringAsync(uri, puzzle.toBase64(), { encoding: "base64" });
```

### Browser

```ts
const response = await fetch("/puzzles/monday.puz");
const puzzle = await Puzzle.fromStream(response.body!);

const blob = new Blob([puzzle.toBytes()], { type: "application/octet-stream" });
```

### Is it solved?

```ts
if (puzzle.isFilled && puzzle.isSolved) {
  puzzle.stopTimer();
  console.log(`Solved in ${puzzle.timer.seconds}s`);
}
```

---

## Development

```sh
npm install
npm test           # run tests (vitest)
npm run coverage   # tests + coverage; fails below 100% lines / 95% branches
npm run typecheck  # tsc
npm run build      # build dist/ (ESM, CommonJS, and .d.ts) with tsup
npm run format     # prettier
```

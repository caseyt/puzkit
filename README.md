# puzkit

A TypeScript library for reading, modifying and writing Across Lite `**.puz**` crossword files.

- No dependencies. Works in Node.js (18+), browsers and React Native.
- Saving a file you just loaded produces exactly the same bytes.
- Checksums are verified when reading and recomputed when writing.

```sh
npm install puzkit
```

## Quick start

```ts
import { readPuzzleFile, writePuzzleFile } from "puzkit/node";

const puzzle = await readPuzzleFile("monday.puz");

console.log(puzzle.title); // "A Tale of Twelve Cities"
console.log(puzzle.width, puzzle.height); // 15 15

const clue = puzzle.getClue("across", 1)!;
console.log(clue.text); // "Prepares for a busy evening, maybe"
console.log(clue.squares); // [0, 1, 2, 3]  (square indexes)

puzzle.setSquareValue(0, "D"); // fill square 0
puzzle.setSquareValue(puzzle.toIndex({ row: 0, col: 1 }), "E"); // fill row 0, column 1

const result = puzzle.checkClue({ direction: "across", number: 1 });
console.log(result.incorrect); // indexes of wrong squares, e.g. [1]

puzzle.revealSquare(1);
puzzle.startTimer();

await writePuzzleFile("monday.puz", puzzle);
```

## Concepts


| Term     | Meaning                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Square   | One box in the grid. Squares are numbered row by row from `0`: the square at `row`, `col` has index `row * width + col`.                            |
| Block    | A black square. It has no value and is skipped by check and reveal.                                                                                 |
| Value    | The player's entry in a square, as a string. Empty is `""`. A value longer than one letter (like `"STAR"`) is a *rebus* entry.                      |
| Clue     | Identified by its `direction` (`"across"` or `"down"`) and printed `number`. Methods that take a clue accept `{ direction, number }` or a `Clue`.   |
| Solution | The answers. A file can store them plainly, locked (scrambled), or not at all. See [Locked solutions](#locked-solutions).                           |
| `now`    | Optional time in milliseconds taken by timer and save methods. Defaults to `Date.now()`. Pass it to make results predictable, for example in tests. |


A `Puzzle` is changed in place. Methods like `setSquareValue` and `checkPuzzle` do not return a new puzzle. Call `clone()` when you need a separate copy, for example for React state.

## Loading

Static methods that create a `Puzzle`.

Import: `import { Puzzle } from "puzkit"`.


| Name                                  | Arguments                                                                            | Returns           | Description                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------ |
| `Puzzle.fromBytes(input, options?)`   | `Uint8Array` | `ArrayBuffer` | `DataView` | `Buffer`, `[ReadOptions](#read-options)` | `Puzzle`          | Load a `.puz` file from bytes.                   |
| `Puzzle.fromBase64(base64, options?)` | `string`, `[ReadOptions](#read-options)`                                             | `Puzzle`          | Load a base64-encoded `.puz` file.               |
| `Puzzle.fromStream(source, options?)` | `[ByteSource](#byte-sources)`, `[ReadOptions](#read-options)`                        | `Promise<Puzzle>` | Load a `.puz` file from a stream.                |
| `Puzzle.fromRaw(raw, options?)`       | `[RawPuz](#rawpuz)`, `[ReadOptions](#read-options)`                                  | `Puzzle`          | Build a puzzle from the file's raw fields.       |
| `Puzzle.create(options)`              | `[CreatePuzzleOptions](#createpuzzleoptions)`                                        | `Puzzle`          | Build a new, empty puzzle from a grid and clues. |


Loading is lenient: a file with wrong checksums still loads, and the problems are listed in `[puzzle.checksums](#metadata)`. Input that isn't a `.puz` file throws `PuzParseError`.

### Read options


| Name     | Type      | Default      | Description                                                                                     |
| -------- | --------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `false`      | Throw `PuzChecksumError` if any checksum is wrong, and `PuzParseError` if a section is cut off. |
| `now`    | `number`  | `Date.now()` | If the file was saved with the timer running, the timer restarts from this time.                |


### Byte sources

`fromStream` accepts a web `ReadableStream<Uint8Array>`, a Node.js `Readable`, or any sync or async iterable of `Uint8Array` chunks.

`fromBase64` accepts standard or URL-safe base64. Whitespace is ignored.

### Creating a puzzle

```ts
const puzzle = Puzzle.create({
  grid: ["CAT", "A.O", "BOW"], // "." marks a block
  clues: {
    across: ["Feline", "Ribbon tie"], // in number order
    down: ["Taxi", "Pull behind"],
  },
  title: "Tiny",
});

puzzle.getClue("down", 2)?.text; // "Pull behind"
```

`create` throws `PuzError` if the grid is empty, the rows have different lengths, the number of clues doesn't match the grid, or a `rebus` index isn't a letter square.

## Saving

Methods of a `Puzzle` that produce the `.puz` file.


| Name                 | Arguments                        | Returns                      | Description                                             |
| -------------------- | -------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `toBytes(options?)`  | `[WriteOptions](#write-options)` | `Uint8Array`                 | The `.puz` file.                                        |
| `toBase64(options?)` | `[WriteOptions](#write-options)` | `string`                     | The `.puz` file, base64 encoded.                        |
| `toStream(options?)` | `[WriteOptions](#write-options)` | `ReadableStream<Uint8Array>` | The `.puz` file as a web stream.                        |
| `toRaw(options?)`    | `[WriteOptions](#write-options)` | `[RawPuz](#rawpuz)`          | The file's fields as a plain object, without checksums. |
| `clone()`            |                                  | `Puzzle`                     | An independent copy, including a running timer.         |


What gets written is described in [Saving rules](#saving-rules).

### Write options


| Name  | Type     | Default      | Description                                    |
| ----- | -------- | ------------ | ---------------------------------------------- |
| `now` | `number` | `Date.now()` | Time used to work out a running timer's value. |


## Metadata

Properties of a `Puzzle`.


| Name            | Type                                | Access     | Description                                                               |
| --------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `title`         | `string`                            | read/write | Puzzle title.                                                             |
| `author`        | `string`                            | read/write | Author.                                                                   |
| `copyright`     | `string`                            | read/write | Copyright line.                                                           |
| `notes`         | `string`                            | read/write | Free-text notes shown with the puzzle.                                    |
| `width`         | `number`                            | read       | Number of columns.                                                        |
| `height`        | `number`                            | read       | Number of rows.                                                           |
| `size`          | `number`                            | read       | Number of squares (`width * height`).                                     |
| `version`       | `string`                            | read       | File format version, e.g. `"1.3"`. `"2.0"` and above store text as UTF-8. |
| `isDiagramless` | `boolean`                           | read       | `true` for diagramless puzzles.                                           |
| `sectionTitles` | `readonly string[]`                 | read       | Extra sections in the loaded file, e.g. `["GEXT", "LTIM"]`.               |
| `checksums`     | `[ChecksumReport](#checksumreport)` | read       | Checksum results from loading. Always valid for `create` and `fromRaw`.   |


```ts
puzzle.checksums;
// { valid: false, mismatches: [{ name: "section:LTIM", stored: 84, computed: 12380 }] }
```

## Grid and clues

Methods and properties of a `Puzzle` for looking up squares and clues. An index outside the grid throws `RangeError`.


| Name                         | Arguments                         | Returns                                                | Description                                                    |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `toIndex(position)`          | `{ row: number; col: number }`    | `number`                                               | Index of the square at `row`, `col`.                           |
| `toRowCol(index)`            | `number`                          | `{ row: number; col: number }`                         | Row and column of a square.                                    |
| `getSquare(index)`           | `number`                          | `[Square](#square)`                                    | Snapshot of one square.                                        |
| `getSquares()`               |                                   | `[Square[]](#square)`                                  | Snapshots of every square, in index order.                     |
| `isBlock(index)`             | `number`                          | `boolean`                                              | `true` if the square is a block.                               |
| `clues`                      |                                   | `{ across: Clue[]; down: Clue[] }`                     | All clues, each list in number order.                          |
| `allClues`                   |                                   | `[Clue[]](#clue)`                                      | All clues by number, across before down.                       |
| `getClue(direction, number)` | `"across"` | `"down"`, `number`   | `[Clue](#clue)` | `undefined`                          | One clue.                                                      |
| `cluesAt(index)`             | `number`                          | `{ across: Clue | undefined; down: Clue | undefined }` | The clues passing through a square.                            |
| `setClueText(clue, text)`    | `{ direction, number }`, `string` | `void`                                                 | Change a clue's text. Throws `RangeError` if it doesn't exist. |


Snapshots are plain objects. They don't change when the puzzle changes.

```ts
puzzle.getSquare(13); // row 2, column 3
// {
//   index: 13, row: 2, col: 3, isBlock: false,
//   number: 8, across: 3, down: 3,
//   value: "M", solution: "M",
//   flags: 0, isCircled: false, isRevealed: false, isIncorrect: false, wasIncorrect: false,
//   isRebus: false
// }

puzzle.getClue("down", 10);
// { number: 10, direction: "down", text: "Short bottom", squares: [17, 22], index: 10, listIndex: 5 }
```

## Values

Methods and properties of a `Puzzle` for the player's entries.


| Name                                                         | Arguments                                                   | Returns   | Description                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `getSquareValue(index)`                                      | `number`                                                    | `string`  | The square's value, or `""` if it is empty or a block.                                                           |
| `[setSquareValue(index, value, options?)](#setting-a-value)` | `number`, `string`, `[SetSquareValueOptions](#set-options)` | `boolean` | Set a square's value. Returns `true` if it changed.                                                              |
| `clearSquareValue(index, options?)`                          | `number`, `{ force?: boolean }`                             | `boolean` | Same as `setSquareValue(index, "", options)`.                                                                    |
| `clear(options?)`                                            | `[ClearOptions](#clear-options)`                            | `void`    | Empty every square except revealed ones.                                                                         |
| `isFilled`                                                   |                                                             | `boolean` | `true` if every non-block square has a value.                                                                    |
| `isSolved`                                                   |                                                             | `boolean` | `true` if every non-block square is correct. Throws `PuzLockedError` if the solution is locked or missing.       |
| `isCorrect(index)`                                           | `number`                                                    | `boolean` | `true` if the square's value matches the solution. Throws `PuzLockedError` if the solution is locked or missing. |


### Setting a value

- The value is uppercased unless `preserveCase` is set.
- `""` empties the square.
- On a block, or on a revealed square without `force`, nothing changes and it returns `false`.
- `"-"` and `"."` throw `RangeError`, because the file format uses them for empty squares and blocks.

`isCorrect` ignores case. An empty square is never correct. For a rebus square, the full answer or its first letter both count.

### Set options


| Name           | Type      | Default | Description                                         |
| -------------- | --------- | ------- | --------------------------------------------------- |
| `force`        | `boolean` | `false` | Allow changing a square that has been revealed.     |
| `preserveCase` | `boolean` | `false` | Store the value as given instead of uppercasing it. |


### Clear options


| Name              | Type      | Default | Description                                                          |
| ----------------- | --------- | ------- | -------------------------------------------------------------------- |
| `includeRevealed` | `boolean` | `false` | Also empty revealed squares, and remove every flag except `CIRCLED`. |


## Check and reveal

Methods of a `Puzzle` that compare values with the solution. They throw `PuzLockedError` if the solution is unavailable, and `RangeError` for an index outside the grid or a clue that doesn't exist.


| Name                                   | Arguments               | Returns                       | Description                                      |
| -------------------------------------- | ----------------------- | ----------------------------- | ------------------------------------------------ |
| `[checkSquare(index)](#checking)`      | `number`                | `[CheckResult](#checkresult)` | Check one square.                                |
| `[checkSquares(indexes)](#checking)`   | `Iterable<number>`      | `[CheckResult](#checkresult)` | Check several squares.                           |
| `[checkClue(clue)](#checking)`         | `{ direction, number }` | `[CheckResult](#checkresult)` | Check every square in a clue.                    |
| `[checkPuzzle()](#checking)`           |                         | `[CheckResult](#checkresult)` | Check every square.                              |
| `[revealSquare(index)](#revealing)`    | `number`                | `number[]`                    | Reveal one square. Returns the indexes revealed. |
| `[revealSquares(indexes)](#revealing)` | `Iterable<number>`      | `number[]`                    | Reveal several squares.                          |
| `[revealClue(clue)](#revealing)`       | `{ direction, number }` | `number[]`                    | Reveal every square in a clue.                   |
| `[revealPuzzle()](#revealing)`         |                         | `number[]`                    | Reveal every square.                             |


### Checking

Checking skips blocks and empty squares. It updates each checked square's flags:


| Square's value                                | Flag change                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| Wrong                                         | Sets `INCORRECT`.                                    |
| Correct, and the square is marked `INCORRECT` | Removes `INCORRECT` and sets `PREVIOUSLY_INCORRECT`. |
| Correct otherwise                             | None.                                                |


### Revealing

Revealing sets each non-block square's value to the answer and sets its `REVEALED` flag. A revealed square can't be changed by `setSquareValue` or `clearSquareValue` unless you pass `force: true`.

```ts
puzzle.checkPuzzle(); // { checked: [0, 1, 5], incorrect: [1] }
puzzle.revealClue({ direction: "down", number: 4 }); // [3, 8, 13, 18, 23]
```

## Square flags

Methods of a `Puzzle` for each square's flag bitmask, stored in the file's `GEXT` section. The flags are listed under `[SquareFlag](#squareflag)`.


| Name                         | Arguments                         | Returns   | Description                                                 |
| ---------------------------- | --------------------------------- | --------- | ----------------------------------------------------------- |
| `getFlags(index)`            | `number`                          | `number`  | The raw bitmask.                                            |
| `hasFlag(index, flag)`       | `number`, `SquareFlag`            | `boolean` | `true` if the flag is set.                                  |
| `setFlag(index, flag, on)`   | `number`, `SquareFlag`, `boolean` | `void`    | Turn one flag on (`true`) or off (`false`).                 |
| `isCircled(index)`           | `number`                          | `boolean` | Shortcut for `hasFlag(index, SquareFlag.CIRCLED)`.          |
| `setCircled(index, circled)` | `number`, `boolean`               | `void`    | Shortcut for `setFlag(index, SquareFlag.CIRCLED, circled)`. |
| `isRevealed(index)`          | `number`                          | `boolean` | Shortcut for `hasFlag(index, SquareFlag.REVEALED)`.         |


## Timer

Methods and properties of a `Puzzle` for solving time, in whole seconds. While the timer runs it counts in memory. Saving writes the total up to `now` and whether it was running.


| Name                                | Arguments                     | Returns             | Description                                                                                                                                                     |
| ----------------------------------- | ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timer`                             |                               | `[Timer](#timer-1)` | Same as `getTimer()`.                                                                                                                                           |
| `getTimer(now?)`                    | `number`                      | `[Timer](#timer-1)` | Total seconds as of `now`, rounded down.                                                                                                                        |
| `startTimer(now?)`                  | `number`                      | `void`              | Start counting from `now`. Does nothing if already running.                                                                                                     |
| `stopTimer(now?)`                   | `number`                      | `void`              | Add the time since start to the total and stop. Does nothing if already stopped.                                                                                |
| `setTimer(seconds, running?, now?)` | `number`, `boolean`, `number` | `void`              | Set the total. `running` defaults to the current state; if `true`, counting continues from `now`. Throws `RangeError` if `seconds` is negative or not a number. |
| `resetTimer()`                      |                               | `void`              | Stop the timer and set it to 0.                                                                                                                                 |


```ts
puzzle.startTimer(1_000_000);
puzzle.getTimer(1_065_000); // { seconds: 65, running: true }
puzzle.stopTimer(1_065_000);
puzzle.timer; // { seconds: 65, running: false }
```

## Locked solutions

Methods and properties of a `Puzzle` for solutions scrambled under a 4-digit key. Until a locked puzzle is unscrambled, check, reveal, `isCorrect` and `isSolved` throw `PuzLockedError`, and `getSquare().solution` is `undefined`. Setting values always works.


| Name              | Arguments    | Returns   | Description                                                                                                                    |
| ----------------- | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `isScrambled`     |              | `boolean` | `true` if the solution is locked.                                                                                              |
| `hasSolution`     |              | `boolean` | `false` if the file has no solution at all.                                                                                    |
| `unscramble(key)` | [key](#keys) | `boolean` | Unlock the solution. Returns `false` and changes nothing if the key is wrong; `true` if it worked or the puzzle wasn't locked. |
| `scramble(key)`   | [key](#keys) | `void`    | Lock the solution.                                                                                                             |


### Keys

A key is a number (`1234`, or `42`, which becomes `"0042"`) or a 4-digit string (`"1234"`). Any other key throws `RangeError`.

## Types

All types are exported from `"puzkit"`.

### Square

A snapshot of one square. Returned by `getSquare` and `getSquares`.


| Name           | Type                   | Description                                                               |
| -------------- | ---------------------- | ------------------------------------------------------------------------- |
| `index`        | `number`               | `row * width + col`.                                                      |
| `row`          | `number`               | Row, from 0.                                                              |
| `col`          | `number`               | Column, from 0.                                                           |
| `isBlock`      | `boolean`              | `true` for a block.                                                       |
| `number`       | `number` | `undefined` | Clue number printed in the square.                                        |
| `across`       | `number` | `undefined` | Position in `puzzle.clues.across` of the across clue through this square. |
| `down`         | `number` | `undefined` | Position in `puzzle.clues.down` of the down clue through this square.     |
| `value`        | `string`               | The player's entry. `""` if empty; several letters for a rebus.           |
| `solution`     | `string` | `undefined` | The answer. `undefined` while the solution is unavailable.                |
| `flags`        | `number`               | `[SquareFlag](#squareflag)` bitmask.                                      |
| `isCircled`    | `boolean`              | `CIRCLED` flag is set.                                                    |
| `isRevealed`   | `boolean`              | `REVEALED` flag is set.                                                   |
| `isIncorrect`  | `boolean`              | `INCORRECT` flag is set (marked wrong by a check).                        |
| `wasIncorrect` | `boolean`              | `PREVIOUSLY_INCORRECT` flag is set (was wrong, then fixed).               |
| `isRebus`      | `boolean`              | The answer is more than one letter.                                       |


### Clue

Returned by `clues`, `allClues`, `getClue` and `cluesAt`.


| Name        | Type                  | Description                                                      |
| ----------- | --------------------- | ---------------------------------------------------------------- |
| `number`    | `number`              | Printed clue number.                                             |
| `direction` | `"across"` | `"down"` | Direction.                                                       |
| `text`      | `string`              | Clue text.                                                       |
| `squares`   | `readonly number[]`   | Indexes of the answer's squares, in reading order.               |
| `index`     | `number`              | Position in `allClues` (the order clues are stored in the file). |
| `listIndex` | `number`              | Position in `clues.across` or `clues.down`.                      |


### CheckResult

Returned by the `check*` methods.


| Name        | Type                | Description                                |
| ----------- | ------------------- | ------------------------------------------ |
| `checked`   | `readonly number[]` | Squares that had a value and were checked. |
| `incorrect` | `readonly number[]` | The checked squares that were wrong.       |


### Timer

Returned by `timer` and `getTimer`.


| Name      | Type      | Description                               |
| --------- | --------- | ----------------------------------------- |
| `seconds` | `number`  | Total seconds, including the current run. |
| `running` | `boolean` | `true` if the timer is running.           |


### CreatePuzzleOptions

Passed to `Puzzle.create`.


| Name        | Type                                   | Default | Description                                                          |
| ----------- | -------------------------------------- | ------- | -------------------------------------------------------------------- |
| `grid`      | `string[]`                             |         | Required. Solution rows, all the same length. `"."` marks a block.   |
| `clues`     | `{ across: string[]; down: string[] }` |         | Required. Clue text in number order.                                 |
| `title`     | `string`                               | `""`    | Puzzle title.                                                        |
| `author`    | `string`                               | `""`    | Author.                                                              |
| `copyright` | `string`                               | `""`    | Copyright line.                                                      |
| `notes`     | `string`                               | `""`    | Notes.                                                               |
| `rebus`     | `Record<number, string>`               | `{}`    | Multi-letter answers by square index. `grid` holds the first letter. |
| `circled`   | `number[]`                             | `[]`    | Indexes of squares to circle.                                        |
| `version`   | `string`                               | `"1.3"` | File format version. Use `"2.0"` for UTF-8 text.                     |


### ChecksumReport

Returned by `puzzle.checksums` and `parsePuz`.


| Name         | Type                                                                     | Description                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid`      | `boolean`                                                                | `true` if every checksum matched.                                                                                                                           |
| `mismatches` | `{ name: string; stored: number | string; computed: number | string }[]` | Each wrong checksum. `name` is `"file"`, `"cib"`, `"masked"` or `"section:<TITLE>"`; `stored` is the value in the file and `computed` is the correct value. |


### RawPuz

The file's fields as a plain object, without checksums. Used by `toRaw`, `fromRaw`, `parsePuz` and `serializePuz`.


| Name                | Type                                    | Description                                                                   |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `version`           | `string`                                | e.g. `"1.3"`. At most 3 characters.                                           |
| `width`             | `number`                                | 1–255.                                                                        |
| `height`            | `number`                                | 1–255.                                                                        |
| `puzzleType`        | `number`                                | `[PuzzleType](#puzzletype)` value.                                            |
| `solutionState`     | `number`                                | `[SolutionState](#solutionstate)` value.                                      |
| `scrambledChecksum` | `number`                                | Used to verify an unscramble key.                                             |
| `reserved1C`        | `number`                                | Unused header bytes, kept as-is.                                              |
| `reserved20`        | `Uint8Array`                            | Unused header bytes (12), kept as-is.                                         |
| `solution`          | `string`                                | One character per square, row by row. `"."` is a block.                       |
| `state`             | `string`                                | Player's entries, one character per square. `"-"` is empty, `"."` is a block. |
| `title`             | `string`                                | Title.                                                                        |
| `author`            | `string`                                | Author.                                                                       |
| `copyright`         | `string`                                | Copyright line.                                                               |
| `clues`             | `string[]`                              | Clue text, in `allClues` order.                                               |
| `notes`             | `string`                                | Notes.                                                                        |
| `sections`          | `{ title: string; data: Uint8Array }[]` | Extra sections, e.g. `GEXT`, `LTIM`.                                          |


## Node.js helpers

Functions that read and write files with `node:fs`. They live in a separate entry point so the main import works without Node.js.

Import: `import { readPuzzleFile, writePuzzleFile } from "puzkit/node"`. `puzkit/node` also re-exports `Puzzle`.


| Name                                               | Arguments                                                         | Returns           | Description                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `readPuzzleFile(path, options?)`                   | `string`, `[ReadOptions](#read-options)`                          | `Promise<Puzzle>` | Read a `.puz` file.                                                    |
| `streamPuzzleFile(path, options?)`                 | `string`, `[ReadOptions](#read-options)`                          | `Promise<Puzzle>` | Read a `.puz` file as a stream.                                        |
| `writePuzzleFile(path, puzzle, options?)`          | `string`, `Puzzle`, `[WriteOptions](#write-options)`              | `Promise<void>`   | Write a `.puz` file.                                                   |
| `writePuzzleStream(destination, puzzle, options?)` | `Writable` | `string`, `Puzzle`, `[WriteOptions](#write-options)` | `Promise<void>`   | Stream to a writable or file path. Resolves when writing has finished. |
| `toNodeReadable(puzzle, options?)`                 | `Puzzle`, `[WriteOptions](#write-options)`                        | `Readable`        | A Node.js stream that emits the file's bytes.                          |


File system errors, such as a missing file, are passed through unchanged.

## Low-level functions

Functions for working with the file format directly. You don't need these for normal use.

Import: `import { parsePuz, serializePuz } from "puzkit"`.


| Name                                                | Arguments                                  | Returns                                      | Description                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `parsePuz(bytes, options?)`                         | `Uint8Array`, `{ strict?: boolean }`       | `{ raw: RawPuz; checksums: ChecksumReport }` | Parse a file. Throws like `Puzzle.fromBytes`.                                                                                |
| `[serializePuz(raw)](#serializepuz-errors)`         | `[RawPuz](#rawpuz)`                        | `Uint8Array`                                 | Write a file, computing all checksums.                                                                                       |
| `cksumRegion(data, start?)`                         | `Uint8Array`, `number` (default `0`)       | `number`                                     | The format's 16-bit checksum of `data`, continuing from `start`.                                                             |
| `encode(text, encoding?)`                           | `string`, `"windows-1252"` | `"utf-8"`     | `Uint8Array`                                 | Encode text. Default `"windows-1252"`.                                                                                       |
| `decode(bytes, encoding?)`                          | `Uint8Array`, `"windows-1252"` | `"utf-8"` | `string`                                     | Decode text. Default `"windows-1252"`.                                                                                       |
| `scrambleSolution(solution, width, height, key)`    | `string`, `number`, `number`, [key](#keys) | `string`                                     | Scramble a solution string.                                                                                                  |
| `unscrambleSolution(scrambled, width, height, key)` | `string`, `number`, `number`, [key](#keys) | `string`                                     | Unscramble a solution string. Doesn't check the key: compare `scrambledChecksum` of the result with `raw.scrambledChecksum`. |
| `scrambledChecksum(solution, width, height)`        | `string`, `number`, `number`               | `number`                                     | Checksum of a plain solution, as stored in `raw.scrambledChecksum`.                                                          |
| `bytesToBase64(bytes)`                              | `Uint8Array`                               | `string`                                     | Base64-encode bytes.                                                                                                         |
| `base64ToBytes(base64)`                             | `string`                                   | `Uint8Array`                                 | Decode base64. Throws `TypeError` on invalid characters.                                                                     |
| `collectBytes(source)`                              | `[ByteSource](#byte-sources)`              | `Promise<Uint8Array>`                        | Read a stream to the end and join its chunks.                                                                                |


### serializePuz errors

`serializePuz` throws `PuzError` if:

- `width` or `height` is outside 1–255.
- `version` is longer than 3 characters.
- `solution` or `state` is not `width * height` single-byte characters.
- A section title isn't 4 printable ASCII characters.
- A section is over 65,535 bytes.

## Constants

Import: `import { SquareFlag, PuzzleType, SolutionState, SectionTitle, BLOCK, DIAGRAMLESS_BLOCK, EMPTY } from "puzkit"`.

### SquareFlag


| Name                              | Value  | Description                    |
| --------------------------------- | ------ | ------------------------------ |
| `SquareFlag.PREVIOUSLY_INCORRECT` | `0x10` | Was marked wrong, then fixed.  |
| `SquareFlag.INCORRECT`            | `0x20` | Marked wrong by a check.       |
| `SquareFlag.REVEALED`             | `0x40` | Answer was revealed.           |
| `SquareFlag.CIRCLED`              | `0x80` | Square is drawn with a circle. |


### PuzzleType


| Name                     | Value    | Description           |
| ------------------------ | -------- | --------------------- |
| `PuzzleType.NORMAL`      | `0x0001` | A normal puzzle.      |
| `PuzzleType.DIAGRAMLESS` | `0x0401` | A diagramless puzzle. |


### SolutionState


| Name                        | Value    | Description                 |
| --------------------------- | -------- | --------------------------- |
| `SolutionState.UNSCRAMBLED` | `0x0000` | Solution is stored plainly. |
| `SolutionState.NO_SOLUTION` | `0x0002` | File has no solution.       |
| `SolutionState.SCRAMBLED`   | `0x0004` | Solution is locked.         |


### SectionTitle


| Name                | Value    | Description                       |
| ------------------- | -------- | --------------------------------- |
| `SectionTitle.GRBS` | `"GRBS"` | Which squares have rebus answers. |
| `SectionTitle.RTBL` | `"RTBL"` | Rebus answer text.                |
| `SectionTitle.RUSR` | `"RUSR"` | Player's rebus entries.           |
| `SectionTitle.GEXT` | `"GEXT"` | Square flags.                     |
| `SectionTitle.LTIM` | `"LTIM"` | Timer.                            |


### Grid characters


| Name                | Value | Description                                        |
| ------------------- | ----- | -------------------------------------------------- |
| `BLOCK`             | `"."` | Block in `solution` and `state`.                   |
| `DIAGRAMLESS_BLOCK` | `":"` | Block in the solution of some diagramless puzzles. |
| `EMPTY`             | `"-"` | Empty square in `state`.                           |


## Errors

Every error the library throws on purpose is one of these classes, or a `RangeError` or `TypeError` for an invalid argument.

Import: `import { PuzError, PuzParseError, PuzChecksumError, PuzLockedError } from "puzkit"`.


| Name               | Extends    | Description                                                                                                      |
| ------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `PuzError`         | `Error`    | Base class. Also thrown for invalid input to `create`, `scramble` or `serializePuz`.                             |
| `PuzParseError`    | `PuzError` | The input isn't a readable `.puz` file.                                                                          |
| `PuzChecksumError` | `PuzError` | A checksum is wrong and `strict: true` was used. Its `report` property is a `[ChecksumReport](#checksumreport)`. |
| `PuzLockedError`   | `PuzError` | The operation needs the solution, but it is locked or missing.                                                   |


```ts
import { Puzzle, PuzParseError } from "puzkit";

try {
  Puzzle.fromBytes(bytes);
} catch (e) {
  if (e instanceof PuzParseError) console.log("Not a .puz file");
}
```

## Saving rules

What `toBytes`, `toBase64`, `toStream` and the Node.js write helpers produce.


| Item                 | Rule                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| Checksums            | Always recomputed, so a file with bad checksums is repaired when saved.             |
| `GEXT` section       | Written if any square has a flag, or the file had this section.                     |
| `LTIM` section       | Written if the time is above 0, the timer is running, or the file had this section. |
| `RUSR` section       | Written if any value is longer than one letter, or the file had this section.       |
| Text (before 2.0)    | Windows-1252. Characters it can't represent become a close ASCII equivalent or `?`. |
| Text (2.0 and above) | UTF-8.                                                                              |
| Grid                 | `solution` and `state` are always one byte per square.                              |


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

## Development

```sh
npm install
npm test           # run tests (vitest)
npm run coverage   # tests + coverage; fails below 100% lines / 95% branches
npm run typecheck  # tsc
npm run build      # build dist/ (ESM, CommonJS, and .d.ts) with tsup
npm run format     # prettier
```


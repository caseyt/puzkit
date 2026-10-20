# puzkit

Read, modify, and write Across Lite `.puz` crossword files.

- **Zero dependencies.** Pure TypeScript with no `Buffer`, `iconv`, or `TextDecoder`, so it runs the same in Node, browsers, and React Native (Hermes).
- **Lossless.** Reading a file and writing it straight back produces identical bytes. Unknown sections and reserved header bytes are kept.
- **Correct checksums.** Every checksum (file, header, masked "ICHEATED", and per-section) is verified on read and recomputed on write.
- **Covers the whole format:** player entries, check/reveal markup (GEXT), timer (LTIM), rebus squares (GRBS/RTBL/RUSR), circles, scrambled/locked solutions, diagramless puzzles, and UTF-8 (v2.0) files.

```sh
npm install puzkit
```

## Quick start

```ts
import { Puzzle } from "puzkit";
import { readPuzzleFile, writePuzzleFile } from "puzkit/node";

const puzzle = await readPuzzleFile("monday.puz");

puzzle.title; // "A Tale of Twelve Cities"
puzzle.getClue("across", 1); // { number: 1, direction: "across", text: "...", cells: [0, 1, 2, 3], ... }

puzzle.setValue({ row: 0, col: 0 }, "C");
puzzle.checkClue({ direction: "across", number: 1 });
puzzle.revealCell(5);
puzzle.startTimer();

await writePuzzleFile("monday.puz", puzzle);
```

## Loading and saving

| From                                                                   | To                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Puzzle.fromBytes(uint8ArrayOrBufferOrArrayBuffer)`                    | `puzzle.toBytes()`                                                |
| `Puzzle.fromBase64(string)`                                            | `puzzle.toBase64()`                                               |
| `await Puzzle.fromStream(readableStreamOrNodeReadableOrAsyncIterable)` | `puzzle.toStream()` (WHATWG `ReadableStream`)                     |
| `await readPuzzleFile(path)` _(puzkit/node)_                           | `await writePuzzleFile(path, puzzle)` _(puzkit/node)_             |
| `await streamPuzzleFile(path)` _(puzkit/node)_                         | `await writePuzzleStream(pathOrWritable, puzzle)` _(puzkit/node)_ |
| `Puzzle.create({ grid, clues, ... })`                                  |                                                                   |

`puzkit/node` is a separate entry point, so the core never imports `node:fs`.

On React Native with `expo-file-system`, base64 is the simplest route:

```ts
const puzzle = Puzzle.fromBase64(await FileSystem.readAsStringAsync(uri, { encoding: "base64" }));
await FileSystem.writeAsStringAsync(uri, puzzle.toBase64(), { encoding: "base64" });
```

### Checksums

Reading is lenient by default: a file with bad checksums still loads, and `puzzle.checksums` tells you what was wrong. Writing always produces correct checksums. Pass `{ strict: true }` to throw `PuzChecksumError` instead.

```ts
const puzzle = Puzzle.fromBytes(bytes);
puzzle.checksums; // { valid: false, mismatches: [{ name: "section:LTIM", stored: 84, computed: 12380 }] }
```

## Working with a puzzle

`Puzzle` is **mutable**. Methods change the puzzle in place. When you need a new object (for example, to hand to React state), call `puzzle.clone()`.

Squares can be given as an index (row-major) or as `{ row, col }`.

### Grid and clues

```ts
puzzle.width;
puzzle.height;
puzzle.size;
puzzle.getCell(13);
// { index, row, col, isBlock, number, across, down, value, solution,
//   flags, isCircled, isRevealed, isIncorrect, wasIncorrect, isRebus }
puzzle.getCells();

puzzle.clues.across;
puzzle.clues.down; // Clue[] in numbered order
puzzle.allClues; // file order: by number, across before down
puzzle.getClue("down", 10);
puzzle.cluesAt({ row: 2, col: 3 }); // { across, down }
puzzle.setClueText({ direction: "down", number: 10 }, "New clue");
```

### Entries

```ts
puzzle.setValue(0, "a"); // stored as "A"; returns true if the square changed
puzzle.setValue(13, "STAR"); // rebus entry
puzzle.clearValue(0);
puzzle.getValue(0); // "" when empty
puzzle.clear(); // clear the grid, keeping revealed squares
puzzle.clear({ includeRevealed: true }); // clear everything, including markup (circles stay)

puzzle.isFilled;
puzzle.isSolved;
puzzle.isCorrect(0);
```

Revealed squares are locked: `setValue` and `clearValue` leave them alone unless you pass `{ force: true }`.

### Check and reveal

```ts
puzzle.checkCell(0); // => { checked: [0], incorrect: [] }
puzzle.checkClue({ direction: "across", number: 1 });
puzzle.checkPuzzle();
puzzle.checkCells([0, 1, 2]);

puzzle.revealCell(0);
puzzle.revealClue({ direction: "down", number: 4 });
puzzle.revealPuzzle();
```

Checking only looks at filled squares and updates their GEXT flags:

| Result  | Flags                                                                    |
| ------- | ------------------------------------------------------------------------ |
| correct | If the square was `INCORRECT`, that flag becomes `PREVIOUSLY_INCORRECT`. |
| wrong   | `INCORRECT` is set.                                                      |

Revealing fills in the answer and sets `REVEALED`.

### Flags

```ts
import { CellFlag } from "puzkit";
puzzle.setCircled(0, true);
puzzle.hasFlag(0, CellFlag.INCORRECT);
puzzle.setFlag(0, CellFlag.REVEALED, false);
puzzle.getFlags(0); // raw bitmask
```

### Timer

```ts
puzzle.timer; // { seconds, running }
puzzle.startTimer();
puzzle.stopTimer();
puzzle.setTimer(90, /* running */ false);
puzzle.resetTimer();
```

A running timer keeps counting in memory, and the elapsed time is added in when you save. If you load a file whose timer was saved as running, it resumes from load time. Every timer method takes an optional `now` (ms) argument, which makes tests deterministic.

### Locked (scrambled) solutions

```ts
puzzle.isScrambled; // true
puzzle.unscramble(1234); // true if the key matches the file's checksum
puzzle.scramble(1234); // lock it again
```

Checking, revealing, or reading solutions on a locked puzzle throws `PuzLockedError`. Players can still make entries.

### Metadata

`title`, `author`, `copyright` and `notes` can be read and set. `version`, `isDiagramless`, `hasSolution` and `sectionTitles` are read-only.

## Low-level API

When you need the file exactly as stored, `parsePuz(bytes)` returns `{ raw, checksums }`, where `raw` is a plain `RawPuz` object. `serializePuz(raw)` turns one back into bytes. Also exported: `computeLayout` (grid numbering), `cksumRegion`, `scrambleSolution` / `unscrambleSolution`, `encode` / `decode`, and the format constants.

## Text encoding

Files before v2.0 are decoded as Windows-1252. That is ISO-8859-1 plus the smart quotes and dashes that real files contain, so every byte round-trips. Characters that can't be encoded are written as an ASCII equivalent or `?`. v2.0 files use UTF-8.

## Development

```sh
npm test          # vitest
npm run coverage  # enforces 100% line coverage
npm run typecheck
npm run build     # tsup -> dist/ (ESM + CJS + .d.ts)
```

Tests use small synthetic fixtures in `test/fixtures/`. `sample-locked-1234.puz` was produced by [puzpy](https://github.com/alexdej/puzpy) to check compatibility. To round-trip real puzzles, drop `.puz` files into `test/fixtures/local/`. That folder is gitignored, since published puzzles are copyrighted, and `local-fixtures.test.ts` picks them up automatically.

## References

- [PUZ file format](https://code.google.com/archive/p/puz/wikis/FileFormat.wiki)
- [puzpy](https://github.com/alexdej/puzpy)

## License

MIT

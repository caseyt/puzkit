import { isBlockChar } from "./constants.js";

export type Direction = "across" | "down";

/** A word slot in the grid: its number, direction, and the squares it covers. */
export interface Entry {
  readonly number: number;
  readonly direction: Direction;
  /** Index into the file's clue list (sorted by number, across before down). */
  readonly index: number;
  /** Index within the across or down list. */
  readonly listIndex: number;
  /** Square indices, in reading order. */
  readonly squares: readonly number[];
}

/** Static information about a square, derived from the grid shape. */
export interface SquareLayout {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly isBlock: boolean;
  /** The clue number printed in this square, if any. */
  readonly number: number | undefined;
  /** `listIndex` of the across entry containing this square. */
  readonly across: number | undefined;
  /** `listIndex` of the down entry containing this square. */
  readonly down: number | undefined;
}

export interface Layout {
  readonly squares: readonly SquareLayout[];
  readonly across: readonly Entry[];
  readonly down: readonly Entry[];
}

/**
 * Number the grid using standard crossword rules: a square gets a number if it starts an
 * across or down word of two or more letters.
 */
export function computeLayout(solution: string, width: number, height: number): Layout {
  const isBlock = (i: number) => isBlockChar(solution[i]);
  const across: Entry[] = [];
  const down: Entry[] = [];
  const acrossOf: (number | undefined)[] = new Array(width * height).fill(undefined);
  const downOf: (number | undefined)[] = new Array(width * height).fill(undefined);
  const numberOf: (number | undefined)[] = new Array(width * height).fill(undefined);

  let number = 1;
  let clueIndex = 0;
  for (let i = 0; i < width * height; i++) {
    if (isBlock(i)) continue;
    const row = Math.floor(i / width);
    const col = i % width;

    const startsAcross = (col === 0 || isBlock(i - 1)) && col + 1 < width && !isBlock(i + 1);
    const startsDown = (row === 0 || isBlock(i - width)) && row + 1 < height && !isBlock(i + width);
    if (!startsAcross && !startsDown) continue;

    numberOf[i] = number;
    if (startsAcross) {
      const squares: number[] = [];
      for (let c = i; c < row * width + width && !isBlock(c); c++) {
        squares.push(c);
        acrossOf[c] = across.length;
      }
      across.push({
        number,
        direction: "across",
        index: clueIndex++,
        listIndex: across.length,
        squares,
      });
    }
    if (startsDown) {
      const squares: number[] = [];
      for (let c = i; c < width * height && !isBlock(c); c += width) {
        squares.push(c);
        downOf[c] = down.length;
      }
      down.push({ number, direction: "down", index: clueIndex++, listIndex: down.length, squares });
    }
    number++;
  }

  const squares: SquareLayout[] = [];
  for (let i = 0; i < width * height; i++) {
    squares.push({
      index: i,
      row: Math.floor(i / width),
      col: i % width,
      isBlock: isBlock(i),
      number: numberOf[i],
      across: acrossOf[i],
      down: downOf[i],
    });
  }
  return { squares, across, down };
}

import { describe, expect, it } from "vitest";
import { numberGrid } from "../src/grid.js";

describe("numberGrid", () => {
  const numbering = numberGrid("ABCDEFGHIJKL.MNOPQRSTUVWX", 5, 5);

  it("numbers squares in reading order", () => {
    const numbers = numbering.squares.map((s) => s.number ?? 0);
    expect(numbers).toEqual([
      1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 7, 0, 0, 8, 0, 9, 0, 10, 0, 0, 11, 0, 0, 0, 0,
    ]);
  });

  it("finds entries with correct squares, including ones touching the right and bottom edges", () => {
    const describe = (e: { number: number; squares: readonly number[] }) =>
      `${e.number}:${e.squares.join(",")}`;
    expect(numbering.across.map(describe)).toEqual([
      "1:0,1,2,3,4",
      "6:5,6,7,8,9",
      "7:10,11",
      "8:13,14",
      "9:15,16,17,18,19",
      "11:20,21,22,23,24",
    ]);
    expect(numbering.down.map(describe)).toEqual([
      "1:0,5,10,15,20",
      "2:1,6,11,16,21",
      "3:2,7",
      "4:3,8,13,18,23",
      "5:4,9,14,19,24",
      "10:17,22",
    ]);
  });

  it("assigns file clue indexes by number, across before down", () => {
    const order = [...numbering.across, ...numbering.down]
      .sort((a, b) => a.index - b.index)
      .map((e) => `${e.number}${e.direction[0]}`);
    expect(order).toEqual([
      "1a",
      "1d",
      "2d",
      "3d",
      "4d",
      "5d",
      "6a",
      "7a",
      "8a",
      "9a",
      "10d",
      "11a",
    ]);
  });

  it("links squares to their entries", () => {
    expect(numbering.squares[13]).toEqual({
      index: 13,
      row: 2,
      col: 3,
      isBlock: false,
      number: 8,
      across: 3,
      down: 3,
    });
    expect(numbering.squares[12]).toMatchObject({
      isBlock: true,
      number: undefined,
      across: undefined,
      down: undefined,
    });
  });

  it("does not number or link single-letter slots", () => {
    // A.B / ... / C.D: every letter is isolated.
    const isolated = numberGrid("A.B...C.D", 3, 3);
    expect(isolated.across).toEqual([]);
    expect(isolated.down).toEqual([]);
    expect(isolated.squares.every((s) => s.number === undefined)).toBe(true);
  });

  it("treats ':' as a block for diagramless puzzles", () => {
    const l = numberGrid("AB:CD:", 3, 2);
    expect(l.across.map((e) => e.squares)).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect(l.down.map((e) => e.squares)).toEqual([
      [0, 3],
      [1, 4],
    ]);
  });

  it("handles non-square grids", () => {
    const l = numberGrid("ABCDEFGH", 4, 2);
    expect(l.across).toHaveLength(2);
    expect(l.down).toHaveLength(4);
    expect(l.down[3]!.squares).toEqual([3, 7]);
  });
});

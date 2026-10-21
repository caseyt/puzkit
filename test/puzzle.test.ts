import { describe, expect, it } from "vitest";
import { CellFlag, Puzzle, PuzError, parsePuz } from "../src/index.js";
import { NOW, SAMPLE, fixture, samplePuzzle } from "./helpers.js";

/** Write and re-read, so assertions cover the file format and not just in-memory state. */
function roundTrip(puzzle: Puzzle, now = NOW): Puzzle {
  const bytes = puzzle.toBytes({ now });
  expect(parsePuz(bytes).checksums.valid).toBe(true);
  return Puzzle.fromBytes(bytes, { now });
}

describe("Puzzle.create", () => {
  it("builds a puzzle that matches the committed fixture", () => {
    expect(samplePuzzle().toBytes()).toEqual(new Uint8Array(fixture("sample.puz")));
  });

  it("uppercases the grid", () => {
    expect(
      samplePuzzle({ grid: SAMPLE.grid.map((r) => r.toLowerCase()) }).getCell(0).solution,
    ).toBe("A");
  });

  it.each<[string, Partial<typeof SAMPLE>, RegExp]>([
    ["empty grid", { grid: [] }, /must not be empty/],
    ["ragged rows", { grid: ["ABC", "AB"] }, /same length/],
    ["clue count", { clues: { across: ["x"], down: [] } }, /6 across and 6 down/],
    ["rebus on a block", { rebus: { 12: "XY" } }, /not a letter square/],
    ["rebus out of range", { rebus: { 99: "XY" } }, /not a letter square/],
  ])("rejects %s", (_, overrides, message) => {
    expect(() => samplePuzzle(overrides)).toThrow(message);
  });

  it("supports version 2.0 with UTF-8 metadata", () => {
    const p = roundTrip(samplePuzzle({ version: "2.0", title: "Ünïcødé ✓" }));
    expect(p.version).toBe("2.0");
    expect(p.title).toBe("Ünïcødé ✓");
  });
});

describe("metadata", () => {
  it("exposes and updates header fields", () => {
    const p = samplePuzzle();
    expect([p.width, p.height, p.size, p.version, p.isDiagramless]).toEqual([
      5,
      5,
      25,
      "1.3",
      false,
    ]);
    p.title = "New title";
    p.author = "New author";
    p.copyright = "New copyright";
    p.notes = "";
    const q = roundTrip(p);
    expect([q.title, q.author, q.copyright, q.notes]).toEqual([
      "New title",
      "New author",
      "New copyright",
      "",
    ]);
  });

  it("reports section titles", () => {
    expect(Puzzle.fromBytes(fixture("played.puz")).sectionTitles).toEqual([
      "GRBS",
      "RTBL",
      "LTIM",
      "GEXT",
      "RUSR",
    ]);
  });
});

describe("cells and clues", () => {
  const p = samplePuzzle();

  it("converts between index and row/column", () => {
    expect(p.toIndex({ row: 2, col: 3 })).toBe(13);
    expect(p.toRowCol(13)).toEqual({ row: 2, col: 3 });
    expect(p.toRowCol(24)).toEqual({ row: 4, col: 4 });
    for (let i = 0; i < p.size; i++) expect(p.toIndex(p.toRowCol(i))).toBe(i);
    for (const bad of [
      { row: 5, col: 0 },
      { row: -1, col: 0 },
      { row: 0, col: 5 },
      { row: 0, col: -1 },
      { row: 0.5, col: 0 },
      { row: 0, col: 0.5 },
    ]) {
      expect(() => p.toIndex(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  it("rejects indexes outside the grid", () => {
    for (const bad of [-1, 25, 1.5, NaN]) {
      expect(() => p.toRowCol(bad), String(bad)).toThrow(RangeError);
      expect(() => p.getCell(bad), String(bad)).toThrow(RangeError);
      expect(() => p.setSquareValue(bad, "A"), String(bad)).toThrow(RangeError);
    }
  });

  it("returns a full cell snapshot", () => {
    expect(p.getCell(13)).toEqual({
      index: 13,
      row: 2,
      col: 3,
      isBlock: false,
      number: 8,
      across: 3,
      down: 3,
      value: "",
      solution: "M",
      flags: 0,
      isCircled: false,
      isRevealed: false,
      isIncorrect: false,
      wasIncorrect: false,
      isRebus: false,
    });
    expect(p.getCells()).toHaveLength(25);
    expect(p.isBlock(12)).toBe(true);
  });

  it("looks up clues", () => {
    expect(p.clues.across.map((c) => c.text)).toEqual(SAMPLE.clues.across);
    expect(p.clues.down.map((c) => c.text)).toEqual(SAMPLE.clues.down);
    expect(p.allClues.map((c) => c.number)).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(p.getClue("down", 10)).toMatchObject({ text: "Short bottom", cells: [17, 22] });
    expect(p.getClue("across", 2)).toBeUndefined();
    expect(p.cluesAt(13)).toMatchObject({ across: { number: 8 }, down: { number: 4 } });
    expect(p.cluesAt(12)).toEqual({ across: undefined, down: undefined });
  });

  it("edits clue text", () => {
    const q = samplePuzzle();
    const before = q.clues;
    q.setClueText({ direction: "down", number: 3 }, "Edited");
    expect(q.clues).not.toBe(before);
    expect(roundTrip(q).getClue("down", 3)?.text).toBe("Edited");
    expect(() => q.setClueText({ direction: "down", number: 6 }, "x")).toThrow(RangeError);
  });
});

describe("entries", () => {
  it("sets, uppercases, and clears values", () => {
    const p = samplePuzzle();
    expect(p.setSquareValue(0, "a")).toBe(true);
    expect(p.setSquareValue(0, "A")).toBe(false);
    expect(p.setSquareValue(1, "b", { preserveCase: true })).toBe(true);
    expect([p.getSquareValue(0), p.getSquareValue(1)]).toEqual(["A", "b"]);
    expect(p.clearSquareValue(0)).toBe(true);
    expect(p.clearSquareValue(0)).toBe(false);
    expect(roundTrip(p).getSquareValue(1)).toBe("b");
  });

  it("ignores blocks and rejects grid placeholder characters", () => {
    const p = samplePuzzle();
    expect(p.setSquareValue(12, "A")).toBe(false);
    expect(() => p.setSquareValue(0, "-")).toThrow(RangeError);
    expect(() => p.setSquareValue(0, ".")).toThrow(RangeError);
  });

  it("stores multi-letter entries as rebus (RUSR)", () => {
    const p = samplePuzzle();
    p.setSquareValue(13, "mno");
    const raw = p.toRaw();
    expect(raw.state[13]).toBe("M");
    expect(raw.sections.map((s) => s.title)).toEqual(["RUSR"]);
    expect(roundTrip(p).getSquareValue(13)).toBe("MNO");
  });

  it("does not add sections a fresh puzzle doesn't need", () => {
    const p = samplePuzzle();
    p.setSquareValue(0, "A");
    expect(p.toRaw().sections).toEqual([]);
  });

  it("protects revealed squares unless forced", () => {
    const p = samplePuzzle();
    p.revealCell(0);
    expect(p.setSquareValue(0, "Z")).toBe(false);
    expect(p.clearSquareValue(0)).toBe(false);
    expect(p.getSquareValue(0)).toBe("A");
    expect(p.setSquareValue(0, "Z", { force: true })).toBe(true);
    expect(p.getSquareValue(0)).toBe("Z");
  });

  it("clears the grid, optionally including revealed squares and markup", () => {
    const p = samplePuzzle({ circled: [1] });
    p.setSquareValue(1, "X");
    p.checkCell(1);
    p.revealCell(0);
    p.clear();
    expect([p.getSquareValue(0), p.getSquareValue(1)]).toEqual(["A", ""]);
    expect(p.getFlags(1)).toBe(CellFlag.CIRCLED | CellFlag.INCORRECT);
    p.clear({ includeRevealed: true });
    expect([p.getSquareValue(0), p.getFlags(0), p.getFlags(1)]).toEqual(["", 0, CellFlag.CIRCLED]);
  });

  it("tracks filled and solved state", () => {
    const p = samplePuzzle();
    expect([p.isFilled, p.isSolved]).toEqual([false, false]);
    SAMPLE.grid
      .join("")
      .split("")
      .forEach((ch, i) => ch !== "." && p.setSquareValue(i, ch));
    expect([p.isFilled, p.isSolved]).toEqual([true, true]);
    p.setSquareValue(0, "Z");
    expect([p.isFilled, p.isSolved, p.isCorrect(0), p.isCorrect(1)]).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });
});

describe("rebus solutions", () => {
  const p = () => samplePuzzle({ rebus: { 13: "mno" } });

  it("exposes the full answer and accepts full or first-letter entries", () => {
    const q = p();
    expect(q.getCell(13)).toMatchObject({ solution: "MNO", isRebus: true });
    expect(q.isCorrect(13)).toBe(false);
    q.setSquareValue(13, "MNO");
    expect(q.isCorrect(13)).toBe(true);
    q.setSquareValue(13, "M");
    expect(q.isCorrect(13)).toBe(true);
    q.setSquareValue(13, "MN");
    expect(q.isCorrect(13)).toBe(false);
  });

  it("reveals the full rebus answer", () => {
    const q = p();
    q.revealCell(13);
    expect(roundTrip(q).getSquareValue(13)).toBe("MNO");
  });

  it("round-trips GRBS and RTBL", () => {
    const q = roundTrip(p());
    expect(q.sectionTitles).toEqual(["GRBS", "RTBL"]);
    expect(q.getCell(13).solution).toBe("MNO");
  });

  it("shares RTBL keys between squares with the same answer", () => {
    const raw = samplePuzzle({ rebus: { 0: "AB", 1: "ab", 2: "CD" } }).toRaw();
    const rtbl = new TextDecoder().decode(raw.sections.find((s) => s.title === "RTBL")!.data);
    expect(rtbl).toBe(" 0:AB; 1:CD;");
    expect(Array.from(raw.sections.find((s) => s.title === "GRBS")!.data.subarray(0, 4))).toEqual([
      1, 1, 2, 0,
    ]);
  });
});

describe("check", () => {
  it("marks incorrect and previously incorrect squares", () => {
    const p = samplePuzzle();
    p.setSquareValue(0, "A");
    p.setSquareValue(1, "X");
    expect(p.checkCells([0, 1, 2, 12])).toEqual({ checked: [0, 1], incorrect: [1] });
    expect(p.getFlags(0)).toBe(0);
    expect(p.getFlags(1)).toBe(CellFlag.INCORRECT);
    expect(p.getFlags(2)).toBe(0);

    // Checking an incorrect square again leaves it marked incorrect.
    p.checkCell(1);
    expect(p.getFlags(1)).toBe(CellFlag.INCORRECT);

    // Fixing it and checking again turns it into "previously incorrect".
    p.setSquareValue(1, "B");
    p.checkCell(1);
    expect(p.getCell(1)).toMatchObject({
      isIncorrect: false,
      wasIncorrect: true,
    });
    expect(p.getFlags(1)).toBe(CellFlag.PREVIOUSLY_INCORRECT);

    // Getting it wrong again marks it incorrect on top of previously incorrect.
    p.setSquareValue(1, "Q");
    p.checkCell(1);
    expect(p.getFlags(1)).toBe(CellFlag.PREVIOUSLY_INCORRECT | CellFlag.INCORRECT);
  });

  it("checks a clue", () => {
    const p = samplePuzzle();
    for (const [i, v] of [
      [17, "Q"],
      [22, "X"],
      [16, "X"],
    ] as const)
      p.setSquareValue(i, v);
    expect(p.checkClue({ direction: "down", number: 10 })).toEqual({
      checked: [17, 22],
      incorrect: [22],
    });
    expect(p.getFlags(16)).toBe(0);
    expect(() => p.checkClue({ direction: "across", number: 2 })).toThrow(RangeError);
  });

  it("checks the whole puzzle and persists flags in GEXT", () => {
    const p = samplePuzzle({ circled: [24] });
    p.setSquareValue(0, "A");
    p.setSquareValue(24, "Y");
    expect(p.checkPuzzle()).toEqual({ checked: [0, 24], incorrect: [24] });
    const q = roundTrip(p);
    expect(q.sectionTitles).toEqual(["GEXT"]);
    expect(q.getFlags(0)).toBe(0);
    expect(q.getCell(24)).toMatchObject({ isCircled: true, isIncorrect: true });
  });
});

describe("reveal", () => {
  it("reveals a square, a clue, and the puzzle", () => {
    const p = samplePuzzle();
    expect(p.revealCell(2)).toEqual([2]);
    expect(p.getCell(2)).toMatchObject({ value: "C", isRevealed: true });
    expect(p.revealClue({ direction: "across", number: 7 })).toEqual([10, 11]);
    expect(p.revealCells([12])).toEqual([]);
    expect(p.isSolved).toBe(false);
    expect(p.revealPuzzle()).toHaveLength(24);
    expect(p.isSolved).toBe(true);
    const q = roundTrip(p);
    expect(q.isSolved).toBe(true);
    expect(q.getCells().filter((c) => c.isRevealed)).toHaveLength(24);
  });
});

describe("flags", () => {
  it("sets and clears individual flags", () => {
    const p = samplePuzzle();
    p.setCircled(3, true);
    p.setFlag(3, CellFlag.REVEALED, true);
    expect([p.isCircled(3), p.isRevealed(3), p.hasFlag(3, CellFlag.INCORRECT)]).toEqual([
      true,
      true,
      false,
    ]);
    p.setFlag(3, CellFlag.REVEALED, false);
    expect(p.getFlags(3)).toBe(CellFlag.CIRCLED);
    expect(roundTrip(p).isCircled(3)).toBe(true);
  });
});

describe("timer", () => {
  it("starts, stops, and accumulates", () => {
    const p = samplePuzzle();
    expect(p.getTimer(NOW)).toEqual({ seconds: 0, running: false });
    p.startTimer(NOW);
    p.startTimer(NOW + 5_000); // no-op while running
    expect(p.getTimer(NOW + 10_500)).toEqual({ seconds: 10, running: true });
    p.stopTimer(NOW + 10_500);
    p.stopTimer(NOW + 99_000); // no-op while stopped
    p.startTimer(NOW + 20_000);
    p.stopTimer(NOW + 20_600);
    // 10.5s + 0.6s: fractions accumulate rather than being floored each run.
    expect(p.getTimer(NOW + 50_000)).toEqual({ seconds: 11, running: false });
  });

  it("writes LTIM, folding in the current run", () => {
    const p = samplePuzzle();
    p.setTimer(100, true, NOW);
    const raw = p.toRaw({ now: NOW + 25_000 });
    const ltim = raw.sections.find((s) => s.title === "LTIM")!;
    expect(new TextDecoder().decode(ltim.data)).toBe("125,0");
    p.stopTimer(NOW + 30_000);
    expect(new TextDecoder().decode(p.toRaw().sections[0]!.data)).toBe("130,1");
  });

  it("resumes a running timer from load time", () => {
    const p = samplePuzzle();
    p.setTimer(60, true, NOW);
    const q = Puzzle.fromBytes(p.toBytes({ now: NOW }), { now: NOW + 1_000_000 });
    expect(q.getTimer(NOW + 1_005_000)).toEqual({ seconds: 65, running: true });
  });

  it("reads a stopped timer", () => {
    expect(Puzzle.fromBytes(fixture("played.puz")).timer).toEqual({ seconds: 125, running: false });
    expect(Puzzle.fromBytes(fixture("legacy-app-save.puz")).timer).toEqual({
      seconds: 300,
      running: false,
    });
  });

  it("sets and resets", () => {
    const p = samplePuzzle();
    p.setTimer(42);
    expect(p.timer).toEqual({ seconds: 42, running: false });
    p.startTimer();
    p.setTimer(10);
    expect(p.timer.running).toBe(true);
    p.resetTimer();
    expect(p.timer).toEqual({ seconds: 0, running: false });
    expect(() => p.setTimer(-1)).toThrow(RangeError);
    expect(() => p.setTimer(Number.NaN)).toThrow(RangeError);
  });

  it("does not write LTIM for an untouched timer", () => {
    expect(samplePuzzle().toRaw().sections).toEqual([]);
  });
});

describe("reading played files", () => {
  it("reads entries, rebus, markup, and timer written by this library", () => {
    const p = Puzzle.fromBytes(fixture("played.puz"));
    expect(p.checksums.valid).toBe(true);
    expect([
      p.getSquareValue(0),
      p.getSquareValue(1),
      p.getSquareValue(5),
      p.getSquareValue(13),
      p.getSquareValue(24),
    ]).toEqual(["A", "Z", "F", "MNO", "X"]);
    expect(p.getFlags(0)).toBe(CellFlag.CIRCLED);
    expect(p.getCell(1)).toMatchObject({ isIncorrect: true });
    expect(p.getCell(24)).toMatchObject({ isCircled: true, isRevealed: true });
  });

  it("reads files saved by the legacy app and repairs their checksums", () => {
    const p = Puzzle.fromBytes(fixture("legacy-app-save.puz"));
    expect(p.checksums.valid).toBe(false);
    expect(p.getFlags(0)).toBe(CellFlag.PREVIOUSLY_INCORRECT);
    expect(p.getFlags(1)).toBe(CellFlag.INCORRECT);
    expect(p.isRevealed(24)).toBe(true);
    expect(roundTrip(p).checksums.valid).toBe(true);
  });

  it("keeps existing sections even when they become empty", () => {
    const p = Puzzle.fromBytes(fixture("played.puz"));
    p.clear({ includeRevealed: true });
    p.resetTimer();
    p.setCircled(0, false);
    p.setCircled(24, false);
    const q = roundTrip(p);
    expect(q.sectionTitles).toEqual(["GRBS", "RTBL", "LTIM", "GEXT", "RUSR"]);
    expect(q.getCells().every((c) => c.flags === 0 && c.value === "")).toBe(true);
  });
});

describe("clone", () => {
  it("is fully independent", () => {
    const p = samplePuzzle();
    p.setSquareValue(0, "A");
    p.startTimer(NOW);
    const q = p.clone();
    q.setSquareValue(0, "B");
    q.setCircled(1, true);
    q.title = "Changed";
    q.setClueText({ direction: "across", number: 1 }, "Changed");
    expect([p.getSquareValue(0), p.isCircled(1), p.title, p.getClue("across", 1)?.text]).toEqual([
      "A",
      false,
      "Sample Puzzle",
      "First row",
    ]);
    expect(q.getTimer(NOW + 3_000)).toEqual({ seconds: 3, running: true });
    expect(q.checksums).toBe(p.checksums);
  });
});

describe("fromRaw / toRaw", () => {
  it("copies its input", () => {
    const raw = samplePuzzle().toRaw();
    const p = Puzzle.fromRaw(raw);
    raw.clues[0] = "mutated";
    expect(p.getClue("across", 1)?.text).toBe("First row");
  });

  it("tolerates a clue list shorter than the grid needs", () => {
    const raw = samplePuzzle().toRaw();
    raw.clues = raw.clues.slice(0, 3);
    const p = Puzzle.fromRaw(raw);
    expect(p.getClue("across", 11)?.text).toBe("");
    expect(Puzzle.fromBytes(p.toBytes()).allClues).toHaveLength(12);
  });

  it("preserves diagramless type and block characters", () => {
    const raw = samplePuzzle().toRaw();
    raw.puzzleType = 0x0401;
    raw.solution = raw.solution.replace(".", ":");
    raw.state = raw.state.replace(".", ":");
    const p = Puzzle.fromRaw(raw);
    expect(p.isDiagramless).toBe(true);
    expect(p.isBlock(12)).toBe(true);
    expect(p.toRaw().state[12]).toBe(":");
  });

  it("throws PuzError subclasses", () => {
    expect(() => Puzzle.fromBytes(new Uint8Array(10))).toThrow(PuzError);
  });
});

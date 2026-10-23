import { describe, expect, it } from "vitest";
import {
  PuzChecksumError,
  PuzParseError,
  PuzError,
  cksumRegion,
  parsePuz,
  serializePuz,
  type RawPuz,
} from "../src/index.js";
import { HeaderOffset } from "../src/constants.js";
import { versionAtLeast } from "../src/raw.js";
import { fixture, samplePuzzle } from "./helpers.js";

describe("cksumRegion", () => {
  it("matches hand-computed values", () => {
    expect(cksumRegion(new Uint8Array())).toBe(0);
    expect(cksumRegion(Uint8Array.from([1]))).toBe(1);
    // 1 -> rotate -> 0x8000, + 2
    expect(cksumRegion(Uint8Array.from([1, 2]))).toBe(0x8002);
    expect(cksumRegion(Uint8Array.from([0xff]), 0xffff)).toBe(
      ((0xffff >>> 1) | 0x8000) + 0xff - 0x10000,
    );
  });
});

describe("parsePuz", () => {
  it("reads every field of the sample", () => {
    const { raw, checksums } = parsePuz(fixture("sample.puz"));
    expect(checksums).toEqual({ valid: true, mismatches: [] });
    expect(raw).toMatchObject({
      version: "1.3",
      width: 5,
      height: 5,
      puzzleType: 1,
      solutionState: 0,
      solution: "ABCDEFGHIJKL.MNOPQRSTUVWX",
      state: "------------.------------",
      title: "Sample Puzzle",
      author: "Test Author",
      copyright: "© 2026 Nobody",
      notes: "Some notes",
      sections: [],
    });
    expect(raw.clues).toEqual([
      "First row",
      "First column",
      "Second column",
      "Short top",
      "Fourth column",
      "Last column",
      "Second row",
      "Left stub",
      "Right stub",
      "Fourth row",
      "Short bottom",
      "Last row",
    ]);
  });

  it("round-trips byte-for-byte", () => {
    for (const name of ["sample.puz", "played.puz", "sample-locked-1234.puz"]) {
      const bytes = fixture(name);
      expect(serializePuz(parsePuz(bytes).raw), name).toEqual(new Uint8Array(bytes));
    }
  });

  it("skips leading garbage before the header", () => {
    const bytes = fixture("sample.puz");
    const prefixed = new Uint8Array(bytes.length + 7);
    prefixed.set([1, 2, 3, 4, 5, 6, 7]);
    prefixed.set(bytes, 7);
    expect(parsePuz(prefixed).raw.title).toBe("Sample Puzzle");
  });

  it("ignores trailing garbage", () => {
    const bytes = fixture("played.puz");
    const padded = new Uint8Array(bytes.length + 10).fill(0xff);
    padded.set(bytes);
    expect(parsePuz(padded).raw.sections.map((s) => s.title)).toEqual([
      "GRBS",
      "RTBL",
      "LTIM",
      "GEXT",
      "RUSR",
    ]);
  });

  it("rejects files without the magic string", () => {
    expect(() => parsePuz(new Uint8Array(100))).toThrow(PuzParseError);
  });

  it("rejects truncated files", () => {
    const bytes = fixture("sample.puz");
    expect(() => parsePuz(bytes.subarray(0, 0x34 + 10))).toThrow(/truncated inside the grid/);
    expect(() => parsePuz(bytes.subarray(0, 0x34 + 50 + 20))).toThrow(/clues/);
  });

  it("rejects a zero-size grid", () => {
    const bytes = new Uint8Array(fixture("sample.puz"));
    bytes[HeaderOffset.WIDTH] = 0;
    expect(() => parsePuz(bytes)).toThrow(/grid size/);
  });

  it("reports checksum mismatches, and throws in strict mode", () => {
    const bytes = new Uint8Array(fixture("sample.puz"));
    bytes[0x34] = "Z".charCodeAt(0); // change first solution letter
    const { checksums } = parsePuz(bytes);
    expect(checksums.valid).toBe(false);
    expect(checksums.mismatches.map((m) => m.name)).toEqual(["file", "masked"]);
    expect(() => parsePuz(bytes, { strict: true })).toThrow(PuzChecksumError);
  });

  it("reports a bad CIB checksum", () => {
    const bytes = new Uint8Array(fixture("sample.puz"));
    bytes[HeaderOffset.CIB_CHECKSUM] = bytes[HeaderOffset.CIB_CHECKSUM]! ^ 0xff;
    expect(parsePuz(bytes).checksums.mismatches.map((m) => m.name)).toEqual(["cib"]);
  });

  it("handles a truncated section leniently, but not in strict mode", () => {
    const bytes = fixture("played.puz");
    const cut = bytes.subarray(0, bytes.length - 5);
    expect(parsePuz(cut).raw.sections.map((s) => s.title)).not.toContain("RUSR");
    expect(() => parsePuz(cut, { strict: true })).toThrow(/RUSR is truncated/);
  });

  it("fixes the bad section checksums the legacy app writer produced", () => {
    const bytes = fixture("legacy-app-save.puz");
    const { raw, checksums } = parsePuz(bytes);
    expect(checksums.mismatches.map((m) => m.name)).toEqual(["section:LTIM", "section:GEXT"]);
    expect(parsePuz(serializePuz(raw)).checksums.valid).toBe(true);
  });
});

describe("serializePuz", () => {
  const base = (): RawPuz => parsePuz(fixture("sample.puz")).raw;

  it("only checksums empty strings as Across Lite does", () => {
    const raw = { ...base(), title: "", author: "", copyright: "", notes: "" };
    expect(parsePuz(serializePuz(raw)).checksums.valid).toBe(true);
  });

  it("excludes notes from checksums before version 1.3", () => {
    const raw = { ...base(), version: "1.2" };
    const bytes = serializePuz(raw);
    expect(parsePuz(bytes).checksums.valid).toBe(true);
    // Changing the notes must not invalidate a 1.2 file.
    const changed = serializePuz({ ...raw, notes: "different" });
    expect(changed.subarray(0, 0x34)).toEqual(bytes.subarray(0, 0x34));
  });

  it("round-trips a version that fills all 4 header bytes", () => {
    const bytes = serializePuz({ ...base(), version: "1.2c" });
    expect([...bytes.subarray(0x18, 0x1c)]).toEqual([0x31, 0x2e, 0x32, 0x63]);
    const { raw, checksums } = parsePuz(bytes);
    expect(raw.version).toBe("1.2c");
    expect(checksums.valid).toBe(true);
    expect(serializePuz(raw)).toEqual(bytes);
  });

  it("writes UTF-8 strings for version 2.0", () => {
    const raw = {
      ...base(),
      version: "2.0",
      title: "日本語 😀",
      clues: base().clues.map((c) => `${c} — ✓`),
    };
    const parsed = parsePuz(serializePuz(raw));
    expect(parsed.checksums.valid).toBe(true);
    expect(parsed.raw.title).toBe("日本語 😀");
    expect(parsed.raw.clues[0]).toBe("First row — ✓");
  });

  it("preserves unknown sections and reserved header bytes", () => {
    const raw = base();
    raw.sections.push({ title: "ABCD", data: Uint8Array.from([1, 2, 3]) });
    raw.reserved20 = Uint8Array.from({ length: 12 }, (_, i) => i + 1);
    raw.reserved1C = 0xbeef;
    const parsed = parsePuz(serializePuz(raw)).raw;
    expect(parsed.sections).toEqual([{ title: "ABCD", data: Uint8Array.from([1, 2, 3]) }]);
    expect(parsed.reserved20).toEqual(raw.reserved20);
    expect(parsed.reserved1C).toBe(0xbeef);
  });

  it.each<[string, (raw: RawPuz) => void, RegExp]>([
    ["grid too big", (r) => (r.width = 256), /grid size/],
    ["state length", (r) => (r.state = "--"), /single-byte/],
    ["version length", (r) => (r.version = "1.3.1"), /Version/],
    [
      "section title",
      (r) => r.sections.push({ title: "AB", data: new Uint8Array() }),
      /4 printable/,
    ],
    [
      "section size",
      (r) => r.sections.push({ title: "BIGG", data: new Uint8Array(0x10000) }),
      /too large/,
    ],
  ])("validates %s", (_, mutate, message) => {
    const raw = base();
    mutate(raw);
    expect(() => serializePuz(raw)).toThrow(PuzError);
    expect(() => serializePuz(raw)).toThrow(message);
  });

  it("produces files matching what Puzzle.toBytes writes", () => {
    const puzzle = samplePuzzle();
    expect(serializePuz(puzzle.toRaw())).toEqual(puzzle.toBytes());
  });
});

describe("versionAtLeast", () => {
  it.each([
    ["1.3", true],
    ["1.4", true],
    ["2.0", true],
    ["1.2c", false],
    ["1", false],
    ["abc", false],
  ])("%s >= 1.3 is %s", (version, expected) => {
    expect(versionAtLeast(version, 1, 3)).toBe(expected);
  });
});

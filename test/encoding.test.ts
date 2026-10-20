import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/encoding.js";
import { base64ToBytes, bytesToBase64 } from "../src/base64.js";
import { encodingForVersion } from "../src/encoding.js";

describe("windows-1252", () => {
  it("round-trips every byte value", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(encode(decode(all))).toEqual(all);
  });

  it("decodes Windows-1252 punctuation", () => {
    expect(decode(Uint8Array.from([0x93, 0x48, 0x69, 0x94, 0x85, 0x96, 0x92]))).toBe("“Hi”…–’");
  });

  it("decodes Latin-1 letters", () => {
    expect(decode(Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0xa9]))).toBe("Café ©");
  });

  it("falls back for characters outside the code page", () => {
    expect(decode(encode("a−b ‛x‟ 😀 中"))).toBe("a-b 'x\" ? ?");
  });
});

describe("utf-8", () => {
  it("round-trips multi-byte text", () => {
    const text = "Crème brûlée — 日本語 😀";
    expect(decode(encode(text, "utf-8"), "utf-8")).toBe(text);
  });

  it("matches TextEncoder", () => {
    const text = "Ω≈ç√∫ 𝄞";
    expect(encode(text, "utf-8")).toEqual(new TextEncoder().encode(text));
  });

  it("replaces invalid sequences", () => {
    expect(decode(Uint8Array.from([0x41, 0xff, 0xc3, 0x42, 0xe2, 0x82]), "utf-8")).toBe("A��B��");
  });
});

describe("encodingForVersion", () => {
  it.each([
    ["1.2c", "windows-1252"],
    ["1.3", "windows-1252"],
    ["", "windows-1252"],
    ["2.0", "utf-8"],
  ])("%s -> %s", (version, expected) => {
    expect(encodingForVersion(version)).toBe(expected);
  });
});

describe("base64", () => {
  it("matches Node's Buffer for every length up to 64", () => {
    for (let n = 0; n <= 64; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      const expected = Buffer.from(bytes).toString("base64");
      expect(bytesToBase64(bytes)).toBe(expected);
      expect(base64ToBytes(expected)).toEqual(bytes);
    }
  });

  it("ignores whitespace and accepts the URL-safe alphabet", () => {
    expect(base64ToBytes("+/8A\n+/8A")).toEqual(base64ToBytes("-_8A-_8A"));
  });

  it("rejects invalid characters", () => {
    expect(() => base64ToBytes("ab$d")).toThrow(TypeError);
  });
});

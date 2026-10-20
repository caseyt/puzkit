/**
 * Text encoding for .puz strings.
 *
 * Files with version < 2.0 are nominally ISO-8859-1, but in practice they are written by
 * Windows software and contain Windows-1252 punctuation (smart quotes, dashes) in the
 * 0x80-0x9F range. We decode as Windows-1252, mapping the five bytes it leaves undefined
 * to the matching C1 control code points, so every byte sequence round-trips exactly.
 *
 * Version 2.0+ files use UTF-8.
 *
 * Implemented by hand (no TextEncoder/iconv) so it works on every JS runtime, including
 * React Native's Hermes.
 */

export type PuzEncoding = "windows-1252" | "utf-8";

const CP1252_HIGH: readonly number[] = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

const CP1252_REVERSE = new Map<number, number>(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]));

/** Characters with no Windows-1252 byte, replaced with an ASCII equivalent on encode. */
const FALLBACKS: Record<string, string> = {
  "‛": "'",
  "‟": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "-",
  "−": "-",
  "′": "'",
  "″": '"',
};

/** The encoding a file of the given version uses for its strings. */
export function encodingForVersion(version: string): PuzEncoding {
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) && major >= 2 ? "utf-8" : "windows-1252";
}

export function decode(bytes: Uint8Array, encoding: PuzEncoding = "windows-1252"): string {
  return encoding === "utf-8" ? decodeUtf8(bytes) : decodeCp1252(bytes);
}

export function encode(text: string, encoding: PuzEncoding = "windows-1252"): Uint8Array {
  return encoding === "utf-8" ? encodeUtf8(text) : encodeCp1252(text);
}

function decodeCp1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += String.fromCharCode(b >= 0x80 && b < 0xa0 ? CP1252_HIGH[b - 0x80]! : b);
  }
  return out;
}

function encodeCp1252(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const mapped = CP1252_REVERSE.get(cp);
    if (mapped !== undefined) {
      out.push(mapped);
    } else if (cp < 0x100 && (cp < 0x80 || cp >= 0xa0)) {
      out.push(cp);
    } else {
      const fallback = FALLBACKS[ch] ?? "?";
      for (let i = 0; i < fallback.length; i++) out.push(fallback.charCodeAt(i));
    }
  }
  return Uint8Array.from(out);
}

function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

function decodeUtf8(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    let cp: number;
    let size: number;
    if (b0 < 0x80) {
      cp = b0;
      size = 1;
    } else if (b0 >= 0xc2 && b0 < 0xe0) {
      cp = b0 & 0x1f;
      size = 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      cp = b0 & 0x0f;
      size = 3;
    } else if (b0 >= 0xf0 && b0 < 0xf5) {
      cp = b0 & 0x07;
      size = 4;
    } else {
      out += "�";
      i++;
      continue;
    }
    let valid = i + size <= bytes.length;
    for (let k = 1; valid && k < size; k++) {
      const b = bytes[i + k]!;
      if ((b & 0xc0) !== 0x80) valid = false;
      else cp = (cp << 6) | (b & 0x3f);
    }
    if (!valid) {
      out += "�";
      i++;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += size;
  }
  return out;
}

/** Encode a string that is always ASCII (section titles, LTIM, RTBL). */
export function encodeAscii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function decodeAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

import { type PuzEncoding, decode, decodeAscii, encode, encodeAscii } from "./encoding.js";

export interface TimerData {
  seconds: number;
  running: boolean;
}

/** Parse LTIM: "seconds,state" where state "0" means running and "1" means stopped. */
export function parseLtim(data: Uint8Array): TimerData {
  const [seconds = "", state = "1"] = decodeAscii(data).split(",");
  const parsed = Number.parseInt(seconds.trim(), 10);
  return {
    seconds: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    running: state.trim() === "0",
  };
}

export function serializeLtim(timer: TimerData): Uint8Array {
  return encodeAscii(`${Math.max(0, Math.floor(timer.seconds))},${timer.running ? 0 : 1}`);
}

/** Parse RTBL: " 0:STAR; 1:HEART;" into a key -> answer map. */
export function parseRtbl(data: Uint8Array): Map<number, string> {
  const table = new Map<number, string>();
  for (const entry of decodeAscii(data).split(";")) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const key = Number.parseInt(entry.slice(0, colon).trim(), 10);
    if (Number.isFinite(key)) table.set(key, entry.slice(colon + 1));
  }
  return table;
}

export function serializeRtbl(table: ReadonlyMap<number, string>): Uint8Array {
  let out = "";
  for (const [key, value] of [...table].sort((a, b) => a[0] - b[0])) {
    out += `${String(key).padStart(2, " ")}:${value};`;
  }
  return encodeAscii(out);
}

/** Parse RUSR: one null-terminated string per square; empty means no user rebus. */
export function parseRusr(
  data: Uint8Array,
  squareCount: number,
  encoding: PuzEncoding,
): (string | undefined)[] {
  const result: (string | undefined)[] = new Array(squareCount).fill(undefined);
  let pos = 0;
  for (let i = 0; i < squareCount && pos < data.length; i++) {
    let end = data.indexOf(0, pos);
    if (end < 0) end = data.length;
    if (end > pos) result[i] = decode(data.subarray(pos, end), encoding);
    pos = end + 1;
  }
  return result;
}

export function serializeRusr(
  entries: readonly (string | undefined)[],
  encoding: PuzEncoding,
): Uint8Array {
  const parts: number[] = [];
  for (const entry of entries) {
    if (entry) parts.push(...encode(entry, encoding));
    parts.push(0);
  }
  return Uint8Array.from(parts);
}

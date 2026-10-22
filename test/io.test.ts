import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { Puzzle, collectBytes } from "../src/index.js";
import {
  readPuzzleFile,
  streamPuzzleFile,
  toNodeReadable,
  writePuzzleFile,
  writePuzzleStream,
} from "../src/node.js";
import { bytesToStream, toUint8Array } from "../src/stream.js";
import { fixture, samplePuzzle } from "./helpers.js";

const bytes = new Uint8Array(fixture("played.puz"));

function chunks(data: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) out.push(data.subarray(i, i + size));
  return out;
}

describe("binary inputs", () => {
  it("accepts Uint8Array, Buffer, ArrayBuffer, and DataView", () => {
    const inputs = [
      bytes,
      Buffer.from(bytes),
      bytes.slice().buffer,
      new DataView(bytes.slice().buffer),
    ];
    for (const input of inputs) expect(Puzzle.fromBytes(input).title).toBe("Sample Puzzle");
  });

  it("respects the byteOffset of views", () => {
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 8);
    expect(toUint8Array(new DataView(padded.buffer, 8))).toEqual(bytes);
  });

  it("rejects other types", () => {
    expect(() => toUint8Array("nope" as never)).toThrow(TypeError);
  });

  it("round-trips through base64", () => {
    const p = Puzzle.fromBase64(Buffer.from(bytes).toString("base64"));
    expect(p.toBase64()).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("streams", () => {
  it("reads a chunked WHATWG ReadableStream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks(bytes, 7)) controller.enqueue(c);
        controller.close();
      },
    });
    expect((await Puzzle.fromStream(stream)).getSquareValue(13)).toBe("MNO");
  });

  it("reads a Node.js Readable", async () => {
    const p = await Puzzle.fromStream(Readable.from(chunks(bytes, 3).map((c) => Buffer.from(c))));
    expect(p.toBytes()).toEqual(bytes);
  });

  it("reads async and sync iterables", async () => {
    async function* gen() {
      yield* chunks(bytes, 100);
    }
    expect(await collectBytes(gen())).toEqual(bytes);
    expect(await collectBytes(chunks(bytes, 50))).toEqual(bytes);
    expect(await collectBytes([])).toEqual(new Uint8Array());
  });

  it("writes a ReadableStream", async () => {
    const p = Puzzle.fromBytes(bytes);
    expect(await collectBytes(p.toStream())).toEqual(bytes);
  });

  it("explains when ReadableStream is unavailable", () => {
    const original = globalThis.ReadableStream;
    // @ts-expect-error simulating a runtime without web streams
    delete globalThis.ReadableStream;
    try {
      expect(() => bytesToStream(bytes)).toThrow(/not available/);
    } finally {
      globalThis.ReadableStream = original;
    }
  });
});

describe("node helpers", () => {
  const dir = mkdtempSync(join(tmpdir(), "puzts-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes and reads files", async () => {
    const path = join(dir, "a.puz");
    const p = samplePuzzle();
    p.setSquareValue(0, "A");
    await writePuzzleFile(path, p);
    expect((await readPuzzleFile(path)).getSquareValue(0)).toBe("A");
    expect((await streamPuzzleFile(path)).getSquareValue(0)).toBe("A");
  });

  it("writes to a path or a Writable stream", async () => {
    const p = Puzzle.fromBytes(bytes);
    const path = join(dir, "b.puz");
    await writePuzzleStream(path, p);
    expect(new Uint8Array(readFileSync(path))).toEqual(bytes);

    const received: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, done) {
        received.push(chunk);
        done();
      },
    });
    await writePuzzleStream(sink, p);
    expect(new Uint8Array(Buffer.concat(received))).toEqual(bytes);
  });

  it("converts to a Node Readable", async () => {
    expect(await collectBytes(toNodeReadable(Puzzle.fromBytes(bytes)))).toEqual(bytes);
  });
});

/** Anything that yields chunks of bytes: a WHATWG ReadableStream, a Node.js Readable, or an (async) iterable. */
export type ByteSource =
  ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

/** Anything accepted as a complete binary .puz file. */
export type BinaryInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export function toUint8Array(input: BinaryInput): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("Expected a Uint8Array, ArrayBuffer, or ArrayBufferView");
}

/** Read a byte source to completion. */
export async function collectBytes(source: ByteSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  if (isReadableStream(source)) {
    // Use getReader() rather than async iteration, which some browsers lack on ReadableStream.
    const reader = source.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(toUint8Array(value));
      }
    } finally {
      reader.releaseLock();
    }
  } else if (Symbol.asyncIterator in source) {
    for await (const chunk of source) chunks.push(toUint8Array(chunk));
  } else {
    for (const chunk of source) chunks.push(toUint8Array(chunk));
  }

  if (chunks.length === 1) {
    // Return a plain Uint8Array view even if the chunk is a subclass like Node's Buffer.
    const only = chunks[0]!;
    return new Uint8Array(only.buffer, only.byteOffset, only.byteLength);
  }
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function isReadableStream(source: ByteSource): source is ReadableStream<Uint8Array> {
  return typeof (source as ReadableStream).getReader === "function";
}

/** Wrap bytes in a WHATWG ReadableStream. */
export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  if (typeof ReadableStream === "undefined") {
    throw new Error("ReadableStream is not available in this runtime; use toBytes() instead");
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

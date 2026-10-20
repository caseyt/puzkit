/** Base class for every error thrown by this library. */
export class PuzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The input could not be parsed as a .puz file. */
export class PuzParseError extends PuzError {}

/** A checksum stored in the file does not match its contents (only thrown in `strict` mode). */
export class PuzChecksumError extends PuzError {
  constructor(
    message: string,
    readonly report: import("./checksum.js").ChecksumReport,
  ) {
    super(message);
  }
}

/** The operation needs the solution, but the solution is scrambled or absent. */
export class PuzLockedError extends PuzError {}

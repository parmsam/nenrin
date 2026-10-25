/** Kept separate from package.ts so the main bundle doesn't pull in unzip/zstd code. */
export class InvalidPackageError extends Error {
  constructor(message = 'This file isn’t an Anki package.') {
    super(message);
  }
}

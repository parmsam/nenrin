/// <reference lib="webworker" />
// Parses Anki packages (and CrowdAnki exports) off the main thread, and writes .apkg exports:
// unzip, zstd and SQLite (sql.js) are all heavy.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { readCrowdAnki } from '../lib/anki/crowdanki';
import { InvalidPackageError, readAnkiPackage } from '../lib/anki/package';
import { writeAnkiPackage, type ApkgInput } from '../lib/anki/write';

export type WorkerRequest = { bytes: ArrayBuffer; crowdAnki?: boolean } | { write: ApkgInput };

export type WorkerResponse =
  | { ok: true; pkg: import('../lib/anki/package').AnkiPackage }
  | { ok: true; apkg: Uint8Array }
  | { ok: false; error: string; invalid: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let sql: Promise<SqlJsStatic> | undefined;

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    if ('write' in e.data) {
      sql ??= initSqlJs({ locateFile: () => wasmUrl });
      const apkg = writeAnkiPackage(e.data.write, await sql);
      scope.postMessage({ ok: true, apkg } satisfies WorkerResponse, [apkg.buffer as ArrayBuffer]);
      return;
    }
    const bytes = new Uint8Array(e.data.bytes);
    let pkg;
    if (e.data.crowdAnki) pkg = readCrowdAnki(bytes);
    else {
      sql ??= initSqlJs({ locateFile: () => wasmUrl });
      pkg = readAnkiPackage(bytes, await sql);
    }
    // Hand media buffers over instead of copying them.
    const buffers = [...new Set(pkg.media.map((m) => m.data.buffer as ArrayBuffer))];
    scope.postMessage({ ok: true, pkg } satisfies WorkerResponse, buffers);
  } catch (err) {
    scope.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      invalid: err instanceof InvalidPackageError,
    } satisfies WorkerResponse);
  }
};

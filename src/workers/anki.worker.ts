/// <reference lib="webworker" />
// Parses Anki packages (and CrowdAnki exports) off the main thread: unzip, zstd and SQLite
// (sql.js) are all heavy.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { readCrowdAnki } from '../lib/anki/crowdanki';
import { InvalidPackageError, readAnkiPackage } from '../lib/anki/package';

export type WorkerResponse =
  | { ok: true; pkg: import('../lib/anki/package').AnkiPackage }
  | { ok: false; error: string; invalid: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let sql: Promise<SqlJsStatic> | undefined;

scope.onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; crowdAnki?: boolean }>) => {
  try {
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

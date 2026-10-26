import type { WorkerRequest, WorkerResponse } from '../../workers/anki.worker';
import { isCrowdAnkiFile } from './crowdanki';
import { InvalidPackageError } from './errors';
import type { AnkiPackage } from './package';
import type { ApkgInput } from './write';

/** Runs one request in a fresh worker. */
async function inWorker(req: WorkerRequest, transfer: Transferable[] = []) {
  const worker = new Worker(new URL('../../workers/anki.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    const res = await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message || 'The Anki worker crashed.'));
      worker.postMessage(req, transfer);
    });
    if (!res.ok) throw res.invalid ? new InvalidPackageError() : new Error(res.error);
    return res;
  } finally {
    worker.terminate();
  }
}

/** Reads an .apkg / .colpkg, or a CrowdAnki .zip / deck.json, in a Web Worker. */
export async function parsePackageInWorker(file: File): Promise<AnkiPackage> {
  const bytes = await file.arrayBuffer();
  const res = await inWorker({ bytes, crowdAnki: isCrowdAnkiFile(file.name) }, [bytes]);
  if (!('pkg' in res)) throw new Error('Unexpected reply from the Anki worker.');
  return res.pkg;
}

/** Writes an .apkg in a Web Worker. */
export async function writePackageInWorker(input: ApkgInput): Promise<Uint8Array<ArrayBuffer>> {
  const res = await inWorker({ write: input }, [...new Set(input.media.map((m) => m.data.buffer))]);
  if (!('apkg' in res)) throw new Error('Unexpected reply from the Anki worker.');
  // Transferred from the worker: a plain ArrayBuffer, never shared.
  return res.apkg as Uint8Array<ArrayBuffer>;
}

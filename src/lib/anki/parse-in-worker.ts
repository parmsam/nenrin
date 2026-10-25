import type { WorkerResponse } from '../../workers/anki.worker';
import { InvalidPackageError } from './errors';
import type { AnkiPackage } from './package';

/** Reads an .apkg / .colpkg in a Web Worker. */
export async function parsePackageInWorker(file: Blob): Promise<AnkiPackage> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL('../../workers/anki.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    const res = await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message || 'The import worker crashed.'));
      worker.postMessage({ bytes }, [bytes]);
    });
    if (!res.ok) throw res.invalid ? new InvalidPackageError() : new Error(res.error);
    return res.pkg;
  } finally {
    worker.terminate();
  }
}

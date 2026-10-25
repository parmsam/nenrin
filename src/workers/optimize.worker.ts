/// <reference lib="webworker" />
// Runs the official FSRS optimizer (fsrs-rs compiled to WASM, via fsrs-browser). Needs a
// cross-origin isolated page for SharedArrayBuffer; see optimize.html and public/sw-custom.js.
import init, { DEFAULT_PARAMETERS, Fsrs } from 'fsrs-browser';
import wasmUrl from 'fsrs-browser/fsrs_browser_bg.wasm?url';

export interface OptimizeRequest {
  ratings: Uint32Array;
  deltaTs: Uint32Array;
  lengths: Uint32Array;
}
export type OptimizeResponse =
  { ok: true; params: number[]; defaults: number[]; ms: number } | { ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<OptimizeRequest>) => {
  try {
    await init({ module_or_path: wasmUrl });
    const started = performance.now();
    const fsrs = new Fsrs();
    const params = fsrs.computeParameters(
      e.data.ratings,
      e.data.deltaTs,
      e.data.lengths,
      null,
      true,
    );
    scope.postMessage({
      ok: true,
      params: Array.from(params),
      defaults: Array.from(DEFAULT_PARAMETERS()),
      ms: Math.round(performance.now() - started),
    } satisfies OptimizeResponse);
  } catch (err) {
    scope.postMessage({ ok: false, error: String(err) } satisfies OptimizeResponse);
  }
};

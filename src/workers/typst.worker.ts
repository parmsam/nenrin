/// <reference lib="webworker" />
// Compiles ```typst blocks to SVG off the main thread with typst.ts (Apache-2.0). The ~29 MB
// compiler and the fonts load only when Typst is enabled in Settings; the service worker then
// serves them from the "nenrin-typst" cache, so this works offline. Packages (@preview/…)
// aren't available: they'd need the network.
import { createTypstCompiler, createTypstRenderer, loadFonts } from '@myriaddreamin/typst.ts';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/wasm?url';
import { TYPST_FONTS, TYPST_INK, typstDocument } from '../lib/render/typst';

export type TypstRequest = { id: number; source: string };
export type TypstResponse = { id: number; svg: string } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const base = new URL(import.meta.env.BASE_URL, scope.location.origin).href;

let ready:
  | Promise<{
      compiler: ReturnType<typeof createTypstCompiler>;
      renderer: ReturnType<typeof createTypstRenderer>;
    }>
  | undefined;

function setup() {
  ready ??= (async () => {
    const compiler = createTypstCompiler();
    const renderer = createTypstRenderer();
    await Promise.all([
      compiler.init({
        getModule: () => compilerWasm,
        beforeBuild: [loadFonts(TYPST_FONTS.map((f) => `${base}typst/fonts/${f}`))],
      }),
      renderer.init({ getModule: () => rendererWasm }),
    ]);
    return { compiler, renderer };
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

/** Diagnostics as one readable line each, with line numbers for the user's own source. */
function describe(diagnostics: unknown[] | undefined): string {
  if (!diagnostics?.length) return 'Typst couldn’t compile this block.';
  return diagnostics
    .map((d) => (typeof d === 'string' ? d : ((d as { message?: string }).message ?? String(d))))
    .join('\n');
}

scope.onmessage = async (e: MessageEvent<TypstRequest>) => {
  const { id, source } = e.data;
  try {
    const { compiler, renderer } = await setup();
    compiler.addSource('/main.typ', typstDocument(source));
    const { result, diagnostics } = await compiler.compile({
      mainFilePath: '/main.typ',
      diagnostics: 'unix',
    });
    if (!result) throw new Error(describe(diagnostics));
    const svg = await renderer.renderSvg({
      format: 'vector',
      artifactContent: result as Uint8Array,
      // No scripts, and no Typst CSS (it has page-wide rules); CardView scopes what's needed.
      data_selection: { body: true, defs: true, css: false, js: false },
    });
    // The marker color (text) and plain black (Typst's default for lines and table strokes)
    // follow the card's color, so light and dark mode both read well.
    scope.postMessage({
      id,
      svg: svg.replace(new RegExp(`${TYPST_INK}|#000000\\b|#000\\b`, 'gi'), 'currentColor'),
    } satisfies TypstResponse);
  } catch (err) {
    scope.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies TypstResponse);
  }
};

/**
 * Typst blocks: opt-in rendering (see src/workers/typst.worker.ts). Shared constants and the
 * main-thread side: enable/disable, the worker, and an SVG cache by source hash.
 */

import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/wasm?url';

/** Fonts in public/typst/fonts/ (from typst-assets; licenses in NOTICE.txt there). */
export const TYPST_FONTS = [
  'LibertinusSerif-Regular.otf',
  'LibertinusSerif-Bold.otf',
  'LibertinusSerif-Italic.otf',
  'LibertinusSerif-BoldItalic.otf',
  'NewCMMath-Regular.otf',
  'DejaVuSansMono.ttf',
];

/** Cache Storage name for the compiler and fonts; sw-custom.js serves from it. */
export const TYPST_CACHE = 'nenrin-typst';

/** Text is set in this color, which the worker swaps for currentColor so it follows the theme. */
export const TYPST_INK = '#010203';

/** Wraps a card's Typst source: a tight page that grows with the content, in card-sized text. */
export function typstDocument(source: string): string {
  return [
    '#set page(width: auto, height: auto, margin: 3pt, fill: none)',
    `#set text(size: 17pt, fill: rgb("${TYPST_INK}"))`,
    source,
  ].join('\n');
}

/** Bump when the worker's output changes (post-processing, typst.ts), so cached SVG is redone. */
const RENDER_VERSION = 1;

const ENABLED_KEY = 'nenrin:typst';

/** Typst is enabled per device, after its files are downloaded. */
export function typstEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** URLs to download when enabling: the two WebAssembly modules and the fonts. */
function assetUrls(): string[] {
  const base = import.meta.env.BASE_URL;
  return [compilerWasm, rendererWasm, ...TYPST_FONTS.map((f) => `${base}typst/fonts/${f}`)].map(
    (u) => new URL(u, location.href).href,
  );
}

/** Downloads everything Typst needs into its cache, reporting progress (0–1). */
export async function enableTypst(onProgress?: (done: number) => void): Promise<void> {
  const urls = assetUrls();
  const cache = await caches.open(TYPST_CACHE);
  let done = 0;
  await Promise.all(
    urls.map(async (url) => {
      if (!(await cache.match(url))) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Couldn’t download ${url.split('/').pop()} (${res.status})`);
        await cache.put(url, res);
      }
      onProgress?.(++done / urls.length);
    }),
  );
  localStorage.setItem(ENABLED_KEY, '1');
}

/** Turns Typst off and frees the space. */
export async function disableTypst(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Nothing stored.
  }
  await caches.delete(TYPST_CACHE);
  await caches.delete(`${TYPST_CACHE}-svg`);
  worker?.terminate();
  worker = undefined;
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (svg: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/typst.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ id: number; svg?: string; error?: string }>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.svg !== undefined) p?.resolve(e.data.svg);
      else p?.reject(new Error(e.data.error ?? 'Typst failed'));
    };
    worker.onerror = (e) => {
      for (const p of pending.values())
        p.reject(new Error(e.message || 'The Typst worker crashed.'));
      pending.clear();
      worker = undefined;
    };
  }
  return worker;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const svgKey = async (source: string) =>
  new URL(`typst-svg/${await sha256(`${RENDER_VERSION}\n${typstDocument(source)}`)}`, location.href)
    .href;

/** A block's SVG if it was compiled before on this device. */
export async function cachedTypstSvg(source: string): Promise<string | undefined> {
  const hit = await (await caches.open(`${TYPST_CACHE}-svg`)).match(await svgKey(source));
  return hit?.text();
}

/** Compiled SVG for a block, from the cache (by source hash) or the worker. */
export async function typstSvg(source: string): Promise<string> {
  const cached = await cachedTypstSvg(source);
  if (cached !== undefined) return cached;
  const svg = await new Promise<string>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, source });
  });
  const svgCache = await caches.open(`${TYPST_CACHE}-svg`);
  await svgCache.put(
    await svgKey(source),
    new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }),
  );
  return svg;
}
